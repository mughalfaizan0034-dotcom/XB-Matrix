import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { OrganizationId } from '@xb/types';
import {
  bootstrapUser,
  buildDebugContext,
  type BootstrapRole,
} from '../services/bootstrap-service.js';
import { ok } from '../lib/http-helpers.js';

const ULID = z.string().length(26);
const RoleEnum = z.enum([
  'internal_manager',
  'internal_staff',
  'organization_admin',
  'organization_user',
]);

const BootstrapUserBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().min(1).max(200),
  password: z.string().min(12).max(200),
  role: RoleEnum,
  organizationId: ULID.optional().nullable(),
  markEmailVerified: z.boolean().optional(),
});

/**
 * Bootstrap / testing routes — internal-manager only.
 *
 * Purpose: accelerate multi-user testing while invitations + email
 * verification + permissions matrix UIs are still being built. Lets a
 * manager manually create active users with known passwords + skip
 * email verification, plus introspect the resolver's current view.
 *
 * Not a production path. Either removed or kept as super-admin tooling
 * once the full auth lifecycle ships.
 */
export const bootstrapRoutes: FastifyPluginAsync = async (app) => {
  app.post('/user', async (req, res) => {
    const actor = req.requireActor();
    const body = BootstrapUserBody.parse(req.body);
    const user = await bootstrapUser(app, actor, {
      ...body,
      role: body.role as BootstrapRole,
      organizationId: (body.organizationId ?? null) as OrganizationId | null,
    });
    res.status(201);
    return ok({ user }, req.id);
  });

  app.get('/debug-context', async (req) => {
    const actor = req.requireActor();
    const snapshot = await buildDebugContext(app, actor);
    return ok(snapshot, req.id);
  });
};
