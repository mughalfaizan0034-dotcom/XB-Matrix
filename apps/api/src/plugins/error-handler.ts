import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AuthError, ForbiddenError, UnauthenticatedError, MissingContextError } from '@xb/auth';
import type { ApiFailure } from '@xb/types';
import { DomainError } from '../lib/errors.js';

/**
 * Central error handler. Domain errors become canonical 4xx envelopes;
 * unmapped errors become 500 with the original message hidden from the
 * client (logged server-side). The frontend sees one shape always:
 *
 *   { ok: false, error: { code, message, details? }, requestId }
 *
 * - ValidationError      → 400  code='validation_failed', details=[{ path, message }]
 * - UnauthenticatedError → 401  code='unauthenticated'
 * - ForbiddenError       → 403  code='forbidden',         details.reason=...
 * - NotFoundError        → 404  code='not_found'
 * - ConflictError        → 409  code='conflict' or custom
 * - ConcurrencyError     → 409  code='stale_version'
 * - SemanticError        → 422  custom code
 * - RateLimitError       → 429  details.retryAfterSeconds
 * - PG unique violation  → 409  code='conflict',          details.constraint=...
 * - PG fk violation      → 409  code='related_resource_missing'
 * - ZodError             → 400  code='validation_failed', details=field issues
 * - anything else        → 500  code='internal_error'  (real msg in logs only)
 */
export const errorHandlerPlugin = fp(async (app) => {
  app.setErrorHandler((err, req, res) => {
    const requestId = req.id;

    if (err instanceof ZodError) {
      return res.status(400).send(
        failure('validation_failed', 'invalid request body or query', requestId, {
          issues: err.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
            code: i.code,
          })),
        }),
      );
    }

    if (err instanceof DomainError) {
      const status = err.statusCode;
      if (status >= 500) {
        app.log.error({ err, requestId }, 'domain error (500)');
      }
      const headers: Record<string, string> = {};
      if (err.code === 'rate_limited') {
        const sec = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
        if (sec) headers['retry-after'] = String(sec);
      }
      res.headers(headers);
      return res.status(status).send(failure(err.code, err.message, requestId, err.details));
    }

    if (err instanceof UnauthenticatedError) {
      return res.status(401).send(failure(err.code, err.message, requestId));
    }
    if (err instanceof ForbiddenError) {
      return res
        .status(403)
        .send(failure(err.code, err.message, requestId, { reason: err.decisionReason }));
    }
    if (err instanceof MissingContextError) {
      app.log.error({ err, requestId }, 'missing connection context — programming error');
      return res.status(500).send(failure('internal_error', 'internal error', requestId));
    }
    if (err instanceof AuthError) {
      return res.status(401).send(failure(err.code, err.message, requestId));
    }

    // node-postgres error mapping
    const pgCode = (err as { code?: string }).code;
    if (typeof pgCode === 'string' && pgCode.length === 5) {
      if (pgCode === '23505') {
        // unique violation
        const constraint = (err as { constraint?: string }).constraint;
        return res.status(409).send(
          failure('conflict', mapUniqueViolation(constraint), requestId, { constraint }),
        );
      }
      if (pgCode === '23503') {
        // foreign key violation — log the constraint so we can diagnose
        // which relationship failed without needing to repro.
        const constraint = (err as { constraint?: string; detail?: string }).constraint;
        const detail = (err as { detail?: string }).detail;
        app.log.warn({ err, requestId, constraint, detail }, 'fk violation (23503)');
        return res
          .status(409)
          .send(failure('related_resource_missing', 'referenced resource does not exist', requestId, { constraint }));
      }
      if (pgCode === '23514') {
        // check constraint violation
        return res
          .status(400)
          .send(failure('validation_failed', 'value violates a database constraint', requestId));
      }
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
  return { ok: false, error: { code, message, details }, requestId };
}

/**
 * Turn a Postgres unique-constraint name into a human message. Each module
 * adds its constraints here so the user sees the right phrasing.
 */
function mapUniqueViolation(constraint: string | undefined): string {
  switch (constraint) {
    case 'uq_organizations_slug':
      return 'An organization with this name already exists.';
    case 'uq_users_email':
      return 'A user with this email address already exists.';
    case 'uq_users_username':
      return 'This username is taken.';
    case 'uq_workspaces_org_name':
      return 'A workspace with this name already exists in the organization.';
    case 'uq_auth_tokens_hash':
      return 'Token collision — please retry.';
    default:
      return constraint
        ? `Conflict on ${constraint.replace(/^uq_/, '').replaceAll('_', ' ')}.`
        : 'Conflict with an existing record.';
  }
}
