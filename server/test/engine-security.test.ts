/**
 * Eje C aplicado POR EL MOTOR (sin pasar por los guards del adaptador):
 *   - PostgreSQL: SET ROLE + privilegios por columna + RLS.
 *   - Firestore: firestore.rules evaluadas por el emulador con claims role/institutionId.
 */
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresEngine } from "../src/adapters/postgres/PostgresProvider.ts";
import { loadConfig } from "../src/config.ts";
import { ForbiddenError } from "../src/domain/errors.ts";

const config = loadConfig();

describe("PostgreSQL · privilegios por rol y RLS en el motor", () => {
  const pool = new pg.Pool({ connectionString: config.postgresUrl });
  const engine = new PostgresEngine(pool);
  afterAll(() => pool.end());

  it("rc_secretaria lee la agenda pero no notas_clinicas ni diagnósticos", async () => {
    const ctx = { role: "secretaria" as const, institutionId: 1 };
    const agenda = await engine.run(ctx, (s) => s.query("SELECT id_consulta, motivo_consulta FROM v_agenda"));
    expect(agenda.length).toBeGreaterThan(0);
    await expect(engine.run(ctx, (s) => s.query("SELECT notas_clinicas FROM consulta"))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(engine.run(ctx, (s) => s.query("SELECT * FROM diagnostico"))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(engine.run(ctx, (s) => s.query("SELECT * FROM receta"))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rc_admin gestiona catálogos pero no puede escribir pacientes ni leer el historial", async () => {
    const ctx = { role: "admin" as const, institutionId: 1 };
    expect((await engine.run(ctx, (s) => s.query("SELECT * FROM medicamento"))).length).toBeGreaterThan(0);
    await expect(engine.run(ctx, (s) => s.execute("UPDATE paciente SET telefono = '0' WHERE id_paciente = 1"))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(engine.run(ctx, (s) => s.query("SELECT * FROM v_historial_farmacoterapeutico"))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("RLS: una sesión de otra institución no ve filas del hospital; nadie puede borrar", async () => {
    const own = await engine.run({ role: "medico", institutionId: 1 }, (s) => s.query("SELECT count(*) AS n FROM paciente"));
    const other = await engine.run({ role: "medico", institutionId: 2 }, (s) => s.query("SELECT count(*) AS n FROM paciente"));
    expect(own[0].n).toBeGreaterThan(0);
    expect(other[0].n).toBe(0);
    await expect(engine.run({ role: "medico", institutionId: 1 }, (s) => s.execute("DELETE FROM paciente WHERE id_paciente = 1"))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("Firestore · Security Rules (emulador)", () => {
  let env: RulesTestEnvironment;
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "localhost:8080").split(":");

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-rules-red-clinica",
      firestore: { host, port: Number(port), rules: readFileSync("db/firestore/firestore.rules", "utf8") },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc("pacientes/p1").set({ id_institucion: 4, dpi_cui: "3318009140101", estado: "activo", primer_nombre: "Sebastián" });
      await db.doc("pacientes/p1/crecimiento/r1").set({ peso_kg: 20, id_consulta: "c1" });
      await db.doc("consultas/c1").set({ id_institucion: 4, id_paciente: "p1", estado: "programada", notas_clinicas: null, diagnosticos: [] });
      await db.doc("medicamentos/m1").set({ nombre_generico: "Paracetamol" });
    });
  });
  afterAll(() => env.cleanup());

  const as = (role: string, institutionId = 4) => env.authenticatedContext(`u-${role}-${institutionId}`, { role, institutionId }).firestore();

  it("secretaría: lee el paciente pero no la consulta ni la antropometría", async () => {
    const db = as("secretaria");
    await assertSucceeds(db.doc("pacientes/p1").get());
    await assertFails(db.doc("consultas/c1").get());
    await assertFails(db.doc("pacientes/p1/crecimiento/r1").get());
  });

  it("secretaría: puede programar o cancelar citas, pero no registrar notas ni diagnósticos", async () => {
    const db = as("secretaria");
    await assertSucceeds(db.doc("consultas/c2").set({ id_institucion: 4, id_paciente: "p1", estado: "programada", diagnosticos: [] }));
    await assertFails(db.doc("consultas/c3").set({ id_institucion: 4, id_paciente: "p1", estado: "programada", diagnosticos: [{ codigo_cie10: "J06.9" }] }));
    await assertSucceeds(db.doc("consultas/c1").update({ estado: "cancelada" }));
    await assertFails(db.doc("consultas/c2").update({ notas_clinicas: "Nota" }));
  });

  it("médico: acceso clínico completo de su sede; otra sede y borrados denegados", async () => {
    await assertSucceeds(as("medico").doc("consultas/c2").get());
    await assertSucceeds(as("medico").doc("pacientes/p1/crecimiento/r1").get());
    await assertFails(as("medico", 1).doc("pacientes/p1").get());
    await assertFails(as("medico").doc("pacientes/p1").delete());
  });

  it("admin: gestiona catálogos, no altera pacientes; sin autenticación no hay acceso", async () => {
    await assertSucceeds(as("admin").doc("medicamentos/m2").set({ nombre_generico: "Ibuprofeno" }));
    await assertFails(as("medico").doc("medicamentos/m3").set({ nombre_generico: "X" }));
    await assertFails(as("admin").doc("pacientes/p1").update({ telefono: "1" }));
    await assertFails(env.unauthenticatedContext().firestore().doc("medicamentos/m1").get());
  });
});

describe("Sanity", () => {
  it("los 4 motores siguen siendo los asignados por institución", async () => {
    const { INSTITUTION_ENGINES } = await import("../src/container.ts");
    expect(INSTITUTION_ENGINES).toEqual({ 1: "postgres", 2: "mysql", 3: "mongodb", 4: "firestore" });
  });
});
