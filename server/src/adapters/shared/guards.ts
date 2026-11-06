import { ForbiddenError } from "../../domain/errors.ts";
import { can, type Permission } from "../../domain/security.ts";
import type { AccessContext } from "../../ports/index.ts";

/**
 * Defensa en profundidad dentro del adaptador: aunque el caso de uso ya
 * autorizó, el adaptador se niega a materializar datos restringidos para un
 * rol sin permiso (requisito "filtrado forzoso en el adaptador"). Reutiliza la
 * matriz única del dominio, no duplica reglas.
 */
export function guard(ctx: AccessContext, permission: Permission): void {
  if (!can(ctx.role, permission)) throw new ForbiddenError("El adaptador rechazó el acceso a información restringida");
}
