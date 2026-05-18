export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class UnauthenticatedError extends AuthError {
  constructor(message = 'Unauthenticated') {
    super(message, 'unauthenticated');
    this.name = 'UnauthenticatedError';
  }
}

export class ForbiddenError extends AuthError {
  constructor(
    message = 'Forbidden',
    public readonly decisionReason: string = 'no_grant',
  ) {
    super(message, 'forbidden');
    this.name = 'ForbiddenError';
  }
}

export class MissingContextError extends AuthError {
  constructor(message = 'Missing connection context') {
    super(message, 'missing_context');
    this.name = 'MissingContextError';
  }
}
