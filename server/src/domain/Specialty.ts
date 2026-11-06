import type { Vaccine } from "./Catalog.ts";
import type { IsoDate, LocalDateTime } from "./values.ts";

/** Pediatría: registro_crecimiento. */
export interface GrowthRecord {
  id: string;
  consultationId: string;
  date: IsoDate;
  weightKg: number;
  heightCm: number;
  headCircumferenceCm: number | null;
}

/** Pediatría: esquema_vacunacion (dosis aplicada). */
export interface VaccinationDose {
  id: string;
  consultationId: string;
  vaccineId: string;
  doseNumber: number;
  appliedOn: IsoDate;
  lot: string | null;
}

/** Hospital: internamiento. */
export interface Admission {
  id: string;
  consultationId: string;
  admittedAt: LocalDateTime;
  dischargedAt: LocalDateTime | null;
  bed: string | null;
  reason: string;
}

export interface VaccinationStatus {
  vaccine: Vaccine;
  doseNumber: number;
  appliedOn: IsoDate | null;
  lot: string | null;
  applied: boolean;
}

/**
 * OP-ESP-04: esquema del paciente comparado contra el catálogo de dosis requeridas.
 * Devuelve las dosis aplicadas y la siguiente dosis pendiente de cada vacuna incompleta.
 */
export function vaccinationScheme(catalog: Vaccine[], doses: VaccinationDose[]): VaccinationStatus[] {
  return catalog.flatMap((vaccine) => {
    const applied = doses
      .filter((d) => d.vaccineId === vaccine.id)
      .sort((a, b) => a.doseNumber - b.doseNumber)
      .map((d) => ({ vaccine, doseNumber: d.doseNumber, appliedOn: d.appliedOn, lot: d.lot, applied: true }));
    const pending =
      applied.length < vaccine.requiredDoses
        ? [{ vaccine, doseNumber: applied.length + 1, appliedOn: null, lot: null, applied: false }]
        : [];
    return [...applied, ...pending];
  });
}
