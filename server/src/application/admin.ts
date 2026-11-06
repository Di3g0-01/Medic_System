/** Administración: catálogos, usuarios y bitácora (rol admin; sin acceso al historial clínico). */
import { prepareExamType, prepareMedicine, prepareVaccine, type ExamType, type Medicine, type Vaccine } from "../domain/Catalog.ts";
import { ConflictError, NotFoundError } from "../domain/errors.ts";
import { authorize } from "../domain/security.ts";
import { prepareNewUser, type UserChanges } from "../domain/User.ts";
import type { InstitutionId, Role } from "../domain/values.ts";
import { audit, type UseCaseContext } from "./context.ts";

export async function getCatalogs(c: UseCaseContext) {
  authorize(c.actor.role, "catalog:read");
  const [medicines, vaccines, exams] = await Promise.all([
    c.repos.catalogs.listMedicines(),
    c.repos.catalogs.listVaccines(),
    c.repos.catalogs.listExamTypes(),
  ]);
  return { medicines, vaccines, exams };
}

export type CatalogInput =
  | { kind: "medicines"; value: Omit<Medicine, "id"> }
  | { kind: "vaccines"; value: Omit<Vaccine, "id"> }
  | { kind: "exams"; value: Omit<ExamType, "id"> };

export async function addCatalogItem(c: UseCaseContext, input: CatalogInput) {
  authorize(c.actor.role, "catalog:write");
  const created =
    input.kind === "medicines"
      ? await c.repos.catalogs.addMedicine(prepareMedicine(input.value))
      : input.kind === "vaccines"
        ? await c.repos.catalogs.addVaccine(prepareVaccine(input.value))
        : await c.repos.catalogs.addExamType(prepareExamType(input.value));
  await audit(c, { action: `catalogo.${input.kind}.alta`, entity: input.kind, entityId: created.id });
  return { kind: input.kind, item: created };
}

export async function listUsers(c: UseCaseContext) {
  authorize(c.actor.role, "user:admin");
  return c.deps.users.list();
}

/** Crea el perfil profesional del médico en el motor de SU institución (referencia lógica usuario.id_medico). */
async function createDoctorProfile(c: UseCaseContext, fullName: string, institutionId: InstitutionId, specialty: string | null) {
  const repos = c.deps.resolver.forContext({ role: "admin", institutionId });
  const doctor = await repos.doctors.create({
    fullName,
    licenseNumber: `PEND-${Date.now().toString(36).toUpperCase()}`,
    specialty,
    status: "activo",
    institutionId,
  });
  return doctor.id;
}

/** Alta de usuario. La UI no captura contraseña: se asigna la contraseña inicial configurada. */
export async function createUser(
  c: UseCaseContext,
  input: { username: string; fullName: string; role: Role; institutionId: InstitutionId; specialty?: string | null },
) {
  authorize(c.actor.role, "user:admin");
  const user = prepareNewUser({ ...input, doctorId: null });
  if (await c.deps.auth.findByUsername(user.username)) throw new ConflictError("El nombre de usuario ya existe");
  await c.deps.institutions.findInstitution(user.institutionId).then((i) => {
    if (!i) throw new NotFoundError("Institución inexistente");
  });
  const doctorId = user.role === "medico" ? await createDoctorProfile(c, user.fullName, user.institutionId, input.specialty ?? null) : null;
  const created = await c.deps.users.create({ ...user, doctorId, passwordHash: await c.deps.hasher.hash(c.deps.initialUserPassword) });
  await audit(c, { action: "usuario.alta", entity: "usuario", entityId: String(created.id), detail: { rol: created.role } });
  return created;
}

/** Cambio de rol, bloqueo/desbloqueo y datos básicos. */
export async function updateUser(
  c: UseCaseContext,
  id: number,
  input: { fullName?: string; role?: Role; blocked?: boolean; institutionId?: InstitutionId },
) {
  authorize(c.actor.role, "user:admin");
  const current = await c.deps.auth.findById(id);
  if (!current) throw new NotFoundError("Usuario no encontrado");
  const changes: UserChanges = {};
  if (input.fullName?.trim()) changes.fullName = input.fullName.trim();
  if (input.blocked !== undefined) changes.status = input.blocked ? "bloqueado" : "activo";
  if (input.institutionId !== undefined && input.institutionId !== current.institutionId) changes.institutionId = input.institutionId;
  const role = input.role ?? current.role;
  if (input.role) changes.role = input.role;
  const institutionId = changes.institutionId ?? current.institutionId;
  if (role !== "medico") changes.doctorId = null;
  else if (!current.doctorId || changes.institutionId !== undefined)
    changes.doctorId = await createDoctorProfile(c, changes.fullName ?? current.fullName, institutionId, null);
  const updated = await c.deps.users.update(id, changes);
  await audit(c, { action: "usuario.cambio", entity: "usuario", entityId: String(id), detail: { ...changes } });
  return updated!;
}

export async function listAudit(c: UseCaseContext, limit = 100) {
  authorize(c.actor.role, "audit:read");
  return c.deps.audit.listAudit(Math.min(Math.max(limit, 1), 500));
}
