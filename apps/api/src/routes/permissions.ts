import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { UserId } from '@xb/types';
import {
  getUserPermissions,
  setUserWorkspacePermissions,
  WORKSPACE_ACCESS_LEVELS,
} from '../services/permission-service.js';
import { ok } from '../lib/http-helpers.js';

const ULID = z.string().length(26);
const AccessLevel = z.enum(WORKSPACE_ACCESS_LEVELS);

const SetBody = z.object({
  assignments: z.record(ULID, AccessLevel),
});

export const permissionRoutes: FastifyPluginAsync = async (app) => {
  /** Workspace assignment matrix for one user (all active workspaces in their org). */
  app.get('/users/:userId', async (req) => {
    const actor = req.requireActor();
    const { userId } = z.object({ userId: ULID }).parse(req.params);
    const result = await getUserPermissions(app, actor, userId as UserId);
    return ok(result, req.id);
  });

  /** Bulk set one user's workspace assignments. 'none' soft-deletes. */
  app.post('/users/:userId', async (req) => {
    const actor = req.requireActor();
    const { userId } = z.object({ userId: ULID }).parse(req.params);
    const body = SetBody.parse(req.body);
    await setUserWorkspacePermissions(app, actor, {
      userId: userId as UserId,
      assignments: body.assignments,
    });
    return ok({ saved: true }, req.id);
  });
};
