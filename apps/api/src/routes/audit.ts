import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { OrganizationId, WorkspaceId } from '@xb/types';
import { listEntityAudit } from '../services/audit-service.js';
import { NotFoundError } from '../lib/errors.js';
import { ok } from '../lib/http-helpers.js';
import {
  getOrganization,
} from '../services/organization-service.js';
import {
  getWorkspace,
} from '../services/workspace-service.js';

const ULID = z.string().length(26);
const Query = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const auditRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/audit/organizations/:id — show audit entries for a single org
  app.get<{ Params: { id: string }; Querystring: { limit?: number } }>(
    '/organizations/:id',
    async (req) => {
      const actor = req.requireActor();
      const id = ULID.parse(req.params.id);
      const { limit } = Query.parse(req.query);
      const org = await getOrganization(app, actor, id as OrganizationId);
      if (!org) throw new NotFoundError('organization', id);
      const items = await listEntityAudit(app, actor, {
        entityKind: 'xb_core.organizations',
        entityId: id,
        organizationId: org.id,
        limit,
      });
      return ok({ items }, req.id);
    },
  );

  // GET /v1/audit/workspaces/:id — show audit entries for a single workspace
  app.get<{ Params: { id: string }; Querystring: { limit?: number } }>(
    '/workspaces/:id',
    async (req) => {
      const actor = req.requireActor();
      const id = ULID.parse(req.params.id);
      const { limit } = Query.parse(req.query);
      const ws = await getWorkspace(app, actor, id as WorkspaceId);
      if (!ws) throw new NotFoundError('workspace', id);
      const items = await listEntityAudit(app, actor, {
        entityKind: 'xb_core.workspaces',
        entityId: id,
        organizationId: ws.organizationId,
        limit,
      });
      return ok({ items }, req.id);
    },
  );
};
