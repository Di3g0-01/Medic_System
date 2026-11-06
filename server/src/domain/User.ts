import { ForbiddenError, UnauthorizedError, assert } from "./errors.ts";
import type { InstitutionId, LocalDateTime, Role, UserStatus } from "./values.ts";

/** Entidad de seguridad (tabla central "usuario"). */
export interface User {
  id: number;
  username: string;
  passwordHash: string;
  fullName: string;
  role: Role;
  status: UserStatus;
  lastAccess: LocalDateTime | null;
  institutionId: InstitutionId;
  /** Referencia lógica al médico en el motor de su institución. */
  doctorId: string | null;
}

export type PublicUser = Omit<User, "passwordHash">;

export interface NewUser {
  username: string;
  passwordHash: string;
  fullName: string;
  role: Role;
  institutionId: InstitutionId;
  doctorId: string | null;
}

export type UserChanges = Partial<Pick<User, "fullName" | "role" | "status" | "institutionId" | "doctorId">>;

/** Identidad del usuario autenticado (claims del JWT). */
export interface Actor {
  userId: number;
  role: Role;
  institutionId: InstitutionId;
  doctorId: string | null;
  name: string;
}

/** OP-SEC-01: solo usuarios activos pueden autenticarse. */
export function assertCanLogin(user: User | null, passwordMatches: boolean): asserts user is User {
  if (!user || !passwordMatches) throw new UnauthorizedError();
  if (user.status !== "activo") throw new UnauthorizedError(`El usuario está ${user.status}`);
}

export function assertActingDoctor(actor: Actor): string {
  if (actor.role !== "medico" || !actor.doctorId) throw new ForbiddenError("Solo un médico con perfil profesional puede realizar esta acción");
  return actor.doctorId;
}

export function prepareNewUser(u: Omit<NewUser, "passwordHash">): Omit<NewUser, "passwordHash"> {
  const username = u.username.trim().toLowerCase();
  assert(/^[a-z0-9._-]{3,60}$/.test(username), "Nombre de usuario inválido (3-60 caracteres: letras, números, . _ -)");
  assert(u.fullName.trim(), "El nombre es obligatorio");
  assert(["medico", "secretaria", "admin"].includes(u.role), "Rol inválido");
  return { ...u, username, fullName: u.fullName.trim() };
}
