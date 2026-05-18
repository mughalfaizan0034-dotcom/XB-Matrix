import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { OrganizationId, WorkspaceId } from '@xb/types';
import {
  archiveWorkspace,
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  patchWorkspace,
  reactivateWorkspace,
  restoreWorkspace,
  softDeleteWorkspace,
} from '../services/workspace-service.js';
import { NotFoundError } from '../lib/errors.js';
import { ok } from '../lib/http-helpers.js';

const ULID = z.string().length(26);

// DOS target: whole days, 1..365 inclusive. Realistic operational range —
// fractional days are not meaningful for inventory cover.
const DOS_TARGET = z
  .number()
  .int('DOS target must be a whole number')
  .min(1, 'DOS target must be at least 1 day')
  .max(365, 'DOS target must be 365 days or fewer');

const ListQuery = z.object({
  organizationId: ULID.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const CreateBody = z.object({
  organizationId: ULID,
  workspaceName: z.string().trim().min(1).max(200),
  workspaceType: z.enum(['marketplace', 'dtc', 'warehouse', 'omni_channel']),
  defaultCurrencyCode: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().trim().max(64).optional(),
  dosTargetDays: DOS_TARGET.optional(),
});

const PatchBody = z.object({
  workspaceName: z.string().trim().min(1).max(200).optional(),
  workspaceType: z.enum(['marketplace', 'dtc', 'warehouse', 'omni_channel']).optional(),
  defaultCurrencyCode: z.string().regex(/^[A-Z]{3}$/).optional(),
  timezone: z.string().trim().max(64).optional(),
  dosTargetDays: DOS_TARGET.optional(),
  expectedRowVersion: z.number().int().nonnegative(),
});

const TransitionBody = z.object({
  expectedRowVersion: z.number().int().nonnegative(),
});

const IdParam = z.object({ id: ULID });

export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const actor = req.requireActor();
    const q = ListQuery.parse(req.query);
    const items = await listWorkspaces(app, actor, {
      organizationId: q.organizationId as OrganizationId | undefined,
      limit: q.limit,
    });
    return ok({ items, page: { cursor: null, hasMore: false } }, req.id);
  });

  app.get('/:id', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const ws = await getWorkspace(app, actor, id as WorkspaceId);
    if (!ws) throw new NotFoundError('workspace', id);
    return ok({ workspace: ws }, req.id);
  });

  app.post('/', async (req, res) => {
    const actor = req.requireActor();
    const body = CreateBody.parse(req.body);
    const ws = await createWorkspace(app, actor, {
      ...body,
      organizationId: body.organizationId as OrganizationId,
    });
    res.status(201);
    return ok({ workspace: ws }, req.id);
  });

  app.patch('/:id', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const body = PatchBody.parse(req.body);
    const ws = await patchWorkspace(app, actor, id as WorkspaceId, body);
    return ok({ workspace: ws }, req.id);
  });

  app.post('/:id/archive', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const { expectedRowVersion } = TransitionBody.parse(req.body);
    const ws = await archiveWorkspace(app, actor, id as WorkspaceId, expectedRowVersion);
    return ok({ workspace: ws }, req.id);
  });

  app.post('/:id/reactivate', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const { expectedRowVersion } = TransitionBody.parse(req.body);
    const ws = await reactivateWorkspace(app, actor, id as WorkspaceId, expectedRowVersion);
    return ok({ workspace: ws }, req.id);
  });

  app.delete('/:id', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const { expectedRowVersion } = TransitionBody.parse(req.body);
    const ws = await softDeleteWorkspace(app, actor, id as WorkspaceId, expectedRowVersion);
    return ok({ workspace: ws }, req.id);
  });

  app.post('/:id/restore', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const ws = await restoreWorkspace(app, actor, id as WorkspaceId);
    return ok({ workspace: ws }, req.id);
  });
};
