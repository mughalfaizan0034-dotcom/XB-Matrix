import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { WorkspaceId } from '@xb/types';
import {
  dismissGroup,
  getUnresolvedRow,
  listUnresolvedGroups,
  listUnresolvedRows,
  replayGroup,
  restoreGroup,
} from '../services/unresolved-queue-service.js';
import { ok } from '../lib/http-helpers.js';

const ULID = z.string().length(26);
const AliasType = z.enum([
  'platform_sku', 'asin', 'upc', 'ean', 'gtin', 'isbn',
  'fnsku', 'supplier_sku', 'internal_sku', 'warehouse_sku',
]);
const Status = z.enum(['pending', 'mapped', 'dismissed']);

const GroupsQuery = z.object({
  workspaceId: ULID,
  q: z.string().trim().max(200).optional(),
  aliasType: AliasType.optional(),
  sourcePlatform: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(0).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
});

const RowsQuery = z.object({
  workspaceId: ULID,
  status: Status.optional(),
  uploadId: ULID.optional(),
  aliasType: AliasType.optional(),
  aliasValue: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(0).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
});

const GroupKey = z.object({
  workspaceId: ULID,
  aliasType: AliasType,
  aliasValue: z.string().trim().min(1).max(200),
  sourcePlatform: z.string().trim().max(80).optional().nullable(),
  sourceMarketplace: z.string().trim().max(80).optional().nullable(),
  sourceAccount: z.string().trim().max(200).optional().nullable(),
});

const DismissBody = GroupKey.extend({
  reason: z.string().trim().max(200).optional().nullable(),
});

export const unresolvedSkuRoutes: FastifyPluginAsync = async (app) => {
  // Grouped view — the operator-facing surface. One row per unique
  // (alias × source) tuple, with a count of how many upload rows are
  // blocked behind it.
  app.get('/groups', async (req) => {
    const actor = req.requireActor();
    const q = GroupsQuery.parse(req.query);
    const result = await listUnresolvedGroups(app, actor, {
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

  // Raw row list — drill into a specific group or upload.
  app.get('/rows', async (req) => {
    const actor = req.requireActor();
    const q = RowsQuery.parse(req.query);
    const result = await listUnresolvedRows(app, actor, {
      ...q,
      workspaceId: q.workspaceId as WorkspaceId,
    });
    return ok(
      {
        items: result.items,
        page: { cursor: null, hasMore: result.hasMore, total: result.total },
      },
      req.id,
    );
  });

  app.get('/:id', async (req) => {
    const actor = req.requireActor();
    const { id } = z.object({ id: ULID }).parse(req.params);
    const row = await getUnresolvedRow(app, actor, id);
    return ok({ row }, req.id);
  });

  // Replay one group — if the alias now resolves, mark every pending
  // matching row as 'mapped' so the canonical writer (when it ships)
  // picks them up.
  app.post('/replay', async (req) => {
    const actor = req.requireActor();
    const body = GroupKey.parse(req.body);
    const result = await replayGroup(app, actor, {
      workspaceId: body.workspaceId as WorkspaceId,
      aliasType: body.aliasType,
      aliasValue: body.aliasValue,
      sourcePlatform: body.sourcePlatform ?? null,
      sourceMarketplace: body.sourceMarketplace ?? null,
      sourceAccount: body.sourceAccount ?? null,
    });
    return ok(result, req.id);
  });

  // Dismiss a group — junk SKU codes, dropped products, vendor noise.
  app.post('/dismiss', async (req) => {
    const actor = req.requireActor();
    const body = DismissBody.parse(req.body);
    const result = await dismissGroup(app, actor, {
      workspaceId: body.workspaceId as WorkspaceId,
      aliasType: body.aliasType,
      aliasValue: body.aliasValue,
      sourcePlatform: body.sourcePlatform ?? null,
      sourceMarketplace: body.sourceMarketplace ?? null,
      sourceAccount: body.sourceAccount ?? null,
      reason: body.reason ?? null,
    });
    return ok(result, req.id);
  });

  // Restore a dismissed group back to pending.
  app.post('/restore', async (req) => {
    const actor = req.requireActor();
    const body = GroupKey.parse(req.body);
    const result = await restoreGroup(app, actor, {
      workspaceId: body.workspaceId as WorkspaceId,
      aliasType: body.aliasType,
      aliasValue: body.aliasValue,
      sourcePlatform: body.sourcePlatform ?? null,
      sourceMarketplace: body.sourceMarketplace ?? null,
      sourceAccount: body.sourceAccount ?? null,
    });
    return ok(result, req.id);
  });
};
