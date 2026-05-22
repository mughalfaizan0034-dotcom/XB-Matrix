import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { WorkspaceId } from '@xb/types';
import {
  getAdvertisingSummary,
  getDashboardKpis,
  getReportRegistry,
  getShipmentsReadiness,
  getUnitEconomicsSummary,
} from '../services/intelligence-service.js';
import { ok } from '../lib/http-helpers.js';

/**
 * Intelligence read API — the single service layer that feeds
 * dashboard tiles, module summaries, reports, and (later) AI
 * insights. Every endpoint is workspace-scoped and read-only; all
 * computation happens in intelligence-service. The frontend never
 * recomputes a KPI here.
 *
 * Workspace access (view / edit) is enforced inside each service
 * call via requireWorkspaceAccess, so the same routes are safe for
 * org admins, internal managers, and view-only org users alike.
 */
const ULID = z.string().length(26);

const ScopeQuery = z.object({
  workspaceId: ULID,
  windowDays: z.coerce.number().int().min(1).max(365).optional(),
});

export const intelligenceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/dashboard', async (req) => {
    const actor = req.requireActor();
    const q = ScopeQuery.parse(req.query);
    const bundle = await getDashboardKpis(app, actor, {
      workspaceId: q.workspaceId as WorkspaceId,
      windowDays: q.windowDays ?? 30,
    });
    return ok(bundle, req.id);
  });

  app.get('/advertising', async (req) => {
    const actor = req.requireActor();
    const q = ScopeQuery.parse(req.query);
    const result = await getAdvertisingSummary(app, actor, {
      workspaceId: q.workspaceId as WorkspaceId,
      windowDays: q.windowDays ?? 30,
    });
    return ok(result, req.id);
  });

  app.get('/unit-economics', async (req) => {
    const actor = req.requireActor();
    const q = ScopeQuery.parse(req.query);
    const result = await getUnitEconomicsSummary(app, actor, {
      workspaceId: q.workspaceId as WorkspaceId,
      windowDays: q.windowDays ?? 30,
    });
    return ok(result, req.id);
  });

  app.get('/shipments', async (req) => {
    const actor = req.requireActor();
    const q = ScopeQuery.parse(req.query);
    const result = await getShipmentsReadiness(app, actor, {
      workspaceId: q.workspaceId as WorkspaceId,
      windowDays: q.windowDays ?? 30,
    });
    return ok(result, req.id);
  });

  app.get('/reports', async (req) => {
    const actor = req.requireActor();
    const q = ScopeQuery.parse(req.query);
    const result = await getReportRegistry(app, actor, {
      workspaceId: q.workspaceId as WorkspaceId,
      windowDays: q.windowDays ?? 30,
    });
    return ok(result, req.id);
  });
};
