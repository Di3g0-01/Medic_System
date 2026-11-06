import { ValidationError, assert } from "./errors.ts";
import type { IsoDate, LabStatus, LocalDateTime } from "./values.ts";

/** Resultado por parámetro. Admite campos adicionales (estructura heterogénea, p. ej. antibiogramas en MongoDB). */
export interface LabResult {
  parameter: string;
  /** '' = parámetro solicitado aún sin resultado. */
  value: string;
  referenceRange: string | null;
  observations: string | null;
}

export interface LabOrder {
  id: string;
  consultationId: string;
  patientId: string;
  examTypeId: string;
  examTypeName: string;
  requestedAt: LocalDateTime;
  requestedBy: string;
  status: LabStatus;
  results: LabResult[];
}

export interface NewLabOrder {
  consultationId: string;
  examTypeId: string;
  requestedAt: LocalDateTime;
  results: LabResult[];
}

const LAB_TRANSITIONS: Record<LabStatus, LabStatus[]> = {
  solicitado: ["en_proceso"],
  en_proceso: ["en_proceso", "completado"],
  completado: [],
};

/** OP-LAB-01..03: solicitado → en_proceso (captura de muestra) → completado (resultados). */
export function assertLabTransition(from: LabStatus, to: LabStatus): void {
  if (!LAB_TRANSITIONS[from].includes(to)) throw new ValidationError(`No se puede pasar una orden '${from}' a '${to}'`);
}

export function prepareResults(results: LabResult[]): LabResult[] {
  const seen = new Set<string>();
  return results.map((r) => {
    const parameter = r.parameter.trim();
    assert(parameter, "Cada resultado requiere el nombre del parámetro");
    assert(!seen.has(parameter.toLowerCase()), `Parámetro duplicado: ${parameter}`);
    seen.add(parameter.toLowerCase());
    assert(r.value.length <= 50, `El valor de ${parameter} excede 50 caracteres`);
    return { ...r, parameter, value: r.value.trim(), referenceRange: r.referenceRange?.trim() || null, observations: r.observations?.trim() || null };
  });
}

/** Estado resultante de capturar resultados: completado solo si todos los parámetros tienen valor. */
export function statusAfterResults(results: LabResult[]): Extract<LabStatus, "en_proceso" | "completado"> {
  assert(results.length > 0, "La orden no tiene parámetros");
  return results.every((r) => r.value !== "") ? "completado" : "en_proceso";
}

export function requestedDate(order: LabOrder): IsoDate {
  return order.requestedAt.slice(0, 10);
}
