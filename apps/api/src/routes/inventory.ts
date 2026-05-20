import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { WorkspaceId } from '@xb/types';
import {
  listInventory,
  listInventoryFacets,
} from '../services/inventory-service.js';
import { ok } from '../lib/http-helpers.js';

const ULID = z.string().length(26);
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

const ListQuery = z.object({
  workspaceId: ULID,
  q: z.string().trim().max(200).optional(),
  dateFrom: ISO_DATE.optional(),
  dateTo: ISO_DATE.optional(),
  warehouse: z.string().trim().max(120).optional(),
  sku: z.string().trim().max(200).optional(),
  /** 'true' / 'false' as string; defaults to true. */
  latestOnly: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v !== 'false'),
  sort: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(0).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
});

const FacetsQuery = z.object({
  workspaceId: ULID,
});

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const actor = req.requireActor();
    const q = ListQuery.parse(req.query);
    const result = await listInventory(app, actor, {
      ...q,
      workspaceId: q.workspaceId as WorkspaceId,
    });
    return ok(
      {
        items: result.items,
        page: { cursor: null, hasMore: result.hasMore, total: result.total },
        aggregates: result.aggregates,
      },
      req.id,
    );
  });

  app.get('/facets', async (req) => {
    const actor = req.requireActor();
    const q = FacetsQuery.parse(req.query);
    const facets = await listInventoryFacets(app, actor, q.workspaceId as WorkspaceId);
    return ok(facets, req.id);
  });
};
