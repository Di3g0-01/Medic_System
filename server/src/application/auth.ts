/** Módulo de Seguridad y Sesiones — OP-SEC-01..03. */
import { UnauthorizedError } from "../domain/errors.ts";
import { assertCanLogin, type Actor, type PublicUser, type User } from "../domain/User.ts";
import type { EngineDescriptor, Institution } from "../ports/index.ts";
import type { AppDeps } from "./context.ts";

export interface SessionInfo {
  user: PublicUser & { specialty: string | null };
  institution: Institution;
  engine: EngineDescriptor;
  actor: Actor;
}

/** Hash ficticio para que un usuario inexistente cueste lo mismo que uno real (evita enumeración por tiempo). */
const DUMMY_HASH = "$2b$10$uL0YYPxlWKCamj8mRdzHXeULqt2aieHVKGcTSyL4bdy890B6t9q7.";

async function describeSession(deps: AppDeps, user: User): Promise<SessionInfo> {
  // OP-SEC-02: la institución del usuario determina el motor; resolverla inicializa su pool.
  const engine = deps.resolver.describe(user.institutionId);
  const institution = await deps.institutions.findInstitution(user.institutionId);
  if (!institution) throw new UnauthorizedError("La institución del usuario no existe");
  const repos = deps.resolver.forContext({ role: user.role, institutionId: user.institutionId });
  const specialty = user.doctorId ? ((await repos.doctors.findById(user.doctorId))?.specialty ?? null) : null;
  const { passwordHash: _hash, ...publicUser } = user;
  return {
    user: { ...publicUser, specialty },
    institution,
    engine,
    actor: { userId: user.id, role: user.role, institutionId: user.institutionId, doctorId: user.doctorId, name: user.fullName },
  };
}

/** OP-SEC-01 (hash + estado) → OP-SEC-02 (enrutamiento) → OP-SEC-03 (último acceso). */
export async function login(deps: AppDeps, username: string, password: string): Promise<SessionInfo> {
  const user = await deps.auth.findByUsername(username);
  const matches = await deps.hasher.verify(password, user?.passwordHash ?? DUMMY_HASH);
  assertCanLogin(user, matches && !!user);
  const session = await describeSession(deps, user);
  await deps.auth.recordSuccessfulLogin(user.id);
  await deps.audit
    .record({ userId: user.id, institutionId: user.institutionId, action: "sesion.login", detail: { motor: session.engine.label } })
    .catch(() => undefined);
  return session;
}

/** Restaura la sesión a partir del token: vuelve a verificar que el usuario siga activo. */
export async function restoreSession(deps: AppDeps, actor: Actor): Promise<SessionInfo> {
  const user = await deps.auth.findById(actor.userId);
  if (!user || user.status !== "activo") throw new UnauthorizedError("La sesión ya no es válida");
  return describeSession(deps, user);
}
