import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { UserId, WorkspaceId } from '@xb/types';
import {
  ACCESS_LEVELS,
  listWorkspacePermissions,
  MODULES,
  removeUserFromWorkspace,
  setUserWorkspacePermissions,
} from '../services/permission-service.js';
import { ok } from '../lib/http-helpers.js';

const ULID = z.string().length(26);
const AccessLevel = z.enum(ACCESS_LEVELS);

const SetBody = z.object({
  workspaceLevel: AccessLevel,
  modules: z.record(z.string().max(64), AccessLevel),
});

export const permissionRoutes: FastifyPluginAsync = async (app) => {
  /** Canonical module list — drives the matrix UI's column rows. */
  app.get('/modules', async (req) => {
    return ok({ modules: MODULES }, req.id);
  });

  /** Per-user assignments for a workspace. */
  app.get('/workspaces/:workspaceId', async (req) => {
    const actor = req.requireActor();
    const { workspaceId } = z.object({ workspaceId: ULID }).parse(req.params);
    const result = await listWorkspacePermissions(app, actor, workspaceId as WorkspaceId);
    return ok(result, req.id);
  });

  /** Bulk PUT: replace one user's workspace + module permissions. */
  app.put('/workspaces/:workspaceId/users/:userId', async (req) => {
    const actor = req.requireActor();
    const { workspaceId, userId } = z
      .object({ workspaceId: ULID, userId: ULID })
      .parse(req.params);
    const input = SetBody.parse(req.body);
    await setUserWorkspacePermissions(app, actor, {
      workspaceId: workspaceId as WorkspaceId,
      userId: userId as UserId,
      input,
    });
    return ok({ saved: true }, req.id);
  });

  /** Remove a user from a workspace (idempotent soft-delete of perms). */
  app.delete('/workspaces/:workspaceId/users/:userId', async (req) => {
    const actor = req.requireActor();
    const { workspaceId, userId } = z
      .object({ workspaceId: ULID, userId: ULID })
      .parse(req.params);
    await removeUserFromWorkspace(app, actor, {
      workspaceId: workspaceId as WorkspaceId,
      userId: userId as UserId,
    });
    return ok({ removed: true }, req.id);
  });
};
