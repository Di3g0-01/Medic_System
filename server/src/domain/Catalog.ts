import { NotFoundError, assert } from "./errors.ts";
import type { InstitutionId } from "./values.ts";

/** Catálogos maestros institucionales (información pública). */
export interface Medicine {
  id: string;
  genericName: string;
  brandName: string | null;
  presentation: string | null;
  concentration: string | null;
}

export interface Vaccine {
  id: string;
  name: string;
  requiredDoses: number;
}

export interface ExamType {
  id: string;
  name: string;
  description: string | null;
}

export interface Doctor {
  id: string;
  fullName: string;
  licenseNumber: string;
  specialty: string | null;
  status: "activo" | "inactivo";
  institutionId: InstitutionId;
}

export type NewDoctor = Omit<Doctor, "id">;

/** Nombre de presentación único del medicamento: "Paracetamol 500 mg". */
export function medicineLabel(m: Medicine): string {
  return [m.genericName, m.concentration].filter(Boolean).join(" ");
}

/** Resuelve un medicamento por id o por su nombre de presentación (la UI envía el nombre). */
export function resolveMedicine(catalog: Medicine[], ref: { id?: string; name?: string }): Medicine {
  const found =
    (ref.id && catalog.find((m) => m.id === ref.id)) ||
    (ref.name && catalog.find((m) => medicineLabel(m).toLowerCase() === ref.name!.trim().toLowerCase()));
  if (!found) throw new NotFoundError(`Medicamento no registrado en el catálogo: ${ref.name ?? ref.id}`);
  return found;
}

export function resolveExamType(catalog: ExamType[], ref: { id?: string; name?: string }): ExamType {
  const found =
    (ref.id && catalog.find((e) => e.id === ref.id)) ||
    (ref.name && catalog.find((e) => e.name.toLowerCase() === ref.name!.trim().toLowerCase()));
  if (!found) throw new NotFoundError(`Tipo de examen no registrado: ${ref.name ?? ref.id}`);
  return found;
}

export function prepareMedicine(m: Omit<Medicine, "id">): Omit<Medicine, "id"> {
  assert(m.genericName.trim(), "El nombre genérico es obligatorio");
  return { ...m, genericName: m.genericName.trim() };
}

export function prepareVaccine(v: Omit<Vaccine, "id">): Omit<Vaccine, "id"> {
  assert(v.name.trim(), "El nombre de la vacuna es obligatorio");
  assert(Number.isInteger(v.requiredDoses) && v.requiredDoses > 0, "Las dosis requeridas deben ser un entero mayor a 0");
  return { ...v, name: v.name.trim() };
}

export function prepareExamType(e: Omit<ExamType, "id">): Omit<ExamType, "id"> {
  assert(e.name.trim(), "El nombre del examen es obligatorio");
  return { ...e, name: e.name.trim() };
}
