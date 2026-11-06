import type { IsoDate, LocalDateTime } from "../../domain/values.ts";

/**
 * Los motores documentales guardan fechas como BSON Date / Timestamp. Las horas
 * clínicas del diccionario son "timestamp" sin zona: se almacenan como hora
 * local "naive" expresada en UTC, para que las 08:30 sigan siendo 08:30 en
 * cualquier servidor (equivale a timestamp without time zone en SQL).
 */
export function toNaiveDate(value: LocalDateTime | IsoDate): Date {
  return new Date(value.length === 10 ? `${value}T00:00:00Z` : `${value}:00Z`);
}

export function fromNaiveDate(value: Date): LocalDateTime {
  return value.toISOString().slice(0, 16);
}

export function dateOnly(value: Date): IsoDate {
  return value.toISOString().slice(0, 10);
}

export function dayRange(day: IsoDate): [Date, Date] {
  const start = toNaiveDate(day);
  return [start, new Date(start.getTime() + 86_400_000)];
}
