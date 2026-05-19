import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { OrganizationId } from '@xb/types';
import {
  acceptInvitation,
  inviteUser,
  resendInvitation,
  revokeInvitation,
} from '../services/invitations-service.js';
import { ok } from '../lib/http-helpers.js';

const ULID = z.string().length(26);

const InviteBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1).max(200),
  role: z.enum(['internal_manager', 'internal_staff', 'organization_admin', 'organization_user']),
  organizationId: ULID.nullable().optional(),
});

const AcceptBody = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(12).max(200),
});

const IdParam = z.object({ id: ULID });

function setSessionCookie(
  res: import('fastify').FastifyReply,
  cookieName: string,
  token: string,
): void {
  res.setCookie(cookieName, token, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export const invitationRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', async (req, res) => {
    const actor = req.requireActor();
    const body = InviteBody.parse(req.body);
    const invitation = await inviteUser(app, actor, {
      email: body.email,
      displayName: body.displayName,
      role: body.role,
      organizationId: (body.organizationId ?? null) as OrganizationId | null,
    });
    res.status(201);
    return ok({ invitation }, req.id);
  });

  /**
   * Public — anyone with the token can accept. Sets the password, marks
   * the user active + email-verified, and signs them in.
   */
  app.post('/accept', async (req, res) => {
    const body = AcceptBody.parse(req.body);
    const result = await acceptInvitation(app, {
      token: body.token,
      password: body.password,
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: req.ip ?? null,
    });
    setSessionCookie(res, app.config.auth.sessionCookieName, result.jwt);
    return ok(
      {
        userId: result.userId,
        email: result.email,
        displayName: result.displayName,
      },
      req.id,
    );
  });

  app.post('/:id/resend', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const invitation = await resendInvitation(app, actor, id);
    return ok({ invitation }, req.id);
  });

  app.post('/:id/revoke', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    await revokeInvitation(app, actor, id);
    return ok({ revoked: true }, req.id);
  });
};
