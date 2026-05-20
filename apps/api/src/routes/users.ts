import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { OrganizationId, UserId } from '@xb/types';
import {
  adminResetPassword,
  createUser,
  deactivateUser,
  getUser,
  listUsers,
  reactivateUser,
  type CreateUserRole,
} from '../services/users-service.js';
import { NotFoundError } from '../lib/errors.js';
import { ok } from '../lib/http-helpers.js';

const ULID = z.string().length(26);
const Role = z.enum([
  'internal_manager',
  'internal_staff',
  'organization_admin',
  'organization_user',
]);

const ListQuery = z.object({
  organizationId: ULID.optional(),
  status: z.enum(['active', 'deactivated', 'pending_invite']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const TransitionBody = z.object({
  expectedRowVersion: z.number().int().nonnegative(),
});

const CreateUserBody = z.object({
  username: z.string().trim().min(3).max(120),
  displayName: z.string().trim().min(1).max(200),
  password: z.string().min(12).max(200),
  role: Role,
  organizationId: ULID.optional().nullable(),
});

const ResetPasswordBody = z.object({
  password: z.string().min(12).max(200),
});

const IdParam = z.object({ id: ULID });

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const actor = req.requireActor();
    const q = ListQuery.parse(req.query);
    const items = await listUsers(app, actor, {
      organizationId: (q.organizationId ?? undefined) as OrganizationId | undefined,
      status: q.status,
      limit: q.limit,
    });
    return ok({ items, page: { cursor: null, hasMore: false } }, req.id);
  });

  app.get('/:id', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const user = await getUser(app, actor, id as UserId);
    if (!user) throw new NotFoundError('user', id);
    return ok({ user }, req.id);
  });

  // Direct user creation — username + password, no invitation.
  app.post('/', async (req, res) => {
    const actor = req.requireActor();
    const body = CreateUserBody.parse(req.body);
    const user = await createUser(app, actor, {
      ...body,
      role: body.role as CreateUserRole,
      organizationId: (body.organizationId ?? null) as OrganizationId | null,
    });
    res.status(201);
    return ok({ user }, req.id);
  });

  // Admin password reset — replaces the email-based forgot-password
  // flow while email infrastructure isn't wired up.
  app.post('/:id/reset-password', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const { password } = ResetPasswordBody.parse(req.body);
    await adminResetPassword(app, actor, id as UserId, password);
    return ok({ reset: true }, req.id);
  });

  app.post('/:id/deactivate', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const { expectedRowVersion } = TransitionBody.parse(req.body);
    const user = await deactivateUser(app, actor, {
      userId: id as UserId,
      expectedRowVersion,
    });
    return ok({ user }, req.id);
  });

  app.post('/:id/reactivate', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const { expectedRowVersion } = TransitionBody.parse(req.body);
    const user = await reactivateUser(app, actor, {
      userId: id as UserId,
      expectedRowVersion,
    });
    return ok({ user }, req.id);
  });
};
