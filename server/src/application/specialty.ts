/** Lecturas de módulos especializados (restringidas): Pediatría (OP-ESP-02, 04) y Hospital (internamientos). */
import { authorize } from "../domain/security.ts";
import { vaccinationScheme } from "../domain/Specialty.ts";
import type { UseCaseContext } from "./context.ts";

/** Las sedes cuyo motor no tiene el módulo responden lista vacía (la UI pide todo en el perfil). */
export async function listGrowthRecords(c: UseCaseContext, patientId: string) {
  authorize(c.actor.role, "clinical:read");
  return c.repos.pediatrics ? c.repos.pediatrics.listGrowth(patientId) : [];
}

/** OP-ESP-04: esquema aplicado + dosis pendientes contra el catálogo de dosis requeridas. */
export async function getVaccinationScheme(c: UseCaseContext, patientId: string) {
  authorize(c.actor.role, "clinical:read");
  if (!c.repos.pediatrics) return [];
  const [catalog, doses] = await Promise.all([c.repos.catalogs.listVaccines(), c.repos.pediatrics.listVaccinations(patientId)]);
  return vaccinationScheme(catalog, doses);
}

export async function listAdmissions(c: UseCaseContext, patientId: string) {
  authorize(c.actor.role, "clinical:read");
  return c.repos.admissions ? c.repos.admissions.listByPatient(patientId) : [];
}
