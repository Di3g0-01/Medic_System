import { ConflictError, ValidationError, assert } from "./errors.ts";
import {
  addDays,
  isIsoDate,
  isLocalDateTime,
  type ConsultationStatus,
  type DiagnosisType,
  type InstitutionId,
  type IsoDate,
  type LocalDateTime,
} from "./values.ts";

export interface Prescription {
  id?: string;
  medicineId: string;
  /** Nombre de presentación del catálogo (lectura). */
  medicineName?: string;
  dose: string;
  frequency: string;
  durationDays: number | null;
  instructions: string | null;
}

export interface Treatment {
  id?: string;
  description: string;
  startDate: IsoDate;
  estimatedEndDate: IsoDate | null;
  observations: string | null;
  prescriptions: Prescription[];
}

export interface Diagnosis {
  id?: string;
  cie10: string | null;
  description: string;
  type: DiagnosisType | null;
  date: IsoDate;
  treatments: Treatment[];
}

/** Cita / consulta (una sola entidad "consulta" en el modelo). Proyección confidencial: sin notas ni diagnósticos. */
export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName?: string;
  institutionId: InstitutionId;
  scheduledAt: LocalDateTime;
  reason: string;
  status: ConsultationStatus;
}

/** Proyección clínica completa (solo médicos). */
export interface Consultation extends Appointment {
  notes: string | null;
  diagnoses: Diagnosis[];
}

export interface NewAppointment {
  patientId: string;
  doctorId: string;
  institutionId: InstitutionId;
  scheduledAt: LocalDateTime;
  reason: string;
}

/** Escritura atómica de un encuentro clínico: consulta + diagnósticos + tratamientos + recetas. */
export interface EncounterWrite {
  /** Consulta programada existente que se atiende; si falta se crea una nueva. */
  consultationId: string | null;
  patientId: string;
  doctorId: string;
  institutionId: InstitutionId;
  scheduledAt: LocalDateTime;
  reason: string;
  notes: string | null;
  status: "programada" | "atendida";
  diagnoses: Diagnosis[];
}

const CONSULTATION_TRANSITIONS: Record<ConsultationStatus, ConsultationStatus[]> = {
  programada: ["programada", "atendida", "cancelada"],
  atendida: [],
  cancelada: [],
};

export function assertConsultationTransition(from: ConsultationStatus, to: ConsultationStatus): void {
  if (!CONSULTATION_TRANSITIONS[from].includes(to))
    throw new ValidationError(`No se puede pasar una consulta '${from}' a '${to}'`);
}

export function assertValidSlot(scheduledAt: LocalDateTime): void {
  assert(isLocalDateTime(scheduledAt), "Fecha u hora de la cita inválida");
}

/** OP-CON-01: el médico no puede tener otra consulta vigente en el mismo horario. */
export function assertSlotAvailable(conflicts: Appointment[], selfId?: string): void {
  const clash = conflicts.find((c) => c.id !== selfId && c.status !== "cancelada");
  if (clash) throw new ConflictError(`El médico ya tiene una consulta programada a las ${clash.scheduledAt.slice(11, 16)}`);
}

export function prepareAppointment(input: NewAppointment): NewAppointment {
  assertValidSlot(input.scheduledAt);
  const reason = input.reason.trim();
  assert(reason, "El motivo de consulta es obligatorio");
  assert(input.patientId && input.doctorId, "Paciente y médico son obligatorios");
  return { ...input, reason };
}

/** CIE-10: letra, dos dígitos y subcategoría opcional (A00–Z99, p. ej. G44.2, K02.1, J18.9). */
const CIE10 = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;

export function normalizeCie10(code: string): string {
  const value = code.trim().toUpperCase();
  if (!CIE10.test(value)) throw new ValidationError(`Código CIE-10 inválido: '${code}'`);
  return value;
}

/** OP-FAR-01: diagnósticos solo sobre consultas atendidas. */
export function assertCanReceiveDiagnoses(status: ConsultationStatus): void {
  if (status !== "atendida") throw new ValidationError("Solo se pueden asignar diagnósticos a una consulta atendida");
}

export function prepareDiagnosis(d: Diagnosis): Diagnosis {
  const description = d.description.trim();
  assert(description, "La descripción del diagnóstico es obligatoria");
  assert(d.cie10 && d.cie10.trim(), "El código CIE-10 es obligatorio");
  assert(isIsoDate(d.date), "Fecha de diagnóstico inválida");
  assert(d.type == null || ["presuntivo", "diferencial", "definitivo"].includes(d.type), "Tipo de diagnóstico inválido");
  return { ...d, description, cie10: normalizeCie10(d.cie10), treatments: d.treatments.map(prepareTreatment) };
}

export function preparePrescription(p: Prescription): Prescription {
  const dose = p.dose.trim();
  const frequency = p.frequency.trim();
  assert(p.medicineId, "Debe seleccionar un medicamento del catálogo");
  assert(dose, "La dosis es obligatoria");
  assert(frequency, "La frecuencia es obligatoria");
  assert(p.durationDays == null || (Number.isInteger(p.durationDays) && p.durationDays > 0), "La duración debe ser un número entero de días mayor a 0");
  return { ...p, dose, frequency, instructions: p.instructions?.trim() || null };
}

/** OP-FAR-02/03: el tratamiento deriva de un diagnóstico; fecha fin estimada = inicio + mayor duración de sus recetas. */
export function prepareTreatment(t: Treatment): Treatment {
  const description = t.description.trim();
  assert(description, "La descripción del tratamiento es obligatoria");
  assert(isIsoDate(t.startDate), "Fecha de inicio del tratamiento inválida");
  const prescriptions = t.prescriptions.map(preparePrescription);
  const longest = Math.max(0, ...prescriptions.map((p) => p.durationDays ?? 0));
  const estimatedEndDate = t.estimatedEndDate ?? (longest ? addDays(t.startDate, longest) : null);
  assert(!estimatedEndDate || estimatedEndDate >= t.startDate, "La fecha fin estimada no puede ser anterior al inicio");
  return { ...t, description, observations: t.observations?.trim() || null, estimatedEndDate, prescriptions };
}

/** Receta "plana" (como la captura la UI) antes de ligarla a su diagnóstico. */
export interface FlatPrescription extends Prescription {
  /** Índice del diagnóstico dentro del encuentro; por defecto el primero. */
  diagnosisIndex?: number;
}

/**
 * Construye la cadena 3FN diagnóstico → tratamiento → receta a partir de la captura
 * de la UI: un tratamiento por diagnóstico que tenga recetas.
 */
export function buildEncounterDiagnoses(diagnoses: Omit<Diagnosis, "treatments">[], prescriptions: FlatPrescription[]): Diagnosis[] {
  if (prescriptions.length && !diagnoses.length)
    throw new ValidationError("Una receta requiere al menos un diagnóstico que la fundamente");
  return diagnoses.map((d, index) => {
    const own = prescriptions.filter((p) => (p.diagnosisIndex ?? 0) === index);
    const treatments: Treatment[] = own.length
      ? [
          {
            description: `Plan terapéutico: ${d.description.trim()}`,
            startDate: d.date,
            estimatedEndDate: null,
            observations: null,
            prescriptions: own.map(({ diagnosisIndex: _index, ...p }) => p),
          },
        ]
      : [];
    return prepareDiagnosis({ ...d, treatments });
  });
}

/** OP-CON-02: valida un encuentro antes de la transacción. */
export function prepareEncounter(e: EncounterWrite, current: Appointment | null): EncounterWrite {
  const reason = e.reason.trim();
  assert(reason, "El motivo de consulta es obligatorio");
  assertValidSlot(e.scheduledAt);
  if (current) {
    assert(current.patientId === e.patientId, "La cita pertenece a otro paciente");
    assertConsultationTransition(current.status, e.status);
  }
  if (e.status === "atendida") assert(e.notes && e.notes.trim(), "Las notas clínicas son obligatorias para atender la consulta");
  if (e.diagnoses.length) assertCanReceiveDiagnoses(e.status);
  return { ...e, reason, notes: e.notes?.trim() || null };
}
