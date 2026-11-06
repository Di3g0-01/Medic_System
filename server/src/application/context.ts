import type { Actor } from "../domain/User.ts";
import type { Clock } from "../domain/values.ts";
import type {
  AuditEntry,
  IAuditPort,
  IAuthPort,
  IInstitutionPort,
  InstitutionRepositories,
  IPasswordHasher,
  IRepositoryResolver,
  IUserDirectoryPort,
} from "../ports/index.ts";

/** Dependencias de la aplicación (solo puertos: inversión de dependencias). */
export interface AppDeps {
  resolver: IRepositoryResolver;
  auth: IAuthPort;
  users: IUserDirectoryPort;
  institutions: IInstitutionPort;
  audit: IAuditPort;
  hasher: IPasswordHasher;
  clock: Clock;
  initialUserPassword: string;
}

/** Contexto de un caso de uso: quién actúa y los repositorios del motor de SU institución (OP-SEC-02). */
export interface UseCaseContext {
  actor: Actor;
  repos: InstitutionRepositories;
  deps: AppDeps;
}

export function contextFor(deps: AppDeps, actor: Actor): UseCaseContext {
  return { actor, deps, repos: deps.resolver.forContext({ role: actor.role, institutionId: actor.institutionId }) };
}

/** Bitácora de auditoría: un fallo al auditar no revierte la operación clínica ya confirmada. */
export async function audit(c: UseCaseContext, entry: Omit<AuditEntry, "userId" | "institutionId">): Promise<void> {
  try {
    await c.deps.audit.record({ ...entry, userId: c.actor.userId, institutionId: c.actor.institutionId });
  } catch (e) {
    console.warn("[auditoría] no se pudo registrar", entry.action, e);
  }
}
