import { ForbiddenError } from "./errors.ts";
import type { Role } from "./values.ts";

/**
 * Política RBAC única del sistema (PDF §6). La aplica la capa de aplicación y,
 * como defensa en profundidad, los adaptadores (MySQL / MongoDB filtran con
 * ella; PostgreSQL y Firestore además la refuerzan en el propio motor).
 *
 *  - PÚBLICA:      catálogos, médicos, institución.
 *  - CONFIDENCIAL: datos personales del paciente, contactos, alergias*, agenda.
 *  - RESTRINGIDA:  notas, diagnósticos, tratamientos, recetas, laboratorio,
 *                  antropometría, vacunación, internamientos.
 *  (*) alergias, tipo de sangre y DPI se tratan como datos de admisión visibles
 *      para recepción (decisión documentada en docs/comparativo.md).
 */
export type Permission =
  | "patient:read"
  | "patient:write"
  | "patient:archive"
  | "appointment:read"
  | "appointment:write"
  | "clinical:read"
  | "clinical:write"
  | "lab:read"
  | "lab:write"
  | "catalog:read"
  | "catalog:write"
  | "user:admin"
  | "audit:read";

const MATRIX: Record<Role, readonly Permission[]> = {
  medico: [
    "patient:read",
    "patient:write",
    "patient:archive",
    "appointment:read",
    "appointment:write",
    "clinical:read",
    "clinical:write",
    "lab:read",
    "lab:write",
    "catalog:read",
  ],
  secretaria: ["patient:read", "patient:write", "patient:archive", "appointment:read", "appointment:write", "catalog:read"],
  admin: ["patient:read", "appointment:read", "catalog:read", "catalog:write", "user:admin", "audit:read"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}

export function authorize(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError();
}
