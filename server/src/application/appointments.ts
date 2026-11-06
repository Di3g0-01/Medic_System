/** Módulo de Consulta Externa (agenda) — OP-CON-01, 03, 04. Proyección confidencial. */
import {
  assertConsultationTransition,
  assertSlotAvailable,
  assertValidSlot,
  prepareAppointment,
  type Appointment,
} from "../domain/Consultation.ts";
import { NotFoundError, ValidationError, assert } from "../domain/errors.ts";
import { assertPatientCanBeScheduled } from "../domain/Patient.ts";
import { authorize } from "../domain/security.ts";
import type { ConsultationStatus, LocalDateTime } from "../domain/values.ts";
import type { AppointmentFilter } from "../ports/index.ts";
import { audit, type UseCaseContext } from "./context.ts";

async function loadDoctor(c: UseCaseContext, doctorId: string | null | undefined) {
  assert(doctorId, "Debe indicar el médico de la consulta");
  const doctor = await c.repos.doctors.findById(doctorId);
  if (!doctor) throw new NotFoundError("Médico no encontrado en la institución");
  if (doctor.status !== "activo") throw new ValidationError("El médico está inactivo");
  return doctor;
}

async function loadAppointment(c: UseCaseContext, id: string): Promise<Appointment> {
  const appointment = await c.repos.consultations.findById(id);
  if (!appointment) throw new NotFoundError("Consulta no encontrada");
  return appointment;
}

/** OP-CON-01: programa validando paciente activo y disponibilidad del médico. */
export async function scheduleAppointment(
  c: UseCaseContext,
  input: { patientId: string; doctorId?: string | null; scheduledAt: LocalDateTime; reason: string },
) {
  authorize(c.actor.role, "appointment:write");
  const doctor = await loadDoctor(c, input.doctorId || c.actor.doctorId);
  const patient = await c.repos.patients.findById(input.patientId);
  if (!patient) throw new NotFoundError("Paciente no encontrado");
  assertPatientCanBeScheduled(patient);
  const appointment = prepareAppointment({ ...input, doctorId: doctor.id, institutionId: c.actor.institutionId });
  assertSlotAvailable(await c.repos.consultations.findByDoctorAt(doctor.id, appointment.scheduledAt));
  const created = await c.repos.consultations.create(appointment);
  await audit(c, { action: "consulta.programada", entity: "consulta", entityId: created.id });
  return created;
}

/** OP-CON-03: reprogramar (fecha/hora, motivo o médico) una consulta programada. */
export async function rescheduleAppointment(
  c: UseCaseContext,
  id: string,
  changes: { scheduledAt?: LocalDateTime; reason?: string; doctorId?: string },
) {
  authorize(c.actor.role, "appointment:write");
  const current = await loadAppointment(c, id);
  assertConsultationTransition(current.status, "programada");
  const doctorId = changes.doctorId ? (await loadDoctor(c, changes.doctorId)).id : current.doctorId;
  const scheduledAt = changes.scheduledAt ?? current.scheduledAt;
  assertValidSlot(scheduledAt);
  if (scheduledAt !== current.scheduledAt || doctorId !== current.doctorId)
    assertSlotAvailable(await c.repos.consultations.findByDoctorAt(doctorId, scheduledAt), id);
  const reason = changes.reason?.trim();
  if (changes.reason !== undefined) assert(reason, "El motivo de consulta es obligatorio");
  return (await c.repos.consultations.reschedule(id, { scheduledAt, reason, doctorId }))!;
}

/** OP-CON-03: cancelar. 'atendida' solo se alcanza atendiendo la consulta (OP-CON-02). */
export async function changeAppointmentStatus(c: UseCaseContext, id: string, status: ConsultationStatus) {
  authorize(c.actor.role, "appointment:write");
  if (status === "atendida") throw new ValidationError("Para marcar la consulta como atendida debe registrarse la atención clínica");
  const current = await loadAppointment(c, id);
  assertConsultationTransition(current.status, status);
  const updated = (await c.repos.consultations.updateStatus(id, status))!;
  await audit(c, { action: `consulta.${status}`, entity: "consulta", entityId: id });
  return updated;
}

export async function listAppointments(c: UseCaseContext, filter: AppointmentFilter) {
  authorize(c.actor.role, "appointment:read");
  return c.repos.consultations.list(filter);
}

/** OP-CON-04: consultas de un médico en una fecha. */
export async function listDoctorAgenda(c: UseCaseContext, doctorId: string, date: string) {
  authorize(c.actor.role, "appointment:read");
  return c.repos.consultations.listByDoctor(doctorId, date);
}

export async function listDoctors(c: UseCaseContext) {
  authorize(c.actor.role, "appointment:read");
  return (await c.repos.doctors.list()).filter((d) => d.status === "activo");
}
