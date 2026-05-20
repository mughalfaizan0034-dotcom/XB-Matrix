import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { WorkspaceId } from '@xb/types';
import {
  ALIAS_TYPES,
  SOURCE_METHODS,
  createAlias,
  detectConflicts,
  listAliases,
  resolveSku,
  softDeleteAlias,
  updateAlias,
} from '../services/sku-alias-service.js';
import { ok } from '../lib/http-helpers.js';

const ULID = z.string().length(26);
const AliasType = z.enum(ALIAS_TYPES);
const SourceMethod = z.enum(SOURCE_METHODS);

const ListQuery = z.object({
  workspaceId: ULID,
  q: z.string().trim().max(200).optional(),
  aliasType: AliasType.optional(),
  sourcePlatform: z.string().trim().max(80).optional(),
  skuNormalized: z.string().trim().max(200).optional(),
  isActive: z.union([z.literal('true'), z.literal('false')]).optional()
    .transform((v) => v === undefined ? undefined : v === 'true'),
  sort: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(0).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
});

const CreateBody = z.object({
  workspaceId: ULID,
  skuNormalized: z.string().trim().min(1).max(200),
  aliasValue: z.string().trim().min(1).max(200),
  aliasType: AliasType,
  sourcePlatform: z.string().trim().max(80).optional().nullable(),
  sourceAccount: z.string().trim().max(200).optional().nullable(),
  sourceMarketplace: z.string().trim().max(80).optional().nullable(),
  regionCode: z.string().trim().max(8).optional().nullable(),
  warehouseCode: z.string().trim().max(120).optional().nullable(),
  isActive: z.boolean().optional(),
  sourceMethod: SourceMethod.optional(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const PatchBody = z.object({
  expectedRowVersion: z.number().int().nonnegative(),
  skuNormalized: z.string().trim().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const DeleteBody = z.object({
  expectedRowVersion: z.number().int().nonnegative(),
});

const ResolveQuery = z.object({
  workspaceId: ULID,
  aliasType: AliasType,
  aliasValue: z.string().trim().min(1).max(200),
  sourcePlatform: z.string().trim().max(80).optional(),
  sourceMarketplace: z.string().trim().max(80).optional(),
  sourceAccount: z.string().trim().max(200).optional(),
});

const ConflictsQuery = z.object({
  workspaceId: ULID,
});

const IdParam = z.object({ id: ULID });

export const skuAliasRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const actor = req.requireActor();
    const q = ListQuery.parse(req.query);
    const result = await listAliases(app, actor, {
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

  // Resolver endpoint — drives the future mapping layer. Synchronous,
  // exact-match. Returns { resolved: <sku> | null }.
  app.get('/resolve', async (req) => {
    const actor = req.requireActor();
    const q = ResolveQuery.parse(req.query);
    const resolved = await resolveSku(app, null, {
      workspaceId: q.workspaceId as WorkspaceId,
      aliasType: q.aliasType,
      aliasValue: q.aliasValue,
      sourcePlatform: q.sourcePlatform ?? null,
      sourceMarketplace: q.sourceMarketplace ?? null,
      sourceAccount: q.sourceAccount ?? null,
    });
    return ok({ resolved }, req.id);
  });

  app.get('/conflicts', async (req) => {
    const actor = req.requireActor();
    const q = ConflictsQuery.parse(req.query);
    const items = await detectConflicts(app, actor, q.workspaceId as WorkspaceId);
    return ok({ items }, req.id);
  });

  app.post('/', async (req, res) => {
    const actor = req.requireActor();
    const body = CreateBody.parse(req.body);
    const alias = await createAlias(app, actor, {
      ...body,
      workspaceId: body.workspaceId as WorkspaceId,
    });
    res.status(201);
    return ok({ alias }, req.id);
  });

  app.patch('/:id', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const body = PatchBody.parse(req.body);
    const alias = await updateAlias(app, actor, id, body);
    return ok({ alias }, req.id);
  });

  app.delete('/:id', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const { expectedRowVersion } = DeleteBody.parse(req.body);
    await softDeleteAlias(app, actor, id, expectedRowVersion);
    return ok({ deleted: true }, req.id);
  });
};
