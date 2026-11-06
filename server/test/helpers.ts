import type { NewPatient } from "../src/domain/Patient.ts";

let seq = 0;
/** DPI de 13 dígitos único por ejecución. */
export function uniqueDpi(): string {
  seq += 1;
  return `9${String(Date.now()).slice(-9)}${String(seq).padStart(3, "0")}`.slice(0, 13);
}

/** Horario libre único (año 2031+, minuto aleatorio) para no chocar entre ejecuciones. */
export function uniqueSlot(): string {
  seq += 1;
  const n = (Date.now() / 1000 + seq * 7919) % 500_000;
  const day = new Date(Date.UTC(2031, 0, 1) + Math.floor(n) * 60_000 * 37);
  return day.toISOString().slice(0, 16);
}

export function newPatient(institutionId: number, overrides: Partial<NewPatient> = {}): NewPatient {
  const dpi = uniqueDpi();
  return {
    firstName: "Prueba",
    middleName: "Contrato",
    lastName: "Motor",
    secondLastName: null,
    birthDate: "1990-04-12",
    sex: "f",
    dpi,
    phone: "5555-0000",
    email: `prueba.${dpi}@correo.gt`,
    address: "Zona 1",
    municipality: "Guatemala",
    department: "Guatemala",
    bloodType: "a+",
    institutionId,
    allergies: [{ substance: "Látex", reaction: "Eritema", severity: "leve" }],
    emergencyContacts: [{ name: "Contacto Uno", relationship: "Madre", phone: "5555-1111", alternativePhone: null }],
    ...overrides,
  };
}
