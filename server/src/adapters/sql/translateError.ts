import { ConflictError, DomainError, ForbiddenError, ValidationError } from "../../domain/errors.ts";

/** Mensaje de negocio según la restricción violada (nombres comunes en PostgreSQL y MySQL). */
const CONSTRAINTS: [RegExp, string][] = [
  [/dpi_cui/, "Ya existe un paciente con este DPI/CUI"],
  [/correo/, "Este correo ya está registrado"],
  [/uq_consulta_horario_medico/, "El médico ya tiene una consulta en ese horario"],
  [/uq_paciente_alergia/, "La alergia ya está registrada para el paciente"],
  [/no_colegiado/, "El número de colegiado ya existe"],
  [/id_medicamento|fk_receta_medicamento/, "Medicamento inexistente en el catálogo"],
  [/id_tipo_examen|fk_examen_tipo/, "Tipo de examen inexistente"],
  [/id_consulta|fk_\w+_consulta/, "La consulta referenciada no existe"],
  [/id_paciente|fk_\w+_paciente/, "El paciente referenciado no existe"],
  [/id_medico|fk_\w+_medico/, "El médico referenciado no existe"],
];

const describe = (text: string, fallback: string) => CONSTRAINTS.find(([re]) => re.test(text))?.[1] ?? fallback;

export type SqlErrorKind = "unique" | "foreign_key" | "check" | "denied" | "invalid";

/** Traduce un error del driver a un error de dominio. `kind` lo determina cada motor. */
export function toDomainError(kind: SqlErrorKind | null, detail: string, original: unknown): Error {
  if (original instanceof DomainError) return original;
  switch (kind) {
    case "unique":
      return new ConflictError(describe(detail, "Registro duplicado"));
    case "foreign_key":
      return new ValidationError(describe(detail, "Referencia inválida"));
    case "check":
      return new ValidationError(`Valor fuera del dominio permitido (${detail})`);
    case "denied":
      return new ForbiddenError("El motor de base de datos denegó el acceso para este rol");
    case "invalid":
      return new ValidationError("Dato con formato inválido");
    default:
      return original instanceof Error ? original : new Error(String(original));
  }
}
