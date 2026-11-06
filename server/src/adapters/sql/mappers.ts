/** Mappers fila relacional (snake_case, español) ⇄ dominio (camelCase). Compartidos por PostgreSQL y MySQL. */
import type { Doctor, ExamType, Medicine, Vaccine } from "../../domain/Catalog.ts";
import { medicineLabel } from "../../domain/Catalog.ts";
import type { Appointment, Consultation, Diagnosis, Prescription, Treatment } from "../../domain/Consultation.ts";
import type { LabOrder, LabResult } from "../../domain/LabOrder.ts";
import type { Allergy, EmergencyContact, Patient, PatientChanges } from "../../domain/Patient.ts";
import type { Admission } from "../../domain/Specialty.ts";
import type { IsoDate, LocalDateTime } from "../../domain/values.ts";
import type { Row } from "./SqlSession.ts";

/** "2026-03-24 08:30:00" → "2026-03-24T08:30" */
export const toLocal = (v: unknown): LocalDateTime | null => (v == null ? null : String(v).replace(" ", "T").slice(0, 16));
export const toDate = (v: unknown): IsoDate | null => (v == null ? null : String(v).slice(0, 10));
/** "2026-03-24T08:30" → "2026-03-24 08:30:00" */
export const toSqlTimestamp = (v: LocalDateTime) => `${v.replace("T", " ")}:00`;
/** Ids externos son texto; en SQL son enteros. Un id no numérico no existe. */
export const sqlId = (id: string): number | null => (/^\d+$/.test(id) ? Number(id) : null);
const str = (v: unknown) => (v == null ? null : String(v));

export const PATIENT_COLUMNS: Record<keyof PatientChanges, string> = {
  phone: "telefono",
  email: "correo",
  address: "direccion",
  municipality: "municipio",
  department: "departamento",
};

export const toAllergy = (r: Row): Allergy => ({ substance: r.alergia, reaction: r.reaccion ?? null, severity: r.severidad ?? null });

export const toContact = (r: Row): EmergencyContact => ({
  name: r.nombre_completo,
  relationship: r.parentesco,
  phone: r.telefono,
  alternativePhone: r.telefono_alternativo ?? null,
});

export function toPatient(r: Row, allergies: Allergy[], contacts: EmergencyContact[]): Patient {
  return {
    id: String(r.id_paciente),
    firstName: r.primer_nombre,
    middleName: r.segundo_nombre ?? null,
    lastName: r.primer_apellido,
    secondLastName: r.segundo_apellido ?? null,
    birthDate: toDate(r.fecha_nacimiento)!,
    sex: r.sexo,
    dpi: r.dpi_cui,
    phone: r.telefono ?? null,
    email: r.correo ?? null,
    address: r.direccion ?? null,
    municipality: r.municipio ?? null,
    department: r.departamento ?? null,
    bloodType: r.tipo_sangre ?? null,
    status: r.estado,
    institutionId: Number(r.id_institucion),
    registeredAt: toLocal(r.fecha_registro)!,
    lastVisit: toLocal(r.ultima_visita),
    allergies,
    emergencyContacts: contacts,
  };
}

export const toAppointment = (r: Row): Appointment => ({
  id: String(r.id_consulta),
  patientId: String(r.id_paciente),
  doctorId: String(r.id_medico),
  doctorName: r.nombre_medico ?? undefined,
  institutionId: Number(r.id_institucion),
  scheduledAt: toLocal(r.fecha_hora)!,
  reason: r.motivo_consulta,
  status: r.estado,
});

export const toPrescription = (r: Row): Prescription => ({
  id: String(r.id_receta),
  medicineId: String(r.id_medicamento),
  medicineName: medicineLabel(toMedicine(r)),
  dose: r.dosis,
  frequency: r.frecuencia,
  durationDays: r.duracion_dias == null ? null : Number(r.duracion_dias),
  instructions: r.indicaciones ?? null,
});

export const toTreatment = (r: Row, prescriptions: Prescription[]): Treatment => ({
  id: String(r.id_tratamiento),
  description: r.descripcion,
  startDate: toDate(r.fecha_inicio)!,
  estimatedEndDate: toDate(r.fecha_fin_estimada),
  observations: r.observaciones ?? null,
  prescriptions,
});

export const toDiagnosis = (r: Row, treatments: Treatment[]): Diagnosis => ({
  id: String(r.id_diagnostico),
  cie10: r.codigo_cie10 ?? null,
  description: r.descripcion,
  type: r.tipo ?? null,
  date: toDate(r.fecha)!,
  treatments,
});

export const toConsultation = (r: Row, diagnoses: Diagnosis[]): Consultation => ({
  ...toAppointment(r),
  notes: r.notas_clinicas ?? null,
  diagnoses,
});

export const toMedicine = (r: Row): Medicine => ({
  id: String(r.id_medicamento),
  genericName: r.nombre_generico,
  brandName: r.nombre_comercial ?? null,
  presentation: r.presentacion ?? null,
  concentration: r.concentracion ?? null,
});

export const toVaccine = (r: Row): Vaccine => ({ id: String(r.id_vacuna), name: r.nombre_vacuna, requiredDoses: Number(r.dosis_requeridas) });

export const toExamType = (r: Row): ExamType => ({ id: String(r.id_tipo_examen), name: r.nombre, description: r.descripcion ?? null });

export const toDoctor = (r: Row): Doctor => ({
  id: String(r.id_medico),
  fullName: r.nombre_completo,
  licenseNumber: r.no_colegiado,
  specialty: r.especialidad ?? null,
  status: r.estado,
  institutionId: Number(r.id_institucion),
});

export const toResult = (r: Row): LabResult => ({
  parameter: r.parametro,
  value: r.valor_obtenido,
  referenceRange: r.rango_referencia ?? null,
  observations: r.observaciones ?? null,
});

export const toLabOrder = (r: Row, results: LabResult[]): LabOrder => ({
  id: String(r.id_examen),
  consultationId: String(r.id_consulta),
  patientId: String(r.id_paciente),
  examTypeId: String(r.id_tipo_examen),
  examTypeName: r.nombre_tipo,
  requestedAt: toLocal(r.fecha_solicitud)!,
  requestedBy: r.nombre_medico,
  status: r.estado,
  results,
});

export const toAdmission = (r: Row): Admission => ({
  id: String(r.id_internamiento),
  consultationId: String(r.id_consulta),
  admittedAt: toLocal(r.fecha_ingreso)!,
  dischargedAt: toLocal(r.fecha_egreso),
  bed: str(r.numero_cama),
  reason: r.motivo_ingreso,
});

/** Agrupa filas hijas por clave foránea. */
export function groupBy<T>(rows: Row[], key: string, map: (r: Row) => T): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = String(r[key]);
    out.set(k, [...(out.get(k) ?? []), map(r)]);
  }
  return out;
}
