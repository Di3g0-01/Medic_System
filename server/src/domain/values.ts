/** Tipos de valor y dominios enumerados del diccionario de datos (PDF §4). */
export type Role = "medico" | "secretaria" | "admin";
export type InstitutionId = number;
export type InstitutionKind = "hospital" | "clinica" | "laboratorio" | "pediatrico";
export type PatientStatus = "activo" | "archivado" | "fallecido";
export type ConsultationStatus = "programada" | "atendida" | "cancelada";
export type LabStatus = "solicitado" | "en_proceso" | "completado";
export type DiagnosisType = "presuntivo" | "diferencial" | "definitivo";
export type Sex = "m" | "f" | "o";
export type Severity = "leve" | "moderada" | "grave";
export type UserStatus = "activo" | "bloqueado" | "inactivo";

export const BLOOD_TYPES = ["a+", "a-", "b+", "b-", "ab+", "ab-", "o+", "o-"] as const;

/** Fecha civil "YYYY-MM-DD". */
export type IsoDate = string;
/** Fecha y hora local sin zona "YYYY-MM-DDTHH:mm" (timestamp del diccionario). */
export type LocalDateTime = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function isLocalDateTime(value: string): boolean {
  return LOCAL_DATE_TIME.test(value) && !Number.isNaN(Date.parse(`${value}:00Z`));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Reloj inyectable para pruebas. */
export interface Clock {
  now(): LocalDateTime;
}

export const systemClock: Clock = {
  now: () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
};
