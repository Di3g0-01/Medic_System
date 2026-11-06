/** Mappers documento Firestore ⇄ dominio (Centro Médico Pediátrico). */
import { Timestamp, type DocumentData, type DocumentSnapshot } from "firebase-admin/firestore";
import type { Doctor, ExamType, Medicine, Vaccine } from "../../domain/Catalog.ts";
import type { Appointment, Consultation, Diagnosis, Prescription, Treatment } from "../../domain/Consultation.ts";
import type { LabOrder } from "../../domain/LabOrder.ts";
import type { Allergy, EmergencyContact, Patient } from "../../domain/Patient.ts";
import type { GrowthRecord, VaccinationDose } from "../../domain/Specialty.ts";
import type { IsoDate, LocalDateTime } from "../../domain/values.ts";
import { dateOnly, fromNaiveDate, toNaiveDate } from "../shared/naiveTime.ts";

export const ts = (v: LocalDateTime | IsoDate) => Timestamp.fromDate(toNaiveDate(v));
export const local = (v: Timestamp) => fromNaiveDate(v.toDate());
export const day = (v: Timestamp) => dateOnly(v.toDate());
const newId = () => crypto.randomUUID();

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

export function toPatient(snap: DocumentSnapshot): Patient {
  const d = snap.data()!;
  return {
    id: snap.id,
    firstName: d.primer_nombre,
    middleName: d.segundo_nombre ?? null,
    lastName: d.primer_apellido,
    secondLastName: d.segundo_apellido ?? null,
    birthDate: day(d.fecha_nacimiento),
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
    registeredAt: local(d.fecha_registro),
    lastVisit: d.ultima_visita ? local(d.ultima_visita) : null,
    allergies: (d.alergias ?? []).map((a: DocumentData) => ({ substance: a.alergia, reaction: a.reaccion ?? null, severity: a.severidad ?? null })),
    emergencyContacts: (d.contactos_emergencia ?? []).map((c: DocumentData) => ({
      name: c.nombre_completo,
      relationship: c.parentesco,
      phone: c.telefono,
      alternativePhone: c.telefono_alternativo ?? null,
    })),
  };
}

export function toAppointment(snap: DocumentSnapshot): Appointment {
  const d = snap.data()!;
  return {
    id: snap.id,
    patientId: d.id_paciente,
    doctorId: d.id_medico,
    doctorName: d.nombre_medico,
    institutionId: d.id_institucion,
    scheduledAt: local(d.fecha_hora),
    reason: d.motivo_consulta,
    status: d.estado,
  };
}

/** Receta sellada: guarda la etiqueta del medicamento al momento de prescribir (desnormalización selectiva). */
export const prescriptionDoc = (p: Prescription, medicineName: string) => ({
  id: newId(),
  dosis: p.dose,
  frecuencia: p.frequency,
  duracion_dias: p.durationDays,
  indicaciones: p.instructions,
  id_medicamento: p.medicineId,
  medicamento: medicineName,
});

export const treatmentDoc = (t: Treatment, names: Map<string, string>) => ({
  id: newId(),
  descripcion: t.description,
  fecha_inicio: ts(t.startDate),
  fecha_fin_estimada: t.estimatedEndDate ? ts(t.estimatedEndDate) : null,
  observaciones: t.observations,
  recetas: t.prescriptions.map((p) => prescriptionDoc(p, names.get(p.medicineId) ?? "")),
});

export const diagnosisDoc = (d: Diagnosis, names: Map<string, string>) => ({
  id: newId(),
  codigo_cie10: d.cie10,
  descripcion: d.description,
  tipo: d.type,
  fecha: ts(d.date),
  tratamientos: d.treatments.map((t) => treatmentDoc(t, names)),
});

export function toConsultation(snap: DocumentSnapshot): Consultation {
  const d = snap.data()!;
  return {
    ...toAppointment(snap),
    notes: d.notas_clinicas ?? null,
    diagnoses: (d.diagnosticos ?? []).map(
      (dx: DocumentData): Diagnosis => ({
        id: dx.id,
        cie10: dx.codigo_cie10 ?? null,
        description: dx.descripcion,
        type: dx.tipo ?? null,
        date: day(dx.fecha),
        treatments: dx.tratamientos.map(
          (t: DocumentData): Treatment => ({
            id: t.id,
            description: t.descripcion,
            startDate: day(t.fecha_inicio),
            estimatedEndDate: t.fecha_fin_estimada ? day(t.fecha_fin_estimada) : null,
            observations: t.observaciones ?? null,
            prescriptions: t.recetas.map(
              (r: DocumentData): Prescription => ({
                id: r.id,
                medicineId: r.id_medicamento,
                medicineName: r.medicamento,
                dose: r.dosis,
                frequency: r.frecuencia,
                durationDays: r.duracion_dias ?? null,
                instructions: r.indicaciones ?? null,
              }),
            ),
          }),
        ),
      }),
    ),
  };
}

export const toMedicine = (s: DocumentSnapshot): Medicine => {
  const d = s.data()!;
  return { id: s.id, genericName: d.nombre_generico, brandName: d.nombre_comercial ?? null, presentation: d.presentacion ?? null, concentration: d.concentracion ?? null };
};
export const toVaccine = (s: DocumentSnapshot): Vaccine => ({ id: s.id, name: s.get("nombre_vacuna"), requiredDoses: s.get("dosis_requeridas") });
export const toExamType = (s: DocumentSnapshot): ExamType => ({ id: s.id, name: s.get("nombre"), description: s.get("descripcion") ?? null });
export const toDoctor = (s: DocumentSnapshot): Doctor => {
  const d = s.data()!;
  return { id: s.id, fullName: d.nombre_completo, licenseNumber: d.no_colegiado, specialty: d.especialidad ?? null, status: d.estado, institutionId: d.id_institucion };
};

export function toLabOrder(s: DocumentSnapshot): LabOrder {
  const d = s.data()!;
  return {
    id: s.id,
    consultationId: d.id_consulta,
    patientId: d.id_paciente,
    examTypeId: d.id_tipo_examen,
    examTypeName: d.nombre_tipo,
    requestedAt: local(d.fecha_solicitud),
    requestedBy: d.solicitado_por,
    status: d.estado,
    results: (d.resultados ?? []).map((r: DocumentData) => ({
      parameter: r.parametro,
      value: r.valor_obtenido,
      referenceRange: r.rango_referencia ?? null,
      observations: r.observaciones ?? null,
    })),
  };
}

export const toGrowth = (s: DocumentSnapshot): GrowthRecord => {
  const d = s.data()!;
  return {
    id: s.id,
    consultationId: d.id_consulta,
    date: day(d.fecha_medicion),
    weightKg: d.peso_kg,
    heightCm: d.talla_cm,
    headCircumferenceCm: d.perimetro_cefalico ?? null,
  };
};

export const toDose = (s: DocumentSnapshot): VaccinationDose => {
  const d = s.data()!;
  return { id: s.id, consultationId: d.id_consulta, vaccineId: d.id_vacuna, doseNumber: d.no_dosis, appliedOn: day(d.fecha_aplicacion), lot: d.lote ?? null };
};
