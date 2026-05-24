import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  getDiagnostics,
  listFeatureFlags,
  listOrganizationsBilling,
  listPlatformAudit,
} from '../services/platform-service.js';
import {
  listRecycleBin,
  restoreEntity,
  type RecycleBinKind,
} from '../services/recycle-bin-service.js';
import { ok } from '../lib/http-helpers.js';

const RecycleBinKindSchema = z.enum(['user', 'organization', 'workspace']);

/**
 * Platform-administration endpoints. All read-only, all restricted to
 * internal managers. Power the Platform Audit / Diagnostics / Billing
 * Ops / Feature Flags sections in Settings.
 */
export const platformRoutes: FastifyPluginAsync = async (app) => {
  app.get('/audit', async (req) => {
    const actor = req.requireActor();
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(500).optional() })
      .parse(req.query);
    const items = await listPlatformAudit(app, actor, { limit });
    return ok({ items }, req.id);
  });

  app.get('/diagnostics', async (req) => {
    const actor = req.requireActor();
    const result = await getDiagnostics(app, actor);
    return ok(result, req.id);
  });

  app.get('/billing', async (req) => {
    const actor = req.requireActor();
    const items = await listOrganizationsBilling(app, actor);
    return ok({ items }, req.id);
  });

  app.get('/feature-flags', async (req) => {
    const actor = req.requireActor();
    const result = await listFeatureFlags(actor);
    return ok(result, req.id);
  });

  // Recycle bin — soft-deleted users / orgs / workspaces still inside
  // the 30-day grace window. Force-delete-now + the daily hard-purge
  // cron land in a follow-up PR; this slice covers list + restore.
  app.get('/recycle-bin', async (req) => {
    const actor = req.requireActor();
    const { kind } = z
      .object({ kind: RecycleBinKindSchema })
      .parse(req.query);
    const items = await listRecycleBin(app, actor, kind as RecycleBinKind);
    return ok({ items }, req.id);
  });

  app.post('/recycle-bin/:kind/:id/restore', async (req) => {
    const actor = req.requireActor();
    const { kind, id } = z
      .object({
        kind: RecycleBinKindSchema,
        id: z.string().length(26),
      })
      .parse(req.params);
    const result = await restoreEntity(
      app,
      actor,
      kind as RecycleBinKind,
      id,
    );
    return ok(result, req.id);
  });
};
