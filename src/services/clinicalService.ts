import { admissions, growthRecords, vaccineRecords } from "../mocks/data";
import { mockResponse } from "./api";

export const clinicalService = {
  getGrowthRecords: () => mockResponse(growthRecords),
  getVaccines: () => mockResponse(vaccineRecords),
  getAdmissions: () => mockResponse(admissions),
};
