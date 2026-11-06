/** Mappers documento BSON ⇄ dominio (Laboratorio Clínico). */
import { ObjectId, type Document } from "mongodb";
import { medicineLabel, type Doctor, type ExamType, type Medicine, type Vaccine } from "../../domain/Catalog.ts";
import type { Appointment, Consultation, Diagnosis, Prescription, Treatment } from "../../domain/Consultation.ts";
import type { LabOrder, LabResult } from "../../domain/LabOrder.ts";
import type { Allergy, EmergencyContact, Patient } from "../../domain/Patient.ts";
import { dateOnly, fromNaiveDate, toNaiveDate } from "../shared/naiveTime.ts";

/** Ids externos son texto; un texto que no es ObjectId no existe. */
export const oid = (id: string): ObjectId | null => (/^[0-9a-f]{24}$/i.test(id) ? new ObjectId(id) : null);
export const oidOrThrowaway = (id: string) => oid(id) ?? new ObjectId();

export const PATIENT_FIELDS = {
  phone: "telefono",
  email: "correo",
  address: "direccion",
  municipality: "municipio",
  department: "departamento",
} as const;

export const allergyDoc = (a: Allergy) => ({ alergia: a.substance, reaccion: a.reaction, severidad: a.severity });
export const contactDoc = (c: EmergencyContact) => ({
  nombre_completo: c.name,
  parentesco: c.relationship,
  telefono: c.phone,
  telefono_alternativo: c.alternativePhone,
});

export function toPatient(d: Document): Patient {
  return {
    id: d._id.toHexString(),
    firstName: d.primer_nombre,
    middleName: d.segundo_nombre ?? null,
    lastName: d.primer_apellido,
    secondLastName: d.segundo_apellido ?? null,
    birthDate: dateOnly(d.fecha_nacimiento),
    sex: d.sexo,
    dpi: d.dpi_cui,
    phone: d.telefono ?? null,
    email: d.correo ?? null,
    address: d.direccion ?? null,
    municipality: d.municipio ?? null,
    department: d.departamento ?? null,
    bloodType: d.tipo_sangre ?? null,
    status: d.estado,
    institutionId: d.id_institucion,
    registeredAt: fromNaiveDate(d.fecha_registro),
    lastVisit: d.ultima_visita ? fromNaiveDate(d.ultima_visita) : null,
    allergies: (d.alergias ?? []).map((a: Document) => ({ substance: a.alergia, reaction: a.reaccion ?? null, severity: a.severidad ?? null })),
    emergencyContacts: (d.contactos_emergencia ?? []).map((c: Document) => ({
      name: c.nombre_completo,
      relationship: c.parentesco,
      phone: c.telefono,
      alternativePhone: c.telefono_alternativo ?? null,
    })),
  };
}

export function toAppointment(d: Document, doctorNames: Map<string, string>): Appointment {
  const doctorId = d.id_medico.toHexString();
  return {
    id: d._id.toHexString(),
    patientId: d.id_paciente.toHexString(),
    doctorId,
    doctorName: doctorNames.get(doctorId),
    institutionId: d.id_institucion,
    scheduledAt: fromNaiveDate(d.fecha_hora),
    reason: d.motivo_consulta,
    status: d.estado,
  };
}

// Árbol clínico embebido: diagnosticos[].tratamientos[].recetas[]
export const prescriptionDoc = (p: Prescription) => ({
  _id: new ObjectId(),
  dosis: p.dose,
  frecuencia: p.frequency,
  duracion_dias: p.durationDays,
  indicaciones: p.instructions,
  id_medicamento: oidOrThrowaway(p.medicineId),
});

export const treatmentDoc = (t: Treatment) => ({
  _id: new ObjectId(),
  descripcion: t.description,
  fecha_inicio: toNaiveDate(t.startDate),
  fecha_fin_estimada: t.estimatedEndDate ? toNaiveDate(t.estimatedEndDate) : null,
  observaciones: t.observations,
  recetas: t.prescriptions.map(prescriptionDoc),
});

export const diagnosisDoc = (d: Diagnosis) => ({
  _id: new ObjectId(),
  codigo_cie10: d.cie10,
  descripcion: d.description,
  tipo: d.type,
  fecha: toNaiveDate(d.date),
  tratamientos: d.treatments.map(treatmentDoc),
});

/** ObjectIds de medicamentos referenciados por un árbol de diagnósticos (para verificar integridad referencial). */
export const medicineRefs = (diagnoses: Document[]): ObjectId[] =>
  diagnoses.flatMap((d) => d.tratamientos.flatMap((t: Document) => t.recetas.map((r: Document) => r.id_medicamento as ObjectId)));

export function toConsultation(d: Document, doctorNames: Map<string, string>, medicines: Map<string, Medicine>): Consultation {
  return {
    ...toAppointment(d, doctorNames),
    notes: d.notas_clinicas ?? null,
    diagnoses: (d.diagnosticos ?? []).map(
      (dx: Document): Diagnosis => ({
        id: dx._id.toHexString(),
        cie10: dx.codigo_cie10 ?? null,
        description: dx.descripcion,
        type: dx.tipo ?? null,
        date: dateOnly(dx.fecha),
        treatments: dx.tratamientos.map(
          (t: Document): Treatment => ({
            id: t._id.toHexString(),
            description: t.descripcion,
            startDate: dateOnly(t.fecha_inicio),
            estimatedEndDate: t.fecha_fin_estimada ? dateOnly(t.fecha_fin_estimada) : null,
            observations: t.observaciones ?? null,
            prescriptions: t.recetas.map((r: Document): Prescription => {
              const medicineId = r.id_medicamento.toHexString();
              const med = medicines.get(medicineId);
              return {
                id: r._id.toHexString(),
                medicineId,
                medicineName: med ? medicineLabel(med) : undefined,
                dose: r.dosis,
                frequency: r.frecuencia,
                durationDays: r.duracion_dias ?? null,
                instructions: r.indicaciones ?? null,
              };
            }),
          }),
        ),
      }),
    ),
  };
}

export const toMedicine = (d: Document): Medicine => ({
  id: d._id.toHexString(),
  genericName: d.nombre_generico,
  brandName: d.nombre_comercial ?? null,
  presentation: d.presentacion ?? null,
  concentration: d.concentracion ?? null,
});
export const toVaccine = (d: Document): Vaccine => ({ id: d._id.toHexString(), name: d.nombre_vacuna, requiredDoses: d.dosis_requeridas });
export const toExamType = (d: Document): ExamType => ({ id: d._id.toHexString(), name: d.nombre, description: d.descripcion ?? null });
export const toDoctor = (d: Document): Doctor => ({
  id: d._id.toHexString(),
  fullName: d.nombre_completo,
  licenseNumber: d.no_colegiado,
  specialty: d.especialidad ?? null,
  status: d.estado,
  institutionId: d.id_institucion,
});

/** Los campos extra de cada resultado (unidad, antibiograma…) se conservan en BSON aunque el dominio exponga los comunes. */
export const toResult = (r: Document): LabResult => ({
  parameter: r.parametro,
  value: r.valor_obtenido,
  referenceRange: r.rango_referencia ?? null,
  observations: r.observaciones ?? null,
});

export function toLabOrder(d: Document, examTypes: Map<string, string>, requestedBy: Map<string, string>): LabOrder {
  const consultationId = d.id_consulta.toHexString();
  return {
    id: d._id.toHexString(),
    consultationId,
    patientId: d.id_paciente.toHexString(),
    examTypeId: d.id_tipo_examen.toHexString(),
    examTypeName: examTypes.get(d.id_tipo_examen.toHexString()) ?? "",
    requestedAt: fromNaiveDate(d.fecha_solicitud),
    requestedBy: requestedBy.get(consultationId) ?? "",
    status: d.estado,
    results: (d.resultados ?? []).map(toResult),
  };
}
