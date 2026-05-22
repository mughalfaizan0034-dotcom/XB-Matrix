import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  getDiagnostics,
  listFeatureFlags,
  listOrganizationsBilling,
  listPlatformAudit,
} from '../services/platform-service.js';
import { ok } from '../lib/http-helpers.js';

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
};
