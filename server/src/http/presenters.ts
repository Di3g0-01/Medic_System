/**
 * Dominio → contrato del frontend (src/types). Aquí se resuelve el mapeo
 * Patient.cui ⇄ dpi_cui, ids de institución "i1" ⇄ 1, estado 'abierta' ⇄
 * 'programada', receta plana ⇄ diagnóstico → tratamiento → receta, etc.
 */
import type * as Api from "@contracts";
import { medicineLabel, type Doctor, type ExamType, type Medicine, type Vaccine } from "../domain/Catalog.ts";
import type { Appointment, Consultation } from "../domain/Consultation.ts";
import type { LabOrder } from "../domain/LabOrder.ts";
import type { Patient } from "../domain/Patient.ts";
import type { Admission, GrowthRecord, VaccinationStatus } from "../domain/Specialty.ts";
import type { PublicUser } from "../domain/User.ts";
import type { InstitutionId } from "../domain/values.ts";
import type { EngineDescriptor, Institution } from "../ports/index.ts";

export const institutionKey = (id: InstitutionId) => `i${id}`;
export const institutionFromKey = (key: string): InstitutionId => Number(String(key).replace(/^i/, ""));

const INSTITUTION_TYPE: Record<Institution["kind"], Api.InstitutionType> = {
  hospital: "hospital",
  clinica: "odontologica",
  laboratorio: "laboratorio",
  pediatrico: "pediatrica",
};

export function presentInstitution(i: Institution, engine?: EngineDescriptor): Api.Institution {
  const shortName = i.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return { id: institutionKey(i.id), name: i.name, shortName, type: INSTITUTION_TYPE[i.kind], ...(engine && { engine: engine.label }) };
}

export function presentUser(u: PublicUser & { specialty?: string | null }): Api.User {
  return {
    id: String(u.id),
    name: u.fullName,
    username: u.username,
    role: u.role,
    institutionId: institutionKey(u.institutionId),
    ...(u.specialty && { specialty: u.specialty }),
    blocked: u.status !== "activo",
    ...(u.doctorId && { doctorId: u.doctorId }),
  };
}

/** 13 dígitos → "2784 10293 0101" (formato de la UI). */
export const formatDpi = (dpi: string) => (/^\d{13}$/.test(dpi) ? `${dpi.slice(0, 4)} ${dpi.slice(4, 9)} ${dpi.slice(9)}` : dpi);

export function presentPatient(p: Patient): Api.Patient {
  return {
    id: p.id,
    firstName: p.firstName,
    middleName: p.middleName ?? undefined,
    lastName: p.lastName,
    secondLastName: p.secondLastName ?? undefined,
    birthDate: p.birthDate,
    sex: p.sex.toUpperCase() as Api.Patient["sex"],
    cui: formatDpi(p.dpi),
    phone: p.phone ?? "",
    email: p.email ?? "",
    address: p.address ?? "",
    municipality: p.municipality ?? "",
    department: p.department ?? "",
    bloodType: p.bloodType?.toUpperCase() ?? "",
    status: p.status,
    institutionId: institutionKey(p.institutionId),
    lastVisit: (p.lastVisit ?? p.registeredAt).slice(0, 10),
    allergies: p.allergies.map((a) => ({ substance: a.substance, reaction: a.reaction ?? "", severity: a.severity ?? "leve" })),
    emergencyContacts: p.emergencyContacts.map((c) => ({
      name: c.name,
      relationship: c.relationship,
      phone: c.phone,
      ...(c.alternativePhone && { alternativePhone: c.alternativePhone }),
    })),
  };
}

export function presentAppointment(a: Appointment): Api.Appointment {
  return {
    id: a.id,
    patientId: a.patientId,
    doctorId: a.doctorId,
    institutionId: institutionKey(a.institutionId),
    date: a.scheduledAt.slice(0, 10),
    time: a.scheduledAt.slice(11, 16),
    reason: a.reason,
    status: a.status,
  };
}

export const formatDuration = (days: number | null) => (days == null ? "" : `${days} ${days === 1 ? "día" : "días"}`);

/** La consulta clínica de la UI aplana diagnósticos y recetas. 'programada' con notas = borrador 'abierta'. */
export function presentConsultation(c: Consultation): Api.Consultation {
  const doctor = c.doctorName ?? "";
  return {
    id: c.id,
    patientId: c.patientId,
    appointmentId: c.id,
    date: c.scheduledAt.slice(0, 10),
    reason: c.reason,
    notes: c.notes ?? "",
    doctor,
    status: c.status === "atendida" ? "atendida" : "abierta",
    diagnoses: c.diagnoses.map((d) => ({
      id: d.id!,
      patientId: c.patientId,
      date: d.date,
      cie10: d.cie10 ?? "",
      description: d.description,
      type: d.type ?? "presuntivo",
      doctor,
    })),
    prescriptions: c.diagnoses.flatMap((d) =>
      d.treatments.flatMap((t) =>
        t.prescriptions.map((p) => ({
          medicine: p.medicineName ?? p.medicineId,
          dose: p.dose,
          frequency: p.frequency,
          duration: formatDuration(p.durationDays),
          instructions: p.instructions ?? "",
          diagnosisId: d.id,
        })),
      ),
    ),
  };
}

export function presentLabOrder(o: LabOrder): Api.LabOrder {
  return {
    id: o.id,
    patientId: o.patientId,
    consultationId: o.consultationId,
    type: o.examTypeName,
    requestedAt: o.requestedAt.slice(0, 10),
    status: o.status,
    requestedBy: o.requestedBy,
    parameters: o.results.map((r) => ({
      name: r.parameter,
      value: r.value,
      range: r.referenceRange ?? "",
      ...(r.observations && { observations: r.observations }),
    })),
  };
}

export const presentGrowth = (g: GrowthRecord): Api.GrowthRecord => ({
  date: g.date,
  weight: g.weightKg,
  height: g.heightCm,
  headCircumference: g.headCircumferenceCm ?? 0,
});

export function presentVaccine(v: VaccinationStatus): Api.VaccineRecord {
  const dose = v.vaccine.requiredDoses === 1 ? "Única" : `Dosis ${v.doseNumber}`;
  return v.applied
    ? { name: v.vaccine.name, dose, date: v.appliedOn!, ...(v.lot && { lot: v.lot }), status: "aplicada" }
    : { name: v.vaccine.name, dose, status: "pendiente" };
}

export const presentAdmission = (a: Admission): Api.Admission => ({
  id: a.id,
  admissionDate: a.admittedAt.slice(0, 10),
  bed: a.bed ?? "",
  reason: a.reason,
  ...(a.dischargedAt && { dischargeDate: a.dischargedAt.slice(0, 10) }),
});

export const presentDoctor = (d: Doctor): Api.Doctor => ({ id: d.id, name: d.fullName, ...(d.specialty && { specialty: d.specialty }) });

// Catálogos: la UI usa {name, detail, status}. El modelo no tiene estado de catálogo → 'activo'.
export const presentMedicine = (m: Medicine): Api.CatalogItem => ({ id: m.id, name: medicineLabel(m), detail: m.presentation ?? "", status: "activo" });
export const presentVaccineItem = (v: Vaccine): Api.CatalogItem => ({
  id: v.id,
  name: v.name,
  detail: v.requiredDoses === 1 ? "Dosis única" : `Esquema de ${v.requiredDoses} dosis`,
  status: "activo",
});
export const presentExamType = (e: ExamType): Api.CatalogItem => ({ id: e.id, name: e.name, detail: e.description ?? "", status: "activo" });
