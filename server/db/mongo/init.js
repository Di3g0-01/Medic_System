// =====================================================================
// Laboratorio Clínico (i3) · MongoDB 7 · replica set rs0
// Ejecutar:  mongosh "mongodb://localhost:27017/laboratorio_clinico?directConnection=true" --file init.js
//
// Modelo (ver docs/modelo-nosql.md):
//   pacientes            → EMBEBE alergias[] y contactos_emergencia[] (1:pocos, ciclo de vida acoplado)
//   consultas            → REFERENCIA id_paciente; EMBEBE diagnosticos[].tratamientos[].recetas[]
//   examenes_laboratorio → REFERENCIA id_consulta + id_paciente; resultados[] heterogéneos
//   medicamentos, vacunas, tipos_examen, medicos, instituciones → colecciones maestras referenciadas
// Fechas: BSON Date; las horas clínicas se guardan como hora local "naive" en UTC.
// =====================================================================
/* global db, ObjectId, NumberInt, print */

const ID = {
  institucion: NumberInt(3),
  medico: ObjectId("665f00000000000000000001"),
  med: [ObjectId("665f00000000000000000a01"), ObjectId("665f00000000000000000a02"), ObjectId("665f00000000000000000a03")],
  vac: [ObjectId("665f00000000000000000b01"), ObjectId("665f00000000000000000b02"), ObjectId("665f00000000000000000b03")],
  exa: [ObjectId("665f00000000000000000c01"), ObjectId("665f00000000000000000c02"), ObjectId("665f00000000000000000c03")],
  paciente: ObjectId("665f00000000000000000d01"),
  consulta: ObjectId("665f00000000000000000e01"),
  examen: ObjectId("665f00000000000000000f01"),
};
const d = (s) => new Date(s.length === 10 ? `${s}T00:00:00Z` : `${s}:00Z`);
const str = { bsonType: "string" };
const optStr = { bsonType: ["string", "null"] };
const date = { bsonType: "date" };

const validators = {
  instituciones: {
    bsonType: "object",
    required: ["_id", "nombre", "tipo"],
    properties: { nombre: str, tipo: { enum: ["hospital", "clinica", "laboratorio", "pediatrico"] } },
  },
  medicos: {
    bsonType: "object",
    required: ["nombre_completo", "no_colegiado", "estado", "id_institucion"],
    properties: {
      nombre_completo: str,
      no_colegiado: str,
      estado: { enum: ["activo", "inactivo"] },
      id_institucion: { bsonType: "int" },
    },
  },
  pacientes: {
    bsonType: "object",
    required: ["primer_nombre", "primer_apellido", "fecha_nacimiento", "sexo", "dpi_cui", "fecha_registro", "estado", "id_institucion", "alergias", "contactos_emergencia"],
    properties: {
      primer_nombre: str,
      primer_apellido: str,
      fecha_nacimiento: date,
      sexo: { enum: ["m", "f", "o"] },
      dpi_cui: { bsonType: "string", pattern: "^[0-9]{13}$" },
      correo: optStr,
      tipo_sangre: { enum: ["a+", "a-", "b+", "b-", "ab+", "ab-", "o+", "o-", null] },
      estado: { enum: ["activo", "archivado", "fallecido"] },
      id_institucion: { bsonType: "int" },
      ultima_visita: { bsonType: ["date", "null"] },
      alergias: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["alergia"],
          properties: { alergia: str, reaccion: optStr, severidad: { enum: ["leve", "moderada", "grave", null] } },
        },
      },
      contactos_emergencia: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["nombre_completo", "parentesco", "telefono"],
          properties: { nombre_completo: str, parentesco: str, telefono: str, telefono_alternativo: optStr },
        },
      },
    },
  },
  consultas: {
    bsonType: "object",
    required: ["fecha_hora", "motivo_consulta", "estado", "id_paciente", "id_medico", "id_institucion", "diagnosticos"],
    properties: {
      fecha_hora: date,
      motivo_consulta: str,
      notas_clinicas: optStr,
      estado: { enum: ["programada", "atendida", "cancelada"] },
      id_paciente: { bsonType: "objectId" },
      id_medico: { bsonType: "objectId" },
      id_institucion: { bsonType: "int" },
      diagnosticos: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["_id", "descripcion", "fecha", "tratamientos"],
          properties: {
            codigo_cie10: optStr,
            descripcion: str,
            tipo: { enum: ["presuntivo", "definitivo", "diferencial", null] },
            fecha: date,
            tratamientos: {
              bsonType: "array",
              items: {
                bsonType: "object",
                required: ["_id", "descripcion", "fecha_inicio", "recetas"],
                properties: {
                  descripcion: str,
                  fecha_inicio: date,
                  fecha_fin_estimada: { bsonType: ["date", "null"] },
                  recetas: {
                    bsonType: "array",
                    items: {
                      bsonType: "object",
                      required: ["_id", "dosis", "frecuencia", "id_medicamento"],
                      properties: {
                        dosis: str,
                        frecuencia: str,
                        duracion_dias: { bsonType: ["int", "null"], minimum: 1 },
                        indicaciones: optStr,
                        id_medicamento: { bsonType: "objectId" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  // Resultados heterogéneos: solo parametro/valor_obtenido son obligatorios;
  // cada prueba puede añadir campos propios (unidad, antibiograma, interpretación…).
  examenes_laboratorio: {
    bsonType: "object",
    required: ["fecha_solicitud", "estado", "id_consulta", "id_paciente", "id_tipo_examen", "resultados"],
    properties: {
      fecha_solicitud: date,
      estado: { enum: ["solicitado", "en_proceso", "completado"] },
      id_consulta: { bsonType: "objectId" },
      id_paciente: { bsonType: "objectId" },
      id_tipo_examen: { bsonType: "objectId" },
      resultados: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["parametro", "valor_obtenido"],
          properties: { parametro: str, valor_obtenido: str, rango_referencia: optStr, observaciones: optStr },
        },
      },
    },
  },
  medicamentos: { bsonType: "object", required: ["nombre_generico"], properties: { nombre_generico: str } },
  vacunas: {
    bsonType: "object",
    required: ["nombre_vacuna", "dosis_requeridas"],
    properties: { nombre_vacuna: str, dosis_requeridas: { bsonType: "int", minimum: 1 } },
  },
  tipos_examen: { bsonType: "object", required: ["nombre"], properties: { nombre: str } },
};

const existing = db.getCollectionNames();
for (const [name, schema] of Object.entries(validators)) {
  const options = { validator: { $jsonSchema: schema }, validationLevel: "strict", validationAction: "error" };
  if (existing.includes(name)) db.runCommand({ collMod: name, ...options });
  else db.createCollection(name, options);
}

db.pacientes.createIndex({ dpi_cui: 1 }, { unique: true, name: "uq_dpi_cui" });
db.pacientes.createIndex({ correo: 1 }, { unique: true, name: "uq_correo", partialFilterExpression: { correo: { $type: "string" } } });
db.pacientes.createIndex({ id_institucion: 1, primer_apellido: 1 });
db.consultas.createIndex({ id_paciente: 1, fecha_hora: -1 });
db.consultas.createIndex(
  { id_medico: 1, fecha_hora: 1 },
  { unique: true, name: "uq_horario_medico", partialFilterExpression: { estado: { $in: ["programada", "atendida"] } } },
);
db.examenes_laboratorio.createIndex({ id_paciente: 1, fecha_solicitud: -1 });
db.examenes_laboratorio.createIndex({ id_consulta: 1 });
db.examenes_laboratorio.createIndex({ estado: 1 });
db.medicos.createIndex({ no_colegiado: 1 }, { unique: true });

if (db.instituciones.countDocuments() > 0) {
  print("laboratorio_clinico: seed ya aplicado, se omite");
} else {
  db.instituciones.insertOne({ _id: ID.institucion, nombre: "Laboratorio Clínico", tipo: "laboratorio", direccion: "Zona 9, Ciudad de Guatemala", telefono: "2200-3000" });
  db.medicos.insertOne({ _id: ID.medico, nombre_completo: "Dr. Diego Morales", no_colegiado: "COL-30877", especialidad: "Patología clínica", estado: "activo", id_institucion: NumberInt(3) });
  db.medicamentos.insertMany([
    { _id: ID.med[0], nombre_generico: "Paracetamol", nombre_comercial: "Panadol", presentacion: "Tableta oral", concentracion: "500 mg" },
    { _id: ID.med[1], nombre_generico: "Amoxicilina", nombre_comercial: "Amoxil", presentacion: "Cápsula oral", concentracion: "500 mg" },
    { _id: ID.med[2], nombre_generico: "Atorvastatina", nombre_comercial: "Lipitor", presentacion: "Tableta oral", concentracion: "20 mg" },
  ]);
  db.vacunas.insertMany([
    { _id: ID.vac[0], nombre_vacuna: "BCG", dosis_requeridas: NumberInt(1) },
    { _id: ID.vac[1], nombre_vacuna: "Pentavalente", dosis_requeridas: NumberInt(3) },
    { _id: ID.vac[2], nombre_vacuna: "Influenza", dosis_requeridas: NumberInt(1) },
  ]);
  db.tipos_examen.insertMany([
    { _id: ID.exa[0], nombre: "Hematología completa", descripcion: "8 parámetros" },
    { _id: ID.exa[1], nombre: "Perfil lipídico", descripcion: "4 parámetros" },
    { _id: ID.exa[2], nombre: "Glucosa en ayunas", descripcion: "1 parámetro" },
  ]);
  db.pacientes.insertOne({
    _id: ID.paciente,
    primer_nombre: "Ricardo",
    segundo_nombre: "Antonio",
    primer_apellido: "Fuentes",
    segundo_apellido: "Reyes",
    fecha_nacimiento: d("1976-03-11"),
    sexo: "m",
    dpi_cui: "1672441900101",
    telefono: "5555-0182",
    correo: "ricardo.fuentes@correo.gt",
    direccion: "Zona 10, Ciudad de Guatemala",
    municipio: "Guatemala",
    departamento: "Guatemala",
    tipo_sangre: "o+",
    fecha_registro: d("2025-03-01T08:00"),
    estado: "activo",
    id_institucion: NumberInt(3),
    ultima_visita: d("2026-03-21T08:00"),
    alergias: [{ alergia: "Penicilina", reaccion: "Urticaria", severidad: "moderada" }],
    contactos_emergencia: [{ nombre_completo: "Andrea López", parentesco: "Hermana", telefono: "5555-0199", telefono_alternativo: null }],
  });
  db.consultas.insertOne({
    _id: ID.consulta,
    fecha_hora: d("2026-03-21T08:00"),
    motivo_consulta: "Control de perfil lipídico",
    notas_clinicas: "Paciente en ayunas de 12 horas. Se toma muestra.",
    estado: "atendida",
    id_paciente: ID.paciente,
    id_medico: ID.medico,
    id_institucion: NumberInt(3),
    diagnosticos: [],
  });
  db.examenes_laboratorio.insertOne({
    _id: ID.examen,
    fecha_solicitud: d("2026-03-22T07:30"),
    estado: "completado",
    id_consulta: ID.consulta,
    id_paciente: ID.paciente,
    id_tipo_examen: ID.exa[1],
    resultados: [
      { parametro: "Colesterol total", valor_obtenido: "184 mg/dL", rango_referencia: "< 200 mg/dL", observaciones: null, unidad: "mg/dL" },
      { parametro: "Triglicéridos", valor_obtenido: "132 mg/dL", rango_referencia: "< 150 mg/dL", observaciones: null, unidad: "mg/dL" },
    ],
  });
  print("laboratorio_clinico: seed aplicado");
}
