import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { OrganizationId, WorkspaceId } from '@xb/types';
import {
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  patchWorkspace,
} from '../services/workspace-service.js';
import { ok } from '../lib/http-helpers.js';

const ULID = z.string().length(26);

const ListQuery = z.object({
  organizationId: ULID.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const CreateBody = z.object({
  organizationId: ULID,
  workspaceName: z.string().min(1).max(200),
  workspaceType: z.enum(['marketplace', 'dtc', 'warehouse', 'omni_channel']),
  defaultCurrencyCode: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().max(64).optional(),
  dosTargetDays: z.number().min(0).max(9999).optional(),
});

const PatchBody = z.object({
  workspaceName: z.string().min(1).max(200).optional(),
  workspaceType: z.enum(['marketplace', 'dtc', 'warehouse', 'omni_channel']).optional(),
  defaultCurrencyCode: z.string().regex(/^[A-Z]{3}$/).optional(),
  timezone: z.string().max(64).optional(),
  dosTargetDays: z.number().min(0).max(9999).optional(),
  workspaceStatus: z.enum(['active', 'archived']).optional(),
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
};
