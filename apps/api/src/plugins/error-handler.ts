import fp from 'fastify-plugin';
import { AuthError, ForbiddenError, UnauthenticatedError, MissingContextError } from '@xb/auth';
import type { ApiFailure } from '@xb/types';

export const errorHandlerPlugin = fp(async (app) => {
  app.setErrorHandler((err, req, res) => {
    const requestId = req.id;

    if (err instanceof UnauthenticatedError) {
      return res.status(401).send(failure(err.code, err.message, requestId));
    }
    if (err instanceof ForbiddenError) {
      return res.status(403).send(failure(err.code, err.message, requestId, { reason: err.decisionReason }));
    }
    if (err instanceof MissingContextError) {
      app.log.error({ err, requestId }, 'missing connection context — programming error');
      return res.status(500).send(failure('internal_error', 'internal error', requestId));
    }
    if (err instanceof AuthError) {
      return res.status(401).send(failure(err.code, err.message, requestId));
    }

    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 500) {
      app.log.error({ err, requestId }, 'unhandled server error');
    }
    return res.status(statusCode).send(
      failure(
        (err as { code?: string }).code ?? 'internal_error',
        statusCode >= 500 ? 'internal error' : err.message,
        requestId,
      ),
    );
  });

  app.setNotFoundHandler((req, res) => {
    res.status(404).send(failure('not_found', `${req.method} ${req.url} not found`, req.id));
  });
});

function failure(code: string, message: string, requestId: string, details?: unknown): ApiFailure {
  return {
    ok: false,
    error: { code, message, details },
    requestId,
  };
}
