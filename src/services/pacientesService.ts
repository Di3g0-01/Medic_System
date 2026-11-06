import { patients } from "../mocks/data";
import type { Patient, PatientStatus } from "../types";
import { mockResponse } from "./api";

export const pacientesService = {
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
