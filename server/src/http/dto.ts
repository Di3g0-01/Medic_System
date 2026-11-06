/**
 * DTOs de entrada (contrato del frontend) validados con zod y traducidos a
 * entradas de los casos de uso. Solo forma/tipos: las reglas de negocio
 * siguen viviendo en el dominio.
 */
import { z } from "zod";
import type { Medicine } from "../domain/Catalog.ts";
import type { LabResult } from "../domain/LabOrder.ts";
import type { NewPatient, PatientChanges } from "../domain/Patient.ts";
import type { PrescriptionInput } from "../application/encounters.ts";
import type { PatientStatus } from "../domain/values.ts";
import { institutionFromKey } from "./presenters.ts";

const text = z.string().trim();
const optionalText = z.string().nullish().transform((v) => (v == null || v.trim() === "" ? null : v.trim()));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida (HH:MM)");
const patientStatus = z.enum(["activo", "archivado", "fallecido"]);

export const loginDto = z.object({ username: text.min(1, "Ingrese el usuario"), password: z.string().min(1, "Ingrese la contraseña") });

const allergyDto = z.object({ substance: z.string(), reaction: optionalText, severity: z.enum(["leve", "moderada", "grave"]).nullish() });
const contactDto = z.object({ name: z.string(), relationship: z.string(), phone: z.string(), alternativePhone: optionalText });

export const patientDto = z
  .object({
    firstName: z.string(),
    middleName: optionalText,
    lastName: z.string(),
    secondLastName: optionalText,
    birthDate: date,
    sex: z.enum(["F", "M", "O", "f", "m", "o"]),
    cui: z.string(),
    phone: optionalText,
    email: optionalText,
    address: optionalText,
    municipality: optionalText,
    department: optionalText,
    bloodType: optionalText,
    allergies: z.array(allergyDto).default([]),
    emergencyContacts: z.array(contactDto).default([]),
  })
  .transform(
    ({ cui, sex, allergies, ...p }): Omit<NewPatient, "institutionId"> => ({
      ...p,
      dpi: cui,
      sex: sex.toLowerCase() as NewPatient["sex"],
      allergies: allergies.map((a) => ({ ...a, severity: a.severity ?? null })),
    }),
  );

export const patientUpdateDto = z
  .object({
    phone: optionalText.optional(),
    email: optionalText.optional(),
    address: optionalText.optional(),
    municipality: optionalText.optional(),
    department: optionalText.optional(),
    status: patientStatus.optional(),
  })
  .transform((v) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) as PatientChanges & { status?: PatientStatus });

export const statusDto = z.object({ status: patientStatus });
export const uniqueDto = z.object({ cui: z.string(), email: optionalText });
export const contactsDto = z.object({ contacts: z.array(contactDto).min(1) });
export const allergiesDto = z.object({ allergies: z.array(allergyDto).min(1).transform((l) => l.map((a) => ({ ...a, severity: a.severity ?? null }))) });

export const appointmentDto = z
  .object({ patientId: z.string().min(1, "Seleccione un paciente"), doctorId: z.string().nullish(), date, time, reason: z.string() })
  .transform((a) => ({ patientId: a.patientId, doctorId: a.doctorId, scheduledAt: `${a.date}T${a.time}`, reason: a.reason }));

export const appointmentUpdateDto = z.object({
  date: date.optional(),
  time: time.optional(),
  reason: z.string().optional(),
  doctorId: z.string().optional(),
  status: z.enum(["programada", "atendida", "cancelada"]).optional(),
});
export const appointmentStatusDto = z.object({ status: z.enum(["programada", "atendida", "cancelada"]) });

/** "5 días" → 5; "" → null. */
export const parseDuration = (value: string | number | null | undefined): number | null => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : Number.NaN;
};

const prescriptionDto = z.object({
  medicine: z.string().optional(),
  medicineId: z.string().optional(),
  dose: z.string(),
  frequency: z.string(),
  duration: z.union([z.string(), z.number()]).nullish(),
  instructions: optionalText,
  diagnosisId: z.string().optional(),
});
const toPrescription = (p: z.infer<typeof prescriptionDto>, diagnosisIndex?: number): PrescriptionInput => ({
  medicineId: p.medicineId,
  medicineName: p.medicine,
  dose: p.dose,
  frequency: p.frequency,
  durationDays: parseDuration(p.duration),
  instructions: p.instructions,
  ...(diagnosisIndex !== undefined && diagnosisIndex >= 0 && { diagnosisIndex }),
});

const diagnosisDto = z.object({
  id: z.string().optional(),
  cie10: z.string(),
  description: z.string(),
  type: z.enum(["presuntivo", "diferencial", "definitivo"]).nullish(),
  date: date.optional(),
});

/** Consultation del frontend → AttendConsultation. 'abierta' = borrador (estado 'programada'). */
export const consultationDto = (today: string) =>
  z
    .object({
      patientId: z.string().min(1),
      appointmentId: z.string().nullish(),
      reason: z.string(),
      notes: z.string().nullish(),
      status: z.enum(["abierta", "atendida"]),
      diagnoses: z.array(diagnosisDto).default([]),
      prescriptions: z.array(prescriptionDto).default([]),
    })
    .transform((c) => ({
      appointmentId: c.appointmentId ?? null,
      patientId: c.patientId,
      reason: c.reason,
      notes: c.notes ?? null,
      status: c.status === "atendida" ? ("atendida" as const) : ("programada" as const),
      diagnoses: c.diagnoses.map((d) => ({ cie10: d.cie10, description: d.description, type: d.type ?? null, date: d.date ?? today })),
      prescriptions: c.prescriptions.map((p) => toPrescription(p, p.diagnosisId ? c.diagnoses.findIndex((d) => d.id === p.diagnosisId) : undefined)),
    }));

export const diagnosisCreateDto = (today: string) =>
  diagnosisDto.transform((d) => ({ cie10: d.cie10, description: d.description, type: d.type ?? null, date: d.date ?? today }));

export const treatmentDto = (today: string) =>
  z
    .object({
      description: z.string(),
      startDate: date.optional(),
      estimatedEndDate: date.nullish(),
      observations: optionalText,
      prescriptions: z.array(prescriptionDto).default([]),
    })
    .transform((t) => ({
      description: t.description,
      startDate: t.startDate ?? today,
      estimatedEndDate: t.estimatedEndDate ?? null,
      observations: t.observations,
      prescriptions: t.prescriptions.map((p) => toPrescription(p)),
    }));

const parameterDto = z.object({ name: z.string(), value: z.string().default(""), range: z.string().nullish(), observations: optionalText });
const toResult = (p: z.infer<typeof parameterDto>): LabResult => ({ parameter: p.name, value: p.value, referenceRange: p.range ?? null, observations: p.observations });

export const labOrderDto = z
  .object({ consultationId: z.string().nullish(), type: z.string().optional(), examTypeId: z.string().optional(), parameters: z.array(parameterDto).default([]) })
  .transform((o) => ({ consultationId: o.consultationId, examTypeName: o.type, examTypeId: o.examTypeId, parameters: o.parameters.map(toResult) }));

export const labUpdateDto = z
  .object({ parameters: z.array(parameterDto).optional(), status: z.enum(["solicitado", "en_proceso", "completado"]).optional() })
  .transform((o) => ({ results: o.parameters?.map(toResult), status: o.status }));

const role = z.enum(["medico", "secretaria", "admin"]);
const institutionKeyDto = z.string().regex(/^i?\d+$/, "Institución inválida").transform(institutionFromKey);

export const userCreateDto = z
  .object({ name: z.string(), username: z.string(), role, institutionId: institutionKeyDto, specialty: z.string().nullish() })
  .transform((u) => ({ fullName: u.name, username: u.username, role: u.role, institutionId: u.institutionId, specialty: u.specialty ?? null }));

export const userUpdateDto = z
  .object({ name: z.string().optional(), role: role.optional(), blocked: z.boolean().optional(), institutionId: institutionKeyDto.optional() })
  .transform((u) => ({ fullName: u.name, role: u.role, blocked: u.blocked, institutionId: u.institutionId }));

/** Ítem de catálogo de la UI {name, detail} → entidad del catálogo correspondiente. */
export const catalogItemDto = z.object({ name: z.string(), detail: z.string().default("") });

export function splitMedicineName(name: string, presentation: string): Omit<Medicine, "id"> {
  const match = name.trim().match(/^(.*?)\s+(\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ml|ui|%)(?:\/\S+)?)$/i);
  return {
    genericName: match ? match[1] : name.trim(),
    concentration: match ? match[2] : null,
    brandName: null,
    presentation: presentation.trim() || null,
  };
}

export const requiredDosesFrom = (detail: string) => Number(detail.match(/\d+/)?.[0] ?? 1);
