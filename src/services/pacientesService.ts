import { patients } from "../mocks/data";
import type { Patient, PatientStatus } from "../types";
import { mockResponse } from "./api";
import { enc, http, orUndefined, USE_MOCKS } from "./httpClient";

const mock = {
  list: (institutionId?: string) =>
    mockResponse(
      institutionId ? patients.filter((p) => p.institutionId === institutionId) : patients,
    ),
  get: (id: string) => mockResponse(patients.find((p) => p.id === id)),
  validateUnique: async (cui: string, email: string) => {
    const cuiExists = patients.some((p) => p.cui.replace(/\s/g, "") === cui.replace(/\s/g, ""));
    const emailExists = patients.some((p) => p.email.toLowerCase() === email.toLowerCase());
    return mockResponse({ cui: !cuiExists, email: !emailExists });
  },
  create: async (patient: Omit<Patient, "id" | "lastVisit">) => {
    const created = {
      ...patient,
      id: `p${patients.length + 1}`,
      lastVisit: new Date().toISOString().slice(0, 10),
    };
    patients.unshift(created);
    return mockResponse(created);
  },
  update: async (id: string, changes: Partial<Patient>) => {
    const patient = patients.find((p) => p.id === id);
    if (patient) Object.assign(patient, changes);
    return mockResponse(patient);
  },
  updateStatus: async (id: string, status: PatientStatus) => {
    const patient = patients.find((p) => p.id === id);
    if (patient) patient.status = status;
    return mockResponse(patient);
  },
};

/** Campos que el backend permite modificar (OP-PAC-04 / 05). */
const EDITABLE = ["phone", "email", "address", "municipality", "department", "status"] as const;

const api: typeof mock = {
  // La institución sale del token (OP-SEC-02); el parámetro se conserva por compatibilidad.
  list: () => http.get<Patient[]>("/patients"),
  get: (id) => orUndefined(http.get<Patient>(`/patients/${enc(id)}`)),
  validateUnique: (cui, email) => http.post<{ cui: boolean; email: boolean }>("/patients/validate-unique", { cui, email }),
  create: (patient) => http.post<Patient>("/patients", patient),
  update: (id, changes) =>
    http.patch<Patient>(`/patients/${enc(id)}`, Object.fromEntries(EDITABLE.filter((k) => k in changes).map((k) => [k, changes[k]]))),
  updateStatus: (id, status) => http.patch<Patient>(`/patients/${enc(id)}/status`, { status }),
};

export const pacientesService = USE_MOCKS ? mock : api;
