/** Atención clínica y farmacoterapia — OP-CON-02, OP-FAR-01..04 (solo médicos). */
import { resolveMedicine, type Medicine } from "../domain/Catalog.ts";
import {
  assertCanReceiveDiagnoses,
  buildEncounterDiagnoses,
  prepareDiagnosis,
  prepareEncounter,
  prepareTreatment,
  type Diagnosis,
  type FlatPrescription,
  type Prescription,
  type Treatment,
} from "../domain/Consultation.ts";
import { NotFoundError } from "../domain/errors.ts";
import { authorize } from "../domain/security.ts";
import { assertActingDoctor } from "../domain/User.ts";
import { audit, type UseCaseContext } from "./context.ts";

/** Receta tal como la captura la UI: el medicamento puede venir por id o por nombre de catálogo. */
export type PrescriptionInput = Omit<FlatPrescription, "medicineId"> & { medicineId?: string; medicineName?: string };

async function resolvePrescriptions<T extends PrescriptionInput>(c: UseCaseContext, list: T[]): Promise<(T & { medicineId: string })[]> {
  if (!list.length) return [];
  const catalog: Medicine[] = await c.repos.catalogs.listMedicines();
  return list.map((p) => ({ ...p, medicineId: resolveMedicine(catalog, { id: p.medicineId, name: p.medicineName }).id }));
}

async function loadEncounter(c: UseCaseContext, id: string) {
  const encounter = await c.repos.encounters.findEncounter(id);
  if (!encounter) throw new NotFoundError("Consulta no encontrada");
  return encounter;
}

/**
 * OP-CON-02 (+ OP-FAR-01..03 en la misma unidad atómica): atiende una cita
 * programada —o registra una consulta espontánea— con sus diagnósticos,
 * tratamientos y recetas. status 'programada' = borrador (sin diagnósticos).
 */
export async function attendConsultation(
  c: UseCaseContext,
  input: {
    appointmentId?: string | null;
    patientId: string;
    reason: string;
    notes: string | null;
    status: "atendida" | "programada";
    diagnoses: Omit<Diagnosis, "treatments" | "id">[];
    prescriptions: PrescriptionInput[];
  },
) {
  authorize(c.actor.role, "clinical:write");
  const doctorId = assertActingDoctor(c.actor);
  const patient = await c.repos.patients.findById(input.patientId);
  if (!patient) throw new NotFoundError("Paciente no encontrado");
  const current = input.appointmentId ? await c.repos.consultations.findById(input.appointmentId) : null;
  if (input.appointmentId && !current) throw new NotFoundError("Cita no encontrada");

  const diagnoses = buildEncounterDiagnoses(input.diagnoses, await resolvePrescriptions(c, input.prescriptions));
  const encounter = prepareEncounter(
    {
      consultationId: current?.id ?? null,
      patientId: patient.id,
      doctorId: current?.doctorId ?? doctorId,
      institutionId: c.actor.institutionId,
      scheduledAt: current?.scheduledAt ?? c.deps.clock.now(),
      reason: input.reason,
      notes: input.notes,
      status: input.status,
      diagnoses,
    },
    current,
  );
  const saved = await c.repos.encounters.saveEncounter(encounter);
  await audit(c, { action: `consulta.${encounter.status === "atendida" ? "atendida" : "borrador"}`, entity: "consulta", entityId: saved.id });
  return saved;
}

export async function getConsultation(c: UseCaseContext, id: string) {
  authorize(c.actor.role, "clinical:read");
  return loadEncounter(c, id);
}

/** OP-FAR-01: diagnóstico CIE-10 sobre una consulta atendida. */
export async function addDiagnosis(c: UseCaseContext, consultationId: string, input: Omit<Diagnosis, "treatments" | "id">) {
  authorize(c.actor.role, "clinical:write");
  const encounter = await loadEncounter(c, consultationId);
  assertCanReceiveDiagnoses(encounter.status);
  const saved = await c.repos.encounters.addDiagnosis(consultationId, prepareDiagnosis({ ...input, treatments: [] }));
  await audit(c, { action: "diagnostico.alta", entity: "consulta", entityId: consultationId });
  return saved;
}

/** OP-FAR-02 + OP-FAR-03: plan de tratamiento con recetas, atómico. */
export async function addTreatmentWithPrescription(
  c: UseCaseContext,
  diagnosisId: string,
  input: Omit<Treatment, "prescriptions" | "id" | "estimatedEndDate"> & { estimatedEndDate?: string | null; prescriptions: PrescriptionInput[] },
) {
  authorize(c.actor.role, "clinical:write");
  const prescriptions: Prescription[] = (await resolvePrescriptions(c, input.prescriptions)).map(({ medicineName: _n, diagnosisIndex: _i, ...p }) => p);
  const treatment = prepareTreatment({ ...input, estimatedEndDate: input.estimatedEndDate ?? null, prescriptions });
  const saved = await c.repos.encounters.addTreatmentWithPrescription(diagnosisId, treatment);
  await audit(c, { action: "tratamiento.alta", entity: "diagnostico", entityId: diagnosisId });
  return saved;
}

export async function getPatientConsultations(c: UseCaseContext, patientId: string) {
  authorize(c.actor.role, "clinical:read");
  return c.repos.encounters.getPatientHistory(patientId);
}

/** OP-FAR-04: historial farmacoterapéutico completo a lo largo de todas las visitas. */
export async function getPharmacotherapyHistory(c: UseCaseContext, patientId: string) {
  authorize(c.actor.role, "clinical:read");
  const history = await c.repos.encounters.getPatientHistory(patientId);
  return history.flatMap((consultation) =>
    consultation.diagnoses.flatMap((diagnosis) =>
      diagnosis.treatments.flatMap((treatment) =>
        treatment.prescriptions.map((prescription) => ({
          consultationId: consultation.id,
          date: consultation.scheduledAt.slice(0, 10),
          doctor: consultation.doctorName ?? "",
          diagnosis: { id: diagnosis.id!, cie10: diagnosis.cie10, description: diagnosis.description },
          treatment: { id: treatment.id!, description: treatment.description, startDate: treatment.startDate, estimatedEndDate: treatment.estimatedEndDate },
          prescription,
        })),
      ),
    ),
  );
}
