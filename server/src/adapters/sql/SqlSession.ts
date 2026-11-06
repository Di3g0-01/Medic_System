import type { AccessContext } from "../../ports/index.ts";

export type Row = Record<string, any>;

/**
 * Sesión SQL portable (placeholders "?") sobre la que se escriben los
 * repositorios relacionales compartidos por PostgreSQL y MySQL. Cada motor
 * implementa el ejecutor: conexión, transacción, seguridad y traducción de errores.
 */
export interface SqlSession {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Devuelve filas afectadas. */
  execute(sql: string, params?: unknown[]): Promise<number>;
  /** INSERT que devuelve la PK generada. */
  insert(sql: string, params: unknown[], idColumn: string): Promise<number>;
}

export interface SqlEngine {
  /** Ejecuta `work` dentro de UNA transacción (BEGIN … COMMIT / ROLLBACK ante cualquier error). */
  run<T>(ctx: AccessContext, work: (session: SqlSession) => Promise<T>): Promise<T>;
}

export const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(", ");
