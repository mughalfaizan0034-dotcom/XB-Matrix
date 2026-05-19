import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import type {
  ActorContext,
  ActorId,
  ActorKind,
  EffectiveRole,
  OrganizationId,
  RequestId,
  SessionId,
} from '@xb/types';
import { UnauthenticatedError } from '@xb/auth';
import { getSession, touchSession } from '../services/session-service.js';

export interface SessionPayload {
  sub: string;          // user id
  ses: string;          // session id
  act: string;          // actor id
  kind: ActorKind;      // Spec 3 actor_kind (for audit)
  role: EffectiveRole;  // granular role (for resolver)
  org: string | null;   // organization id (null for internal users)
  mgr: boolean;         // is_internal_manager
}

/**
 * Reads the session JWT from the auth cookie, verifies it, looks up the
 * server-side session row to detect revocation, and decorates each
 * request with `.actor` (or null) and `req.requireActor()`.
 *
 * Server-side session check is what gives sign-out, password reset, and
 * admin revocation REAL teeth — a stolen cookie stops working as soon as
 * its session row is revoked, even though the JWT signature is still
 * valid until expiry.
 */
export const authCookiePlugin = fp(async (app) => {
  const cookieName = app.config.auth.sessionCookieName;

  app.decorateRequest('actor', null);
  app.decorateRequest('requireActor', function requireActor(this: FastifyRequest): ActorContext {
    if (!this.actor) throw new UnauthenticatedError('sign in required');
    return this.actor;
  });

  app.addHook('onRequest', async (req) => {
    const raw = req.cookies?.[cookieName];
    if (!raw) {
      req.actor = null;
      return;
    }
    let payload: SessionPayload;
    try {
      payload = (await app.jwt.verify(raw)) as SessionPayload;
    } catch {
      req.actor = null;
      return;
    }
    // Verify session is still live (not revoked, not expired).
    const session = await getSession(app, payload.ses).catch(() => null);
    if (!session) {
      req.actor = null;
      return;
    }
    // Fire-and-forget touch — throttled to 60s per session via Redis.
    void touchSession(app, payload.ses);

    req.actor = {
      actorId: payload.act as ActorId,
      actorKind: payload.kind,
      effectiveRole: payload.role,
      organizationId: (payload.org ?? null) as OrganizationId | null,
      sessionId: payload.ses as SessionId,
      requestId: req.id as RequestId,
      isInternalManager: payload.mgr,
    };
  });
});

declare module 'fastify' {
  interface FastifyRequest {
    actor: ActorContext | null;
    requireActor(): ActorContext;
  }
}
