import mysql from "mysql2/promise";
import type { AccessContext, EngineProvider, InstitutionRepositories } from "../../ports/index.ts";
import type { SqlEngine, SqlSession } from "../sql/SqlSession.ts";
import {
  SqlCatalogRepository,
  SqlConsultationRepository,
  SqlDoctorRepository,
  SqlEncounterRepository,
  SqlLabRepository,
  SqlPatientRepository,
} from "../sql/SqlRepositories.ts";
import { toDomainError, type SqlErrorKind } from "../sql/translateError.ts";

const KIND: Record<number, SqlErrorKind> = { 1062: "unique", 1452: "foreign_key", 1451: "foreign_key", 3819: "check", 1142: "denied", 1143: "denied", 1292: "invalid", 1366: "invalid" };

export function translateMySqlError(e: unknown): Error {
  const err = e as { errno?: number; sqlMessage?: string; message?: string };
  return toDomainError(err.errno ? (KIND[err.errno] ?? null) : null, err.sqlMessage ?? err.message ?? "", e);
}

/**
 * Ejecutor MySQL: START TRANSACTION … COMMIT / ROLLBACK por operación (InnoDB).
 * MySQL no ofrece RLS ni roles por sesión en este despliegue: la seguridad se
 * aplica con vistas (v_agenda sin notas clínicas) + filtrado forzoso en los
 * repositorios (guard) y el filtro id_institucion en cada consulta.
 */
export class MySqlEngine implements SqlEngine {
  constructor(private readonly pool: mysql.Pool) {}

  async run<T>(_ctx: AccessContext, work: (s: SqlSession) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(sessionFor(conn));
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback().catch(() => undefined);
      throw translateMySqlError(e);
    } finally {
      conn.release();
    }
  }
}

function sessionFor(conn: mysql.PoolConnection): SqlSession {
  return {
    query: async (sql, params = []) => (await conn.query(sql, params))[0] as any[],
    execute: async (sql, params = []) => ((await conn.query(sql, params))[0] as mysql.ResultSetHeader).affectedRows,
    insert: async (sql, params) => ((await conn.query(sql, params))[0] as mysql.ResultSetHeader).insertId,
  };
}

/** Clínica Odontológica (i2). */
export class MySqlProvider implements EngineProvider {
  readonly descriptor = { key: "mysql", label: "MySQL" };
  private readonly pool: mysql.Pool;
  private readonly engine: MySqlEngine;

  constructor(uri: string) {
    this.pool = mysql.createPool({ uri, dateStrings: true, decimalNumbers: true, connectionLimit: 10, charset: "utf8mb4" });
    this.engine = new MySqlEngine(this.pool);
  }

  repositories(ctx: AccessContext): InstitutionRepositories {
    return {
      patients: new SqlPatientRepository(this.engine, ctx),
      consultations: new SqlConsultationRepository(this.engine, ctx),
      encounters: new SqlEncounterRepository(this.engine, ctx),
      lab: new SqlLabRepository(this.engine, ctx),
      catalogs: new SqlCatalogRepository(this.engine, ctx),
      doctors: new SqlDoctorRepository(this.engine, ctx),
    };
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }

  close() {
    return this.pool.end();
  }
}
