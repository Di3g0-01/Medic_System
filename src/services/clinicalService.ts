import { admissions, growthRecords, vaccineRecords } from "../mocks/data";
import type { Admission, GrowthRecord, VaccineRecord } from "../types";
import { mockResponse } from "./api";
import { enc, http, listOrEmpty, USE_MOCKS } from "./httpClient";

/** `patientId` es opcional para no romper llamadas existentes; los mocks no lo usan. */
const mock = {
  getGrowthRecords: (_patientId?: string) => mockResponse(growthRecords),
  getVaccines: (_patientId?: string) => mockResponse(vaccineRecords),
  getAdmissions: (_patientId?: string) => mockResponse(admissions),
};

const patientList = <T>(path: string, patientId?: string): Promise<T[]> =>
  patientId ? listOrEmpty(http.get<T[]>(`/patients/${enc(patientId)}/${path}`)) : Promise.resolve([]);

/** Solo Pediatría (crecimiento, vacunas) y Hospital (internamientos) devuelven datos; el resto, lista vacía. */
const api: typeof mock = {
  getGrowthRecords: (patientId) => patientList<GrowthRecord>("growth", patientId),
  getVaccines: (patientId) => patientList<VaccineRecord>("vaccines", patientId),
  getAdmissions: (patientId) => patientList<Admission>("admissions", patientId),
};

export const clinicalService = USE_MOCKS ? mock : api;
