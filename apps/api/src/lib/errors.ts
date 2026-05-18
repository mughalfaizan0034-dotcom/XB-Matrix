/**
 * Domain errors. Each one maps to a clean HTTP status in the error handler.
 *
 * Routes/services should THROW these instead of returning weird shapes;
 * the error handler converts them to the canonical ApiFailure envelope so
 * the frontend always sees `{ ok: false, error: { code, message, details } }`.
 *
 * Convention:
 *   400  ValidationError       — zod failure or other input-shape problem
 *   401  UnauthenticatedError  — no/invalid session                (@xb/auth)
 *   403  ForbiddenError        — resolver denied                   (@xb/auth)
 *   404  NotFoundError         — resource missing
 *   409  ConflictError         — uniqueness, state collision
 *   409  ConcurrencyError      — optimistic lock mismatch
 *   422  SemanticError         — passed schema but rejected by domain rule
 *   429  RateLimitError        — too many requests
 *   500  (anything uncaught)   — true server bug
 */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'validation_failed', 400, details);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    super(`${resource}${id ? ` ${id}` : ''} not found`, 'not_found', 404);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, code: string = 'conflict', details?: unknown) {
    super(message, code, 409, details);
  }
}

export class ConcurrencyError extends DomainError {
  constructor(message: string = 'resource changed since you last read it') {
    super(message, 'stale_version', 409);
  }
}

export class SemanticError extends DomainError {
  constructor(message: string, code: string = 'semantic_error', details?: unknown) {
    super(message, code, 422, details);
  }
}

export class RateLimitError extends DomainError {
  constructor(retryAfterSeconds: number) {
    super('too many requests', 'rate_limited', 429, { retryAfterSeconds });
  }
}
