/**
 * Seed del Centro Médico Pediátrico (i4) en Firestore.
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm db:seed:firestore [--reset]
 *
 * Estructura:
 *   instituciones/{4} · medicos/{id} · medicamentos · vacunas · tipos_examen
 *   pacientes/{id}  (alergias[] y contactos_emergencia[] embebidos)
 *     ├─ crecimiento/{id}   registro_crecimiento (id_consulta)
 *     └─ vacunas/{id}       esquema_vacunacion  (id_consulta, id_vacuna)
 *   consultas/{id}  (id_paciente referenciado; diagnosticos[] embebidos)
 *   pacientes_dpi/{dpi} · pacientes_correo/{correo}   centinelas de unicidad
 */
import { initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-red-clinica";
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
if (!emulator) throw new Error("Defina FIRESTORE_EMULATOR_HOST (p. ej. localhost:8080) para sembrar el emulador");

const db = getFirestore(initializeApp({ projectId }, "seed"));
const at = (v: string) => Timestamp.fromDate(new Date(v.length === 10 ? `${v}T00:00:00Z` : `${v}:00Z`));

if (process.argv.includes("--reset")) {
  const res = await fetch(`http://${emulator}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: "DELETE" });
  if (!res.ok) throw new Error(`No se pudo limpiar el emulador: ${res.status}`);
  console.log("firestore: emulador limpiado");
}

if ((await db.doc("instituciones/4").get()).exists) {
  console.log("firestore: seed ya aplicado, se omite");
  process.exit(0);
}

const DOCTOR = "medico-sofia-herrera";
const batch = db.batch();
const set = (path: string, data: Record<string, unknown>) => batch.set(db.doc(path), data);

set("instituciones/4", { nombre: "Centro Médico Pediátrico", tipo: "pediatrico", direccion: "Zona 15, Ciudad de Guatemala", telefono: "2200-4000" });
set(`medicos/${DOCTOR}`, { nombre_completo: "Dra. Sofía Herrera", no_colegiado: "COL-40562", especialidad: "Pediatría", estado: "activo", id_institucion: 4 });

set("medicamentos/med-paracetamol", { nombre_generico: "Paracetamol", nombre_comercial: "Panadol", presentacion: "Tableta oral", concentracion: "500 mg" });
set("medicamentos/med-amoxicilina", { nombre_generico: "Amoxicilina", nombre_comercial: "Amoxil", presentacion: "Cápsula oral", concentracion: "500 mg" });
set("medicamentos/med-atorvastatina", { nombre_generico: "Atorvastatina", nombre_comercial: "Lipitor", presentacion: "Tableta oral", concentracion: "20 mg" });
set("vacunas/vac-bcg", { nombre_vacuna: "BCG", dosis_requeridas: 1 });
set("vacunas/vac-pentavalente", { nombre_vacuna: "Pentavalente", dosis_requeridas: 3 });
set("vacunas/vac-influenza", { nombre_vacuna: "Influenza", dosis_requeridas: 1 });
set("tipos_examen/exa-hematologia", { nombre: "Hematología completa", descripcion: "8 parámetros" });
set("tipos_examen/exa-lipidico", { nombre: "Perfil lipídico", descripcion: "4 parámetros" });
set("tipos_examen/exa-glucosa", { nombre: "Glucosa en ayunas", descripcion: "1 parámetro" });

const basePatient = {
  telefono: "5555-0182",
  direccion: "Zona 10, Ciudad de Guatemala",
  municipio: "Guatemala",
  departamento: "Guatemala",
  tipo_sangre: "o+",
  estado: "activo",
  id_institucion: 4,
  contactos_emergencia: [{ nombre_completo: "Andrea López", parentesco: "Hermana", telefono: "5555-0199", telefono_alternativo: null }],
};
const patients = [
  {
    id: "pac-sebastian-morales",
    primer_nombre: "Sebastián",
    segundo_nombre: "Andrés",
    primer_apellido: "Morales",
    segundo_apellido: "Díaz",
    fecha_nacimiento: at("2018-01-30"),
    sexo: "m",
    dpi_cui: "3318009140101",
    correo: "familia.morales@correo.gt",
    fecha_registro: at("2018-01-31T08:00"),
    ultima_visita: at("2026-03-18T10:00"),
    alergias: [],
  },
  {
    id: "pac-camila-herrera",
    primer_nombre: "Camila",
    segundo_nombre: "Alejandra",
    primer_apellido: "Herrera",
    segundo_apellido: "Paz",
    fecha_nacimiento: at("2021-09-08"),
    sexo: "f",
    dpi_cui: "3510883210101",
    correo: "camila.herrera@correo.gt",
    fecha_registro: at("2021-09-10T08:00"),
    ultima_visita: at("2026-03-18T11:00"),
    alergias: [{ alergia: "Penicilina", reaccion: "Urticaria", severidad: "moderada" }],
  },
];
for (const { id, ...p } of patients) {
  set(`pacientes/${id}`, { ...basePatient, ...p });
  set(`pacientes_dpi/${p.dpi_cui}`, { id_paciente: id });
  set(`pacientes_correo/${p.correo}`, { id_paciente: id });
}

const consulta = (id: string, patient: string, when: string, motivo: string, estado: string, notas: string | null = null) =>
  set(`consultas/${id}`, {
    fecha_hora: at(when),
    motivo_consulta: motivo,
    notas_clinicas: notas,
    estado,
    id_paciente: patient,
    id_medico: DOCTOR,
    nombre_medico: "Dra. Sofía Herrera",
    id_institucion: 4,
    diagnosticos: [],
    ids_diagnosticos: [],
  });

const SEB = "pac-sebastian-morales";
// Vacunación de Sebastián (cada dosis requiere su consulta)
consulta("con-2018-01-31", SEB, "2018-01-31T09:00", "Vacunación del recién nacido", "atendida", "Aplicación de BCG.");
consulta("con-2018-03-30", SEB, "2018-03-30T09:00", "Vacunación 2 meses", "atendida", "Pentavalente dosis 1.");
consulta("con-2018-05-30", SEB, "2018-05-30T09:00", "Vacunación 4 meses", "atendida", "Pentavalente dosis 2.");
consulta("con-2018-07-31", SEB, "2018-07-31T09:00", "Vacunación 6 meses", "atendida", "Pentavalente dosis 3.");
// Controles de crecimiento
consulta("con-2024-03-10", SEB, "2024-03-10T10:00", "Control de crecimiento", "atendida", "Desarrollo adecuado para la edad.");
consulta("con-2025-03-12", SEB, "2025-03-12T10:00", "Control de crecimiento", "atendida", "Desarrollo adecuado para la edad.");
consulta("con-2026-03-18", SEB, "2026-03-18T10:00", "Control de crecimiento", "atendida", "Peso y talla en percentil 50.");
consulta("con-2026-03-18-camila", "pac-camila-herrera", "2026-03-18T11:00", "Control de niño sano", "atendida", "Sin hallazgos patológicos.");
// Cita programada (agenda del día)
consulta("con-2026-03-24", SEB, "2026-03-24T09:00", "Control de crecimiento", "programada");

const growth: [string, string, number, number, number][] = [
  ["2024-03-10", "con-2024-03-10", 17.2, 104, 51],
  ["2025-03-12", "con-2025-03-12", 20.1, 112, 52],
  ["2026-03-18", "con-2026-03-18", 23.4, 120, 53],
];
for (const [date, cid, peso, talla, pc] of growth)
  set(`pacientes/${SEB}/crecimiento/${cid}`, { fecha_medicion: at(date), peso_kg: peso, talla_cm: talla, perimetro_cefalico: pc, id_consulta: cid });

const doses: [string, string, string, number, string][] = [
  ["vac-bcg", "BCG", "con-2018-01-31", 1, "BCG-1804"],
  ["vac-pentavalente", "Pentavalente", "con-2018-03-30", 1, "PV-1803"],
  ["vac-pentavalente", "Pentavalente", "con-2018-05-30", 2, "PV-1805"],
  ["vac-pentavalente", "Pentavalente", "con-2018-07-31", 3, "PV-1807"],
];
for (const [vid, name, cid, n, lot] of doses)
  set(`pacientes/${SEB}/vacunas/${cid}-${vid}`, {
    id_vacuna: vid,
    nombre_vacuna: name,
    no_dosis: n,
    fecha_aplicacion: at(cid.slice(4, 14)),
    lote: lot,
    id_consulta: cid,
  });

await batch.commit();
console.log("firestore: seed aplicado (writeBatch atómico)");
process.exit(0);
