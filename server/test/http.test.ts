/** API REST: OP-SEC-01..03 y RBAC aplicado en el backend (no basta con ocultar en la UI). */
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { buildServer } from "../src/main.ts";
import { uniqueDpi } from "./helpers.ts";

const config = loadConfig();
const { app, container } = buildServer(config);
const api = request(app);
const tokens: Record<string, string> = {};

const login = async (username: string, password = "demo123") => api.post("/api/auth/login").send({ username, password });
const as = (user: string) => ({ Authorization: `Bearer ${tokens[user]}` });

beforeAll(async () => {
  for (const u of ["medico", "secretaria", "admin", "pediatra", "laboratorio", "odontologo"]) tokens[u] = (await login(u)).body.token;
});
afterAll(() => container.close());

describe("OP-SEC-01..03 · autenticación y enrutamiento", () => {
  it("emite JWT con userId, role e institutionId y actualiza ultimo_acceso", async () => {
    const before = Date.now();
    const res = await login("medico");
    expect(res.status).toBe(200);
    const claims = JSON.parse(Buffer.from(res.body.token.split(".")[1], "base64url").toString());
    expect(claims).toMatchObject({ userId: 1, role: "medico", institutionId: 1, doctorId: "1" });
    expect(res.body.institution).toMatchObject({ id: "i1", name: "Hospital General", type: "hospital", engine: "PostgreSQL" });

    const pool = new pg.Pool({ connectionString: config.centralUrl });
    const { rows } = await pool.query("SELECT ultimo_acceso FROM usuario WHERE id_usuario = 1");
    await pool.end();
    expect(new Date(`${rows[0].ultimo_acceso.replace(" ", "T")}Z`).getTime()).toBeGreaterThan(before - 120_000);
  });

  it("rechaza contraseña incorrecta, peticiones sin token y usuarios bloqueados", async () => {
    expect((await login("medico", "mala")).status).toBe(401);
    expect((await api.get("/api/patients")).status).toBe(401);
    expect((await api.get("/api/patients").set({ Authorization: "Bearer x.y.z" })).status).toBe(401);

    const username = `temp${uniqueDpi().slice(-8)}`;
    const created = await api.post("/api/admin/users").set(as("admin")).send({ name: "Temporal", username, role: "secretaria", institutionId: "i2" });
    expect(created.status).toBe(201);
    expect((await login(username)).status).toBe(200); // contraseña inicial configurada
    await api.patch(`/api/admin/users/${created.body.id}`).set(as("admin")).send({ blocked: true });
    const blocked = await login(username);
    expect(blocked.status).toBe(401);
    expect(blocked.body.error).toMatch(/bloqueado/);
  });

  it("/auth/me restaura la sesión con institución y motor", async () => {
    const res = await api.get("/api/auth/me").set(as("pediatra"));
    expect(res.body.user).toMatchObject({ username: "pediatra", specialty: "Pediatría" });
    expect(res.body.institution).toMatchObject({ id: "i4", engine: "Firestore" });
  });
});

describe("Eje C · RBAC en la API", () => {
  it("secretaría: ve datos confidenciales y agenda, pero el backend NO devuelve notas, diagnósticos ni recetas", async () => {
    const patients = await api.get("/api/patients").set(as("secretaria"));
    expect(patients.status).toBe(200);
    expect(patients.body.length).toBeGreaterThan(0);
    expect(patients.body[0]).toHaveProperty("cui");

    const appointments = await api.get("/api/appointments").set(as("secretaria"));
    expect(appointments.status).toBe(200);
    for (const a of appointments.body) {
      expect(a).not.toHaveProperty("notes");
      expect(a).not.toHaveProperty("diagnoses");
    }

    const pid = patients.body[0].id;
    for (const path of ["consultations", "pharmacotherapy", "lab-orders", "growth", "vaccines", "admissions"])
      expect((await api.get(`/api/patients/${pid}/${path}`).set(as("secretaria"))).status, path).toBe(403);
    expect((await api.post("/api/consultations").set(as("secretaria")).send({ patientId: pid, reason: "x", status: "atendida" })).status).toBe(403);
    expect((await api.get("/api/admin/users").set(as("secretaria"))).status).toBe(403);
  });

  it("admin: gestiona usuarios y catálogos, no altera el historial ni pacientes", async () => {
    expect((await api.get("/api/admin/users").set(as("admin"))).status).toBe(200);
    expect((await api.get("/api/admin/audit").set(as("admin"))).status).toBe(200);
    const patients = await api.get("/api/patients").set(as("admin"));
    const pid = patients.body[0].id;
    expect((await api.get(`/api/patients/${pid}/consultations`).set(as("admin"))).status).toBe(403);
    expect((await api.patch(`/api/patients/${pid}`).set(as("admin")).send({ phone: "1" })).status).toBe(403);
    const item = await api.post("/api/catalogs/medicines").set(as("admin")).send({ name: `Ibuprofeno ${uniqueDpi().slice(-3)} mg`, detail: "Tableta oral" });
    expect(item.status).toBe(201);
    expect(item.body).toMatchObject({ detail: "Tableta oral", status: "activo" });
  });

  it("médico: único que registra diagnósticos y recetas", async () => {
    const res = await api.get("/api/patients").set(as("medico"));
    const pid = res.body.find((p: { status: string }) => p.status === "activo").id;
    expect((await api.get(`/api/patients/${pid}/consultations`).set(as("medico"))).status).toBe(200);
    expect((await api.get(`/api/patients/${pid}/pharmacotherapy`).set(as("medico"))).status).toBe(200);
  });

  it("aislamiento entre sedes: un id de otra institución no es visible", async () => {
    // Paciente semilla id 1 del hospital (Lucía López); MySQL también tiene un paciente semilla con id 1.
    const hospital = (await api.get("/api/patients/1").set(as("medico"))).body;
    expect(hospital.institutionId).toBe("i1");
    // Firestore y Mongo no tienen ese id: 404
    expect((await api.get(`/api/patients/${hospital.id}`).set(as("pediatra"))).status).toBe(404);
    // MySQL tiene su PROPIO paciente con el mismo id entero: nunca recibe el registro del hospital
    const clinic = await api.get(`/api/patients/${hospital.id}`).set(as("odontologo"));
    expect(clinic.body.cui).not.toBe(hospital.cui);
    expect(clinic.body.institutionId).toBe("i2");
    // Por DPI, el paciente del hospital no existe en la clínica
    expect((await api.get(`/api/patients/by-dpi/${encodeURIComponent(hospital.cui)}`).set(as("odontologo"))).status).toBe(404);
  });
});

describe("Validaciones de dominio expuestas por la API", () => {
  it("DPI duplicado → 409; CIE-10 inválido → 422; borrador con diagnóstico → 422", async () => {
    const existing = (await api.get("/api/patients").set(as("medico"))).body[0];
    const dup = await api
      .post("/api/patients")
      .set(as("medico"))
      .send({ ...existing, email: `otro.${uniqueDpi()}@correo.gt` });
    expect(dup.status).toBe(409);

    const base = { patientId: existing.id, reason: "Dolor", notes: "Notas", prescriptions: [] };
    const badCie = await api
      .post("/api/consultations")
      .set(as("medico"))
      .send({ ...base, status: "atendida", diagnoses: [{ cie10: "XX", description: "x", type: "presuntivo" }] });
    expect(badCie.status).toBe(422);
    expect(badCie.body.error).toMatch(/CIE-10/);

    const draft = await api
      .post("/api/consultations")
      .set(as("medico"))
      .send({ ...base, status: "abierta", diagnoses: [{ cie10: "R51", description: "Cefalea", type: "presuntivo" }] });
    expect(draft.status).toBe(422);
  });
});
