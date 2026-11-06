/**
 * Prueba cruzada (INSTRUCCIONES §7 · 5.4): el MISMO flujo clínico vía API con
 * un médico de cada institución (un motor distinto cada uno) y comparación de
 * resultados normalizados. Con CROSS_REPORT=1 escribe docs/prueba-cruzada.md.
 */
import { writeFileSync } from "node:fs";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/main.ts";
import { uniqueDpi, uniqueSlot } from "./helpers.ts";

const { app, container } = buildServer();
const api = request(app);
afterAll(() => container.close());

const DOCTORS = [
  { user: "medico", institution: "Hospital General", engine: "PostgreSQL" },
  { user: "odontologo", institution: "Clínica Odontológica", engine: "MySQL" },
  { user: "laboratorio", institution: "Laboratorio Clínico", engine: "MongoDB" },
  { user: "pediatra", institution: "Centro Médico Pediátrico", engine: "Firestore" },
];

type Json = Record<string, any>;

async function runFlow(username: string) {
  const login = await api.post("/api/auth/login").send({ username, password: "demo123" });
  const auth = { Authorization: `Bearer ${login.body.token}` };
  const call = async (method: "get" | "post" | "patch", path: string, body?: unknown) => {
    const res = await api[method](`/api${path}`).set(auth).send(body as object);
    if (res.status >= 400) throw new Error(`${username} ${method.toUpperCase()} ${path} → ${res.status} ${res.body.error}`);
    return res.body;
  };
  const dpi = uniqueDpi();
  const slot = uniqueSlot();
  const steps: Json = { engine: login.body.institution.engine, slot };

  // 1) Alta de paciente (OP-PAC-01)
  const patient = await call("post", "/patients", {
    firstName: "Ana",
    middleName: "Cruzada",
    lastName: "Prueba",
    secondLastName: "Motores",
    birthDate: "1985-02-20",
    sex: "F",
    cui: dpi,
    phone: "5555-7777",
    email: `cruzada.${dpi}@correo.gt`,
    address: "Zona 4",
    municipality: "Guatemala",
    department: "Guatemala",
    bloodType: "B+",
    status: "activo",
    institutionId: "ignorado",
    allergies: [{ substance: "Sulfas", reaction: "Exantema", severity: "grave" }],
    emergencyContacts: [{ name: "Luis Prueba", relationship: "Esposo", phone: "5555-8888" }],
  });
  steps.alta = patient;

  // 2) Cita programada (OP-CON-01)
  steps.cita = await call("post", "/appointments", {
    patientId: patient.id,
    doctorId: login.body.user.doctorId,
    institutionId: "ignorado",
    date: slot.slice(0, 10),
    time: slot.slice(11, 16),
    reason: "Fiebre y odinofagia",
    status: "programada",
  });

  // 3) Atención + diagnóstico + receta en UNA transacción (OP-CON-02, OP-FAR-01..03)
  const consulta = await call("post", "/consultations", {
    id: "uuid-del-cliente",
    patientId: patient.id,
    appointmentId: steps.cita.id,
    date: slot.slice(0, 10),
    reason: "Fiebre y odinofagia",
    notes: "Amígdalas hipertróficas con exudado.",
    doctor: "ignorado",
    status: "atendida",
    diagnoses: [{ id: "dx-a", patientId: patient.id, date: slot.slice(0, 10), cie10: "j03.9", description: "Amigdalitis aguda", type: "definitivo", doctor: "" }],
    prescriptions: [{ medicine: "Amoxicilina 500 mg", dose: "1 cápsula", frequency: "Cada 8 horas", duration: "7 días", instructions: "Completar el esquema", diagnosisId: "dx-a" }],
  });
  steps.consulta = consulta;

  // 4) Diagnóstico adicional (OP-FAR-01) y plan con receta (OP-FAR-02/03)
  const conDx = await call("post", `/consultations/${consulta.id}/diagnoses`, { cie10: "R50.9", description: "Fiebre no especificada", type: "presuntivo", date: slot.slice(0, 10) });
  const fiebre = conDx.diagnoses.find((d: Json) => d.cie10 === "R50.9");
  steps.tratamiento = await call("post", `/diagnoses/${fiebre.id}/treatments`, {
    description: "Control de temperatura",
    startDate: slot.slice(0, 10),
    prescriptions: [{ medicine: "Paracetamol 500 mg", dose: "1 tableta", frequency: "Cada 6 horas si hay fiebre", duration: "3 días", instructions: null }],
  });

  // 5) Historial farmacoterapéutico (OP-FAR-04)
  steps.historial = await call("get", `/patients/${patient.id}/pharmacotherapy`);

  // 6) Archivo (OP-PAC-05) y lectura final (OP-PAC-03)
  await call("patch", `/patients/${patient.id}/status`, { status: "archivado" });
  steps.archivo = await call("get", `/patients/${patient.id}`);
  return steps;
}

/** Quita lo que legítimamente difiere entre motores: ids, DPI/correo únicos, institución y fechas dinámicas. */
function normalize(s: Json) {
  const patient = (p: Json) => {
    const { id: _id, cui: _cui, email: _email, institutionId: _inst, lastVisit: _lv, ...rest } = p;
    return rest;
  };
  const consultation = (c: Json) => ({
    status: c.status,
    reason: c.reason,
    notes: c.notes,
    diagnoses: c.diagnoses.map((d: Json) => ({ cie10: d.cie10, description: d.description, type: d.type })),
    prescriptions: c.prescriptions.map(({ diagnosisId: _d, ...p }: Json) => p),
  });
  return {
    alta: patient(s.alta),
    cita: { horaIgualALaSolicitada: `${s.cita.date}T${s.cita.time}` === s.slot, reason: s.cita.reason, status: s.cita.status },
    consulta: consultation(s.consulta),
    tratamiento: consultation(s.tratamiento),
    historial: s.historial
      .map((h: Json) => ({
        cie10: h.diagnosis.cie10,
        tratamiento: h.treatment.description,
        fin: h.treatment.estimatedEndDate ? "calculada" : null,
        medicamento: h.prescription.medicineName,
        dosis: h.prescription.dose,
        frecuencia: h.prescription.frequency,
        duracion: h.prescription.duration,
      }))
      .sort((a: Json, b: Json) => a.cie10.localeCompare(b.cie10)),
    archivo: { ...patient(s.archivo), lastVisitIgualACita: s.archivo.lastVisit === s.cita.date },
  };
}

describe("5.4 · Prueba cruzada: mismo flujo en los 4 motores", () => {
  it("Alta → Consulta → Diagnóstico → Receta → Archivo devuelven resultados equivalentes", async () => {
    const runs = [];
    for (const d of DOCTORS) runs.push({ ...d, raw: await runFlow(d.user) });
    const normalized = runs.map((r) => normalize(r.raw));

    expect(runs.map((r) => r.raw.engine)).toEqual(DOCTORS.map((d) => d.engine));
    for (const n of normalized.slice(1)) expect(n).toEqual(normalized[0]);

    const reference = normalized[0];
    expect(reference.consulta.diagnoses).toEqual([{ cie10: "J03.9", description: "Amigdalitis aguda", type: "definitivo" }]);
    expect(reference.historial).toHaveLength(2);
    expect(reference.archivo).toMatchObject({ status: "archivado", lastVisitIgualACita: true });

    if (process.env.CROSS_REPORT) {
      const rows = runs
        .map(
          (r) =>
            `| ${r.institution} | **${r.engine}** | ${r.raw.alta.id} | ${r.raw.cita.id} | ${r.raw.consulta.diagnoses.map((d: Json) => d.id).join(", ")} | ${r.raw.historial.length} recetas | ${r.raw.archivo.status} |`,
        )
        .join("\n");
      writeFileSync(
        "../docs/prueba-cruzada.md",
        `# Prueba cruzada 5.4 — resultados\n\nGenerado por \`pnpm --dir server cross-test\` el ${new Date().toISOString()}.\n\n` +
          `Flujo ejecutado vía API REST con un médico de cada institución: alta de paciente → cita → atención con diagnóstico y receta ` +
          `(transacción única) → diagnóstico adicional → tratamiento con receta → historial farmacoterapéutico → archivo.\n\n` +
          `## Identificadores nativos de cada motor (lo único que difiere)\n\n| Institución | Motor | id paciente | id consulta | ids diagnóstico | OP-FAR-04 | Estado final |\n|---|---|---|---|---|---|---|\n${rows}\n\n` +
          `## Resultado normalizado (idéntico en los 4 motores)\n\nSe excluyen ids, DPI/correo (únicos por corrida) e institución.\n\n\`\`\`json\n${JSON.stringify(reference, null, 2)}\n\`\`\`\n`,
      );
    }
  });
});
