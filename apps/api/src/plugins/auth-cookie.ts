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
 * Reads the session JWT from the auth cookie, verifies it, and decorates
 * each request with `.actor` (or null) and `req.requireActor()`.
 *
 * Routes are public by default; protected ones call `req.requireActor()`.
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
    try {
      const payload = (await app.jwt.verify(raw)) as SessionPayload;
      req.actor = {
        actorId: payload.act as ActorId,
        actorKind: payload.kind,
        effectiveRole: payload.role,
        organizationId: (payload.org ?? null) as OrganizationId | null,
        sessionId: payload.ses as SessionId,
        requestId: req.id as RequestId,
        isInternalManager: payload.mgr,
      };
    } catch {
      req.actor = null;
    }
  });
});

declare module 'fastify' {
  interface FastifyRequest {
    actor: ActorContext | null;
    requireActor(): ActorContext;
  }
}
