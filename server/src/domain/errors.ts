/** Errores de negocio. La capa HTTP los traduce a códigos de estado; los adaptadores traducen los errores del motor a estos. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 422, "VALIDATION");
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "No tiene permisos para esta operación") {
    super(message, 403, "FORBIDDEN");
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Usuario o contraseña incorrectos") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ValidationError(message);
}
