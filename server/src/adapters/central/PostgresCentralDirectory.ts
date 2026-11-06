import bcrypt from "bcryptjs";
import pg from "pg";
import type { NewUser, PublicUser, User, UserChanges } from "../../domain/User.ts";
import type { InstitutionId } from "../../domain/values.ts";
import type { AuditEntry, IAuditPort, IAuthPort, IInstitutionPort, Institution, IPasswordHasher, IUserDirectoryPort } from "../../ports/index.ts";
import { translatePgError } from "../postgres/PostgresProvider.ts";
import { toLocal } from "../sql/mappers.ts";

const toUser = (r: Record<string, any>): User => ({
  id: Number(r.id_usuario),
  username: r.nombre_usuario,
  passwordHash: r.contrasena_hash,
  fullName: r.nombre_completo,
  role: r.rol,
  status: r.estado,
  lastAccess: toLocal(r.ultimo_acceso),
  institutionId: Number(r.id_institucion),
  doctorId: r.id_medico ?? null,
});

const toPublic = ({ passwordHash: _hash, ...u }: User): PublicUser => u;

const USER_COLUMNS: Record<keyof UserChanges, string> = {
  fullName: "nombre_completo",
  role: "rol",
  status: "estado",
  institutionId: "id_institucion",
  doctorId: "id_medico",
};

/**
 * Base central "red_central" (PostgreSQL): usuarios, instituciones y bitácora.
 * Implementa OP-SEC-01 (búsqueda por usuario), OP-SEC-03 (ultimo_acceso) y la
 * administración de cuentas.
 */
export class PostgresCentralDirectory implements IAuthPort, IUserDirectoryPort, IInstitutionPort, IAuditPort {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
  }

  private async query(sql: string, params: unknown[] = []) {
    try {
      return (await this.pool.query(sql, params)).rows;
    } catch (e) {
      throw translatePgError(e);
    }
  }

  async findByUsername(username: string) {
    const [r] = await this.query("SELECT * FROM usuario WHERE nombre_usuario = $1", [username.trim().toLowerCase()]);
    return r ? toUser(r) : null;
  }

  async findById(id: number) {
    const [r] = await this.query("SELECT * FROM usuario WHERE id_usuario = $1", [id]);
    return r ? toUser(r) : null;
  }

  async recordSuccessfulLogin(userId: number) {
    await this.query("UPDATE usuario SET ultimo_acceso = now() WHERE id_usuario = $1", [userId]);
  }

  async list() {
    return (await this.query("SELECT * FROM usuario ORDER BY id_usuario")).map((r) => toPublic(toUser(r)));
  }

  async create(u: NewUser) {
    const [r] = await this.query(
      `INSERT INTO usuario (nombre_usuario, contrasena_hash, nombre_completo, rol, estado, id_institucion, id_medico)
       VALUES ($1, $2, $3, $4, 'activo', $5, $6) RETURNING *`,
      [u.username, u.passwordHash, u.fullName, u.role, u.institutionId, u.doctorId],
    );
    return toPublic(toUser(r));
  }

  async update(id: number, changes: UserChanges) {
    const entries = Object.entries(changes) as [keyof UserChanges, unknown][];
    if (entries.length)
      await this.query(`UPDATE usuario SET ${entries.map(([k], i) => `${USER_COLUMNS[k]} = $${i + 1}`).join(", ")} WHERE id_usuario = $${entries.length + 1}`, [
        ...entries.map(([, v]) => v),
        id,
      ]);
    const user = await this.findById(id);
    return user ? toPublic(user) : null;
  }

  async listInstitutions(): Promise<Institution[]> {
    return (await this.query("SELECT * FROM institucion ORDER BY id_institucion")).map((r) => ({ id: r.id_institucion, name: r.nombre, kind: r.tipo }));
  }

  // IInstitutionPort
  async findInstitution(id: InstitutionId) {
    return (await this.listInstitutions()).find((i) => i.id === id) ?? null;
  }

  async record(e: AuditEntry) {
    await this.query(
      "INSERT INTO bitacora_auditoria (id_usuario, id_institucion, accion, entidad, id_entidad, detalle) VALUES ($1, $2, $3, $4, $5, $6)",
      [e.userId, e.institutionId, e.action, e.entity ?? null, e.entityId ?? null, e.detail ? JSON.stringify(e.detail) : null],
    );
  }

  async listAudit(limit: number) {
    return (await this.query("SELECT * FROM bitacora_auditoria ORDER BY id_bitacora DESC LIMIT $1", [limit])).map((r) => ({
      at: toLocal(r.fecha_hora)!,
      userId: r.id_usuario,
      institutionId: r.id_institucion,
      action: r.accion,
      entity: r.entidad ?? undefined,
      entityId: r.id_entidad ?? undefined,
      detail: r.detalle ?? undefined,
    }));
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }

  close() {
    return this.pool.end();
  }
}

export const bcryptHasher: IPasswordHasher = {
  hash: (plain) => bcrypt.hash(plain, 10),
  verify: (plain, hash) => bcrypt.compare(plain, hash),
};
