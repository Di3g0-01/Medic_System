/** Módulo de Laboratorio Clínico — OP-LAB-01..04 (solo médicos). */
import { resolveExamType } from "../domain/Catalog.ts";
import { NotFoundError, ValidationError } from "../domain/errors.ts";
import { assertLabTransition, prepareResults, statusAfterResults, type LabResult } from "../domain/LabOrder.ts";
import { authorize } from "../domain/security.ts";
import { audit, type UseCaseContext } from "./context.ts";

async function loadOrder(c: UseCaseContext, id: string) {
  const order = await c.repos.lab.getOrderReport(id);
  if (!order) throw new NotFoundError("Orden de laboratorio no encontrada");
  return order;
}

/** OP-LAB-01: requiere un id_consulta válido; estado inicial 'solicitado'. */
export async function createLabOrder(
  c: UseCaseContext,
  input: { consultationId?: string | null; examTypeId?: string; examTypeName?: string; parameters: Omit<LabResult, "value">[] },
) {
  authorize(c.actor.role, "lab:write");
  if (!input.consultationId) throw new ValidationError("La orden de laboratorio requiere un id_consulta válido");
  const consultation = await c.repos.encounters.findEncounter(input.consultationId);
  if (!consultation) throw new ValidationError("La orden de laboratorio requiere un id_consulta válido");
  const examType = resolveExamType(await c.repos.catalogs.listExamTypes(), { id: input.examTypeId, name: input.examTypeName });
  const order = await c.repos.lab.createOrder({
    consultationId: consultation.id,
    examTypeId: examType.id,
    requestedAt: c.deps.clock.now(),
    results: prepareResults(input.parameters.map((p) => ({ ...p, value: "" }))),
  });
  await audit(c, { action: "examen.solicitado", entity: "examen", entityId: order.id });
  return order;
}

/** OP-LAB-02: captura de muestra. */
export async function registerSampleCapture(c: UseCaseContext, id: string) {
  authorize(c.actor.role, "lab:write");
  const order = await loadOrder(c, id);
  assertLabTransition(order.status, "en_proceso");
  return (await c.repos.lab.updateStatus(id, "en_proceso"))!;
}

/**
 * OP-LAB-03: registra parámetros; si todos tienen valor la orden queda 'completado'.
 * Una orden aún 'solicitado' pasa por 'en_proceso' (la muestra se capturó para obtener resultados).
 */
export async function recordLabResults(c: UseCaseContext, id: string, results: LabResult[]) {
  authorize(c.actor.role, "lab:write");
  const order = await loadOrder(c, id);
  const incoming = prepareResults(results);
  const merged = [...order.results.filter((r) => !incoming.some((i) => i.parameter === r.parameter)), ...incoming];
  const status = statusAfterResults(merged);
  if (order.status === "solicitado") assertLabTransition("solicitado", "en_proceso");
  assertLabTransition(order.status === "solicitado" ? "en_proceso" : order.status, status);
  const saved = (await c.repos.lab.addResults(id, incoming, status))!;
  await audit(c, { action: `examen.${status}`, entity: "examen", entityId: id });
  return saved;
}

/** OP-LAB-04 */
export async function getLabReport(c: UseCaseContext, id: string) {
  authorize(c.actor.role, "lab:read");
  return loadOrder(c, id);
}

export async function listLabOrders(c: UseCaseContext, filter: { patientId?: string }) {
  authorize(c.actor.role, "lab:read");
  return c.repos.lab.list(filter);
}
