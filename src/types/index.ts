export type Role = "medico" | "secretaria" | "admin";
export type InstitutionType = "hospital" | "odontologica" | "laboratorio" | "pediatrica";
export type PatientStatus = "activo" | "archivado" | "fallecido";
export type AppointmentStatus = "programada" | "atendida" | "cancelada";

export interface Institution {
  id: string;
  name: string;
  shortName: string;
  type: InstitutionType;
  /** Motor de base de datos que atiende la sede (solo con API real). */
  engine?: string;
}

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  institutionId: string;
  specialty?: string;
  blocked?: boolean;
  /** Perfil profesional (medico.id_medico) en el motor de su institución. */
  doctorId?: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  alternativePhone?: string;
}

export interface Allergy {
  substance: string;
  reaction: string;
  severity: "leve" | "moderada" | "grave";
}

export interface Patient {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  secondLastName?: string;
  birthDate: string;
  sex: "F" | "M";
  cui: string;
  phone: string;
  email: string;
  address: string;
  municipality: string;
  department: string;
  bloodType: string;
  status: PatientStatus;
  institutionId: string;
  lastVisit: string;
  allergies: Allergy[];
  emergencyContacts: EmergencyContact[];
}

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  institutionId: string;
  date: string;
  time: string;
  reason: string;
  status: AppointmentStatus;
}

export interface Diagnosis {
  id: string;
  patientId: string;
  date: string;
  cie10: string;
  description: string;
  type: "presuntivo" | "diferencial" | "definitivo";
  doctor: string;
}

export interface Prescription {
  medicine: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
  /** Diagnóstico que fundamenta la receta (cadena diagnóstico → tratamiento → receta). */
  diagnosisId?: string;
}

export interface Consultation {
  id: string;
  patientId: string;
  appointmentId?: string;
  date: string;
  reason: string;
  notes: string;
  doctor: string;
  status: "abierta" | "atendida";
  diagnoses: Diagnosis[];
  prescriptions: Prescription[];
}

export interface LabOrder {
  id: string;
  patientId: string;
  /** Consulta en la que se ordenó el examen (examen.id_consulta). */
  consultationId?: string;
  type: string;
  requestedAt: string;
  status: "solicitado" | "en_proceso" | "completado";
  requestedBy: string;
  parameters: { name: string; value: string; range: string; observations?: string }[];
}

export interface GrowthRecord {
  date: string;
  weight: number;
  height: number;
  headCircumference: number;
}

export interface VaccineRecord {
  name: string;
  dose: string;
  date?: string;
  lot?: string;
  status: "aplicada" | "pendiente";
}

export interface Admission {
  id: string;
  admissionDate: string;
  bed: string;
  reason: string;
  dischargeDate?: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  detail: string;
  status: "activo" | "inactivo";
}

export interface Doctor {
  id: string;
  name: string;
  specialty?: string;
}
