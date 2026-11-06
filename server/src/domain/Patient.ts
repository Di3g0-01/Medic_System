import { ConflictError, ValidationError, assert } from "./errors.ts";
import {
  BLOOD_TYPES,
  isIsoDate,
  type InstitutionId,
  type IsoDate,
  type LocalDateTime,
  type PatientStatus,
  type Severity,
  type Sex,
} from "./values.ts";

export interface Allergy {
  substance: string;
  reaction: string | null;
  severity: Severity | null;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  alternativePhone: string | null;
}

/** Datos demográficos editables o capturados en la admisión. */
export interface PatientData {
  firstName: string;
  middleName: string | null;
  lastName: string;
  secondLastName: string | null;
  birthDate: IsoDate;
  sex: Sex;
  /** DPI/CUI normalizado: 13 dígitos. */
  dpi: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  municipality: string | null;
  department: string | null;
  /** Grupo sanguíneo en minúsculas ('o+'). */
  bloodType: string | null;
}

export interface NewPatient extends PatientData {
  institutionId: InstitutionId;
  allergies: Allergy[];
  emergencyContacts: EmergencyContact[];
}

export interface Patient extends NewPatient {
  id: string;
  status: PatientStatus;
  registeredAt: LocalDateTime;
  /** Fecha/hora de la última consulta atendida, si existe. */
  lastVisit: LocalDateTime | null;
}

/** Campos modificables por OP-PAC-04 (residencia, teléfonos, correo). */
export type PatientChanges = Partial<
  Pick<PatientData, "phone" | "email" | "address" | "municipality" | "department">
>;

const empty = (v: string | null | undefined) => (v == null || v.trim() === "" ? null : v.trim());

export function normalizeDpi(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

export function assertValidDpi(dpi: string): void {
  assert(/^\d{13}$/.test(dpi), "El DPI/CUI debe tener 13 dígitos");
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = empty(raw);
  if (!email) return null;
  assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Correo electrónico inválido");
  return email.toLowerCase();
}

export function normalizeBloodType(raw: string | null | undefined): string | null {
  const value = empty(raw)?.toLowerCase() ?? null;
  if (value) assert((BLOOD_TYPES as readonly string[]).includes(value), "Tipo de sangre inválido");
  return value;
}

function normalizeAllergies(list: Allergy[]): Allergy[] {
  const seen = new Set<string>();
  return list
    .map((a) => ({ substance: a.substance.trim(), reaction: empty(a.reaction), severity: a.severity ?? null }))
    .filter((a) => {
      if (!a.substance) return false;
      const key = a.substance.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeContacts(list: EmergencyContact[]): EmergencyContact[] {
  return list
    .filter((c) => c.name.trim())
    .map((c) => {
      assert(c.relationship.trim(), `El parentesco de ${c.name} es obligatorio`);
      assert(c.phone.trim(), `El teléfono de ${c.name} es obligatorio`);
      return {
        name: c.name.trim(),
        relationship: c.relationship.trim(),
        phone: c.phone.trim(),
        alternativePhone: empty(c.alternativePhone),
      };
    });
}

/** OP-PAC-01: valida y normaliza un paciente antes de persistirlo (regla única para los 4 motores). */
export function preparePatient(input: NewPatient): NewPatient {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  assert(firstName, "El primer nombre es obligatorio");
  assert(lastName, "El primer apellido es obligatorio");
  assert(isIsoDate(input.birthDate), "Fecha de nacimiento inválida");
  assert(input.birthDate <= new Date().toISOString().slice(0, 10), "La fecha de nacimiento no puede ser futura");
  assert(["m", "f", "o"].includes(input.sex), "Sexo inválido");
  const dpi = normalizeDpi(input.dpi);
  assertValidDpi(dpi);
  return {
    ...input,
    firstName,
    lastName,
    middleName: empty(input.middleName),
    secondLastName: empty(input.secondLastName),
    dpi,
    phone: empty(input.phone),
    email: normalizeEmail(input.email),
    address: empty(input.address),
    municipality: empty(input.municipality),
    department: empty(input.department),
    bloodType: normalizeBloodType(input.bloodType),
    allergies: normalizeAllergies(input.allergies),
    emergencyContacts: normalizeContacts(input.emergencyContacts),
  };
}

export function preparePatientChanges(changes: PatientChanges): PatientChanges {
  const out: PatientChanges = {};
  for (const key of ["phone", "address", "municipality", "department"] as const) {
    if (key in changes) out[key] = empty(changes[key]);
  }
  if ("email" in changes) out.email = normalizeEmail(changes.email);
  return out;
}

export function prepareAllergies(list: Allergy[]): Allergy[] {
  return normalizeAllergies(list);
}

export function prepareContacts(list: EmergencyContact[]): EmergencyContact[] {
  const contacts = normalizeContacts(list);
  assert(contacts.length > 0, "Debe registrar al menos un contacto de emergencia");
  return contacts;
}

/** Unicidad de DPI y correo (OP-PAC-01). Los motores la respaldan con índices únicos / centinelas. */
export function assertUnique(existingByDpi: Patient | null, existingByEmail: Patient | null, selfId?: string): void {
  if (existingByDpi && existingByDpi.id !== selfId) throw new ConflictError("Ya existe un paciente con este DPI/CUI");
  if (existingByEmail && existingByEmail.id !== selfId) throw new ConflictError("Este correo ya está registrado");
}

const PATIENT_TRANSITIONS: Record<PatientStatus, PatientStatus[]> = {
  activo: ["archivado", "fallecido"],
  archivado: ["activo", "fallecido"],
  fallecido: [],
};

/** OP-PAC-05: archivado lógico preservando trazabilidad; 'fallecido' es terminal. */
export function assertPatientTransition(from: PatientStatus, to: PatientStatus): void {
  if (from === to) return;
  if (!PATIENT_TRANSITIONS[from].includes(to))
    throw new ValidationError(`No se puede cambiar el estado del paciente de '${from}' a '${to}'`);
}

export function assertPatientCanBeScheduled(patient: Patient): void {
  if (patient.status !== "activo") throw new ValidationError(`El paciente está ${patient.status}; no se le pueden programar consultas`);
}
