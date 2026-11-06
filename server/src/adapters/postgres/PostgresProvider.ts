import pg from "pg";
import type { Role } from "../../domain/values.ts";
import type { AccessContext, EngineProvider, InstitutionRepositories } from "../../ports/index.ts";
import type { SqlEngine, SqlSession } from "../sql/SqlSession.ts";
import {
  SqlAdmissionRepository,
  SqlCatalogRepository,
  SqlConsultationRepository,
  SqlDoctorRepository,
  SqlEncounterRepository,
  SqlLabRepository,
  SqlPatientRepository,
} from "../sql/SqlRepositories.ts";
import { toDomainError, type SqlErrorKind } from "../sql/translateError.ts";

// timestamp / date / numeric / bigint sin conversión a Date local
pg.types.setTypeParser(1114, (v) => v);
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => Number.parseFloat(v));
pg.types.setTypeParser(20, (v) => Number(v));

const DB_ROLE: Record<Role, string> = { medico: "rc_medico", secretaria: "rc_secretaria", admin: "rc_admin" };

const KIND: Record<string, SqlErrorKind> = { "23505": "unique", "23503": "foreign_key", "23514": "check", "42501": "denied", "22P02": "invalid", "22007": "invalid" };

export function translatePgError(e: unknown): Error {
  const err = e as { code?: string; constraint?: string; detail?: string; message?: string };
  return toDomainError(err.code ? (KIND[err.code] ?? null) : null, `${err.constraint ?? ""} ${err.detail ?? err.message ?? ""}`, e);
}

/**
 * Ejecutor PostgreSQL. Cada operación:
 *   BEGIN; SET LOCAL ROLE rc_<rol>; set_config('app.id_institucion', …, true); …; COMMIT
 * de modo que los privilegios por columna y las políticas RLS los aplica el motor
 * (el rol de conexión rc_app es NOINHERIT y por sí mismo no puede leer nada).
 */
export class PostgresEngine implements SqlEngine {
  constructor(private readonly pool: pg.Pool) {}

  async run<T>(ctx: AccessContext, work: (s: SqlSession) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${DB_ROLE[ctx.role]}`);
      await client.query("SELECT set_config('app.id_institucion', $1, true)", [String(ctx.institutionId)]);
      const result = await work(sessionFor(client));
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw translatePgError(e);
    } finally {
      client.release();
    }
  }
}

const numbered = (sql: string) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

function sessionFor(client: pg.PoolClient): SqlSession {
  return {
    query: async (sql, params = []) => (await client.query(numbered(sql), params)).rows,
    execute: async (sql, params = []) => (await client.query(numbered(sql), params)).rowCount ?? 0,
    insert: async (sql, params, idColumn) => Number((await client.query(`${numbered(sql)} RETURNING ${idColumn}`, params)).rows[0][idColumn]),
  };
}

/** Hospital General (i1). */
export class PostgresProvider implements EngineProvider {
  readonly descriptor = { key: "postgres", label: "PostgreSQL" };
  private readonly pool: pg.Pool;
  private readonly engine: PostgresEngine;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10 });
    this.engine = new PostgresEngine(this.pool);
  }

  repositories(ctx: AccessContext): InstitutionRepositories {
    return {
      patients: new SqlPatientRepository(this.engine, ctx),
      consultations: new SqlConsultationRepository(this.engine, ctx),
      encounters: new SqlEncounterRepository(this.engine, ctx),
      lab: new SqlLabRepository(this.engine, ctx),
      catalogs: new SqlCatalogRepository(this.engine, ctx),
      doctors: new SqlDoctorRepository(this.engine, ctx),
      admissions: new SqlAdmissionRepository(this.engine, ctx),
    };
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }

  close() {
    return this.pool.end();
  }
}
