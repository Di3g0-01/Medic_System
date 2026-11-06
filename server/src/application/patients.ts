/** Módulo de Pacientes y Contactos — OP-PAC-01..05. */
import { NotFoundError } from "../domain/errors.ts";
import {
  assertPatientTransition,
  assertUnique,
  normalizeDpi,
  normalizeEmail,
  prepareAllergies,
  prepareContacts,
  preparePatient,
  preparePatientChanges,
  type Allergy,
  type EmergencyContact,
  type NewPatient,
  type Patient,
  type PatientChanges,
} from "../domain/Patient.ts";
import { authorize } from "../domain/security.ts";
import type { PatientStatus } from "../domain/values.ts";
import { audit, type UseCaseContext } from "./context.ts";

async function load(c: UseCaseContext, id: string): Promise<Patient> {
  const patient = await c.repos.patients.findById(id);
  if (!patient) throw new NotFoundError("Paciente no encontrado");
  return patient;
}

/** OP-PAC-01: alta validando unicidad de DPI y correo; registra alergias y contactos. */
export async function registerPatient(c: UseCaseContext, input: Omit<NewPatient, "institutionId">): Promise<Patient> {
  authorize(c.actor.role, "patient:write");
  const patient = preparePatient({ ...input, institutionId: c.actor.institutionId });
  const [byDpi, byEmail] = await Promise.all([
    c.repos.patients.findByDpi(patient.dpi),
    patient.email ? c.repos.patients.findByEmail(patient.email) : null,
  ]);
  assertUnique(byDpi, byEmail);
  const created = await c.repos.patients.create(patient);
  await audit(c, { action: "paciente.alta", entity: "paciente", entityId: created.id });
  return created;
}

/** Validación previa del formulario: true = disponible. */
export async function checkPatientUniqueness(c: UseCaseContext, dpi: string, email: string | null) {
  authorize(c.actor.role, "patient:write");
  const normalizedEmail = normalizeEmail(email);
  const [byDpi, byEmail] = await Promise.all([
    c.repos.patients.findByDpi(normalizeDpi(dpi)),
    normalizedEmail ? c.repos.patients.findByEmail(normalizedEmail) : null,
  ]);
  return { dpi: !byDpi, email: !byEmail };
}

/** OP-PAC-02 */
export async function addEmergencyContacts(c: UseCaseContext, id: string, contacts: EmergencyContact[]) {
  authorize(c.actor.role, "patient:write");
  await load(c, id);
  return (await c.repos.patients.addEmergencyContacts(id, prepareContacts(contacts)))!;
}

/** OP-PAC-02: solo agrega alergias que el paciente aún no tiene. */
export async function addAllergies(c: UseCaseContext, id: string, allergies: Allergy[]) {
  authorize(c.actor.role, "patient:write");
  const patient = await load(c, id);
  const known = new Set(patient.allergies.map((a) => a.substance.toLowerCase()));
  const fresh = prepareAllergies(allergies).filter((a) => !known.has(a.substance.toLowerCase()));
  return fresh.length ? (await c.repos.patients.addAllergies(id, fresh))! : patient;
}

/** OP-PAC-03 */
export async function getPatient(c: UseCaseContext, id: string) {
  authorize(c.actor.role, "patient:read");
  return load(c, id);
}

export async function findPatientByDpi(c: UseCaseContext, dpi: string) {
  authorize(c.actor.role, "patient:read");
  const patient = await c.repos.patients.findByDpi(normalizeDpi(dpi));
  if (!patient) throw new NotFoundError("No existe un paciente con ese DPI/CUI");
  return patient;
}

export async function listPatients(c: UseCaseContext) {
  authorize(c.actor.role, "patient:read");
  return c.repos.patients.list();
}

/** OP-PAC-05: archivado lógico / fallecimiento preservando trazabilidad. */
export async function changePatientStatus(c: UseCaseContext, id: string, status: PatientStatus) {
  authorize(c.actor.role, "patient:archive");
  const patient = await load(c, id);
  assertPatientTransition(patient.status, status);
  if (patient.status === status) return patient;
  const updated = (await c.repos.patients.updateStatus(id, status))!;
  await audit(c, { action: `paciente.estado.${status}`, entity: "paciente", entityId: id, detail: { anterior: patient.status } });
  return updated;
}

/** OP-PAC-04: residencia, teléfonos, correo y (opcionalmente) estado. */
export async function updatePatient(c: UseCaseContext, id: string, input: PatientChanges & { status?: PatientStatus }) {
  authorize(c.actor.role, "patient:write");
  const { status, ...rest } = input;
  const changes = preparePatientChanges(rest);
  const patient = await load(c, id);
  if (changes.email && changes.email !== patient.email) assertUnique(null, await c.repos.patients.findByEmail(changes.email), id);
  let updated = Object.keys(changes).length ? (await c.repos.patients.update(id, changes))! : patient;
  if (status && status !== patient.status) updated = await changePatientStatus(c, id, status);
  return updated;
}
