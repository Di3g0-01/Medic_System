import type {
  Admission,
  Appointment,
  CatalogItem,
  Consultation,
  GrowthRecord,
  Institution,
  LabOrder,
  Patient,
  User,
  VaccineRecord,
} from "../types";

export const institutions: Institution[] = [
  { id: "i1", name: "Hospital General", shortName: "HG", type: "hospital" },
  { id: "i2", name: "Clínica Odontológica", shortName: "CO", type: "odontologica" },
  { id: "i3", name: "Laboratorio Clínico", shortName: "LC", type: "laboratorio" },
  { id: "i4", name: "Centro Médico Pediátrico", shortName: "CMP", type: "pediatrica" },
];

export const users: User[] = [
  {
    id: "u1",
    name: "Dra. Ana Lucía Méndez",
    username: "medico",
    role: "medico",
    institutionId: "i1",
    specialty: "Medicina interna",
  },
  {
    id: "u2",
    name: "María José Pineda",
    username: "secretaria",
    role: "secretaria",
    institutionId: "i2",
  },
  { id: "u3", name: "Carlos Roberto León", username: "admin", role: "admin", institutionId: "i3" },
  {
    id: "u4",
    name: "Dra. Sofía Herrera",
    username: "pediatra",
    role: "medico",
    institutionId: "i4",
    specialty: "Pediatría",
  },
  {
    id: "u5",
    name: "Dr. Diego Morales",
    username: "laboratorio",
    role: "medico",
    institutionId: "i3",
    specialty: "Patología clínica",
  },
];

const basePatients: Omit<
  Patient,
  | "id"
  | "firstName"
  | "middleName"
  | "lastName"
  | "secondLastName"
  | "cui"
  | "email"
  | "institutionId"
  | "lastVisit"
  | "birthDate"
  | "sex"
> = {
  phone: "5555-0182",
  address: "Zona 10, Ciudad de Guatemala",
  municipality: "Guatemala",
  department: "Guatemala",
  bloodType: "O+",
  status: "activo",
  allergies: [{ substance: "Penicilina", reaction: "Urticaria", severity: "moderada" }],
  emergencyContacts: [{ name: "Andrea López", relationship: "Hermana", phone: "5555-0199" }],
};

export const patients: Patient[] = [
  [
    "p1",
    "Lucía",
    "Fernanda",
    "López",
    "García",
    "2001-05-14",
    "F",
    "2784 10293 0101",
    "lucia.lopez@correo.gt",
    "i1",
    "2026-03-23",
  ],
  [
    "p2",
    "Mateo",
    "José",
    "Ramírez",
    "Soto",
    "1988-11-02",
    "M",
    "1942 77381 0101",
    "mateo.ramirez@correo.gt",
    "i1",
    "2026-03-22",
  ],
  [
    "p3",
    "Valeria",
    "Isabel",
    "Castillo",
    "Ruiz",
    "1994-07-19",
    "F",
    "3021 49027 0101",
    "valeria.castillo@correo.gt",
    "i2",
    "2026-03-20",
  ],
  [
    "p4",
    "Sebastián",
    "Andrés",
    "Morales",
    "Díaz",
    "2018-01-30",
    "M",
    "3318 00914 0101",
    "familia.morales@correo.gt",
    "i4",
    "2026-03-24",
  ],
  [
    "p5",
    "Camila",
    "Alejandra",
    "Herrera",
    "Paz",
    "2021-09-08",
    "F",
    "3510 88321 0101",
    "camila.herrera@correo.gt",
    "i4",
    "2026-03-18",
  ],
  [
    "p6",
    "Ricardo",
    "Antonio",
    "Fuentes",
    "Reyes",
    "1976-03-11",
    "M",
    "1672 44190 0101",
    "ricardo.fuentes@correo.gt",
    "i3",
    "2026-03-21",
  ],
  [
    "p7",
    "Elena",
    "María",
    "Cabrera",
    "Vega",
    "1965-12-26",
    "F",
    "1459 21004 0101",
    "elena.cabrera@correo.gt",
    "i1",
    "2026-03-17",
  ],
  [
    "p8",
    "Daniel",
    "Estuardo",
    "Vásquez",
    "Lima",
    "1999-06-05",
    "M",
    "2890 11572 0101",
    "daniel.vasquez@correo.gt",
    "i2",
    "2026-03-15",
  ],
].map(
  ([
    id,
    firstName,
    middleName,
    lastName,
    secondLastName,
    birthDate,
    sex,
    cui,
    email,
    institutionId,
    lastVisit,
  ]) => ({
    ...basePatients,
    id,
    firstName,
    middleName,
    lastName,
    secondLastName,
    birthDate,
    sex: sex as "F" | "M",
    cui,
    email,
    institutionId,
    lastVisit,
  }),
);

patients[6].status = "archivado";
patients[3].allergies = [];

export const appointments: Appointment[] = [
  {
    id: "a1",
    patientId: "p1",
    doctorId: "u1",
    institutionId: "i1",
    date: "2026-03-24",
    time: "08:30",
    reason: "Control de presión arterial",
    status: "programada",
  },
  {
    id: "a2",
    patientId: "p2",
    doctorId: "u1",
    institutionId: "i1",
    date: "2026-03-24",
    time: "10:00",
    reason: "Dolor abdominal",
    status: "programada",
  },
  {
    id: "a3",
    patientId: "p7",
    doctorId: "u1",
    institutionId: "i1",
    date: "2026-03-24",
    time: "11:30",
    reason: "Seguimiento",
    status: "atendida",
  },
  {
    id: "a4",
    patientId: "p4",
    doctorId: "u4",
    institutionId: "i4",
    date: "2026-03-24",
    time: "09:00",
    reason: "Control de crecimiento",
    status: "programada",
  },
  {
    id: "a5",
    patientId: "p3",
    doctorId: "u2",
    institutionId: "i2",
    date: "2026-03-25",
    time: "14:00",
    reason: "Limpieza dental",
    status: "cancelada",
  },
];

export const consultations: Consultation[] = [
  {
    id: "c1",
    patientId: "p1",
    date: "2026-02-10",
    reason: "Cefalea recurrente",
    notes: "Dolor frontal de intensidad moderada, sin signos de alarma.",
    doctor: "Dra. Ana Lucía Méndez",
    status: "atendida",
    diagnoses: [
      {
        id: "d1",
        patientId: "p1",
        date: "2026-02-10",
        cie10: "G44.2",
        description: "Cefalea tensional",
        type: "definitivo",
        doctor: "Dra. Ana Lucía Méndez",
      },
    ],
    prescriptions: [
      {
        medicine: "Paracetamol 500 mg",
        dose: "1 tableta",
        frequency: "Cada 8 horas",
        duration: "5 días",
        instructions: "Tomar después de alimentos si hay dolor.",
      },
    ],
  },
  {
    id: "c2",
    patientId: "p2",
    date: "2026-01-18",
    reason: "Control metabólico",
    notes: "Paciente estable. Se refuerzan hábitos saludables.",
    doctor: "Dra. Ana Lucía Méndez",
    status: "atendida",
    diagnoses: [
      {
        id: "d2",
        patientId: "p2",
        date: "2026-01-18",
        cie10: "E78.5",
        description: "Hiperlipidemia",
        type: "definitivo",
        doctor: "Dra. Ana Lucía Méndez",
      },
    ],
    prescriptions: [
      {
        medicine: "Atorvastatina 20 mg",
        dose: "1 tableta",
        frequency: "Cada noche",
        duration: "30 días",
        instructions: "Continuar hasta próxima evaluación.",
      },
    ],
  },
];

export const labOrders: LabOrder[] = [
  {
    id: "LAB-1048",
    patientId: "p1",
    type: "Hematología completa",
    requestedAt: "2026-03-23",
    status: "en_proceso",
    requestedBy: "Dra. Ana Lucía Méndez",
    parameters: [
      { name: "Hemoglobina", value: "", range: "12–16 g/dL" },
      { name: "Leucocitos", value: "", range: "4.5–11 x10³/µL" },
    ],
  },
  {
    id: "LAB-1047",
    patientId: "p6",
    type: "Perfil lipídico",
    requestedAt: "2026-03-22",
    status: "completado",
    requestedBy: "Dr. Diego Morales",
    parameters: [
      { name: "Colesterol total", value: "184 mg/dL", range: "< 200 mg/dL" },
      { name: "Triglicéridos", value: "132 mg/dL", range: "< 150 mg/dL" },
    ],
  },
  {
    id: "LAB-1049",
    patientId: "p2",
    type: "Glucosa en ayunas",
    requestedAt: "2026-03-24",
    status: "solicitado",
    requestedBy: "Dra. Ana Lucía Méndez",
    parameters: [{ name: "Glucosa", value: "", range: "70–100 mg/dL" }],
  },
];

export const growthRecords: GrowthRecord[] = [
  { date: "2024-03-10", weight: 17.2, height: 104, headCircumference: 51 },
  { date: "2025-03-12", weight: 20.1, height: 112, headCircumference: 52 },
  { date: "2026-03-18", weight: 23.4, height: 120, headCircumference: 53 },
];

export const vaccineRecords: VaccineRecord[] = [
  { name: "BCG", dose: "Única", date: "2018-01-31", lot: "BCG-1804", status: "aplicada" },
  {
    name: "Pentavalente",
    dose: "Refuerzo",
    date: "2019-07-31",
    lot: "PV-1912",
    status: "aplicada",
  },
  { name: "Influenza", dose: "Anual", status: "pendiente" },
];

export const admissions: Admission[] = [
  {
    id: "int1",
    admissionDate: "2025-11-03",
    bed: "M-204",
    reason: "Neumonía adquirida en comunidad",
    dischargeDate: "2025-11-08",
  },
];

export const medicines: CatalogItem[] = [
  { id: "m1", name: "Paracetamol 500 mg", detail: "Tableta oral", status: "activo" },
  { id: "m2", name: "Amoxicilina 500 mg", detail: "Cápsula oral", status: "activo" },
  { id: "m3", name: "Atorvastatina 20 mg", detail: "Tableta oral", status: "activo" },
];

export const vaccineCatalog: CatalogItem[] = [
  { id: "v1", name: "BCG", detail: "Dosis única", status: "activo" },
  { id: "v2", name: "Pentavalente", detail: "Esquema de 3 dosis", status: "activo" },
];

export const examCatalog: CatalogItem[] = [
  { id: "e1", name: "Hematología completa", detail: "8 parámetros", status: "activo" },
  { id: "e2", name: "Perfil lipídico", detail: "4 parámetros", status: "activo" },
];
