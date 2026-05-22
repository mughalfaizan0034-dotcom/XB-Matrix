import type { FastifyInstance } from 'fastify';
import { ForbiddenError } from '@xb/auth';
import type { ActorContext } from '@xb/types';

/**
 * Platform-administration reads — cross-org diagnostics, audit feed,
 * billing-ops tracker, feature-flag registry. All endpoints are
 * read-only and restricted to internal managers (super_admin /
 * internal_manager). internal_staff falls back to per-org views.
 *
 * These power the platform sections in Settings (Platform Audit /
 * Feature Flags / Diagnostics / Billing Ops / System Integrations).
 * Same actor-context + RLS rules apply to every query.
 */

function requirePlatformAdmin(actor: ActorContext): void {
  if (!actor.isInternalManager) {
    throw new ForbiddenError(
      'Platform administration is restricted to internal managers.',
      'not_platform_admin',
    );
  }
}

// ----- Platform Audit -------------------------------------------------

export interface PlatformAuditEntry {
  readonly id: string;
  readonly organizationId: string | null;
  readonly workspaceId: string | null;
  readonly actorId: string | null;
  readonly actorKind: string;
  readonly operation: string;
  readonly entityKind: string;
  readonly entityId: string | null;
  readonly occurredAt: string;
}

export async function listPlatformAudit(
  app: FastifyInstance,
  actor: ActorContext,
  opts: { limit?: number } = {},
): Promise<ReadonlyArray<PlatformAuditEntry>> {
  requirePlatformAdmin(actor);
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{
      id: string;
      organization_id: string | null;
      workspace_id: string | null;
      actor_id: string | null;
      actor_kind: string;
      operation: string;
      entity_kind: string;
      entity_id: string | null;
      occurred_at: Date;
    }>(
      `SELECT id, organization_id, workspace_id, actor_id, actor_kind,
              operation, entity_kind, entity_id, occurred_at
         FROM xb_audit.audit_log
        WHERE occurred_at > now() - interval '30 days'
        ORDER BY occurred_at DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      workspaceId: r.workspace_id,
      actorId: r.actor_id,
      actorKind: r.actor_kind,
      operation: r.operation,
      entityKind: r.entity_kind,
      entityId: r.entity_id,
      occurredAt: r.occurred_at.toISOString(),
    }));
  });
}

// ----- Diagnostics ---------------------------------------------------

export interface DiagnosticsResult {
  readonly api: { uptime: number; nodeVersion: string };
  readonly database: { connected: boolean; latencyMs: number | null };
  readonly redis: { status: string };
  readonly storage: { configured: boolean };
  readonly counts: {
    organizations: number;
    workspaces: number;
    users: number;
    uploads: number;
    auditEvents30d: number;
    channelSalesRows: number;
  };
}

export async function getDiagnostics(
  app: FastifyInstance,
  actor: ActorContext,
): Promise<DiagnosticsResult> {
  requirePlatformAdmin(actor);

  // DB ping + latency.
  let dbConnected = false;
  let dbLatency: number | null = null;
  try {
    const start = Date.now();
    await app.pg.query('SELECT 1');
    dbLatency = Date.now() - start;
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  // Platform-wide counts. Single round trip via correlated subqueries.
  let counts = {
    organizations: 0,
    workspaces: 0,
    users: 0,
    uploads: 0,
    auditEvents30d: 0,
    channelSalesRows: 0,
  };
  if (dbConnected) {
    try {
      const { rows } = await app.pg.query<{
        organizations: string;
        workspaces: string;
        users: string;
        uploads: string;
        audit: string;
        channel_sales: string;
      }>(
        `SELECT
           (SELECT COUNT(*)::text FROM xb_core.organizations WHERE deleted_at IS NULL) AS organizations,
           (SELECT COUNT(*)::text FROM xb_core.workspaces    WHERE deleted_at IS NULL) AS workspaces,
           (SELECT COUNT(*)::text FROM xb_core.users         WHERE deleted_at IS NULL) AS users,
           (SELECT COUNT(*)::text FROM xb_core.uploads)                                AS uploads,
           (SELECT COUNT(*)::text FROM xb_audit.audit_log
              WHERE occurred_at > now() - interval '30 days')                          AS audit,
           (SELECT COUNT(*)::text FROM xb_canonical.channel_sales)                     AS channel_sales`,
      );
      const r = rows[0]!;
      counts = {
        organizations: Number(r.organizations),
        workspaces: Number(r.workspaces),
        users: Number(r.users),
        uploads: Number(r.uploads),
        auditEvents30d: Number(r.audit),
        channelSalesRows: Number(r.channel_sales),
      };
    } catch {
      // Best-effort — counts are informational; surface zeros if any
      // table is missing on a freshly migrated DB.
    }
  }

  const redisStatus =
    (app as { redis?: { status?: string } }).redis?.status ?? 'unknown';
  const storageConfigured = 'storage' in (app as unknown as Record<string, unknown>);

  return {
    api: { uptime: Math.round(process.uptime()), nodeVersion: process.version },
    database: { connected: dbConnected, latencyMs: dbLatency },
    redis: { status: redisStatus },
    storage: { configured: storageConfigured },
    counts,
  };
}

// ----- Billing Ops ---------------------------------------------------

export interface BillingRow {
  readonly id: string;
  readonly displayName: string;
  readonly slug: string;
  readonly organizationStatus: string;
  readonly billingStatus: string;
  readonly defaultCurrencyCode: string;
  readonly createdAt: string;
}

export async function listOrganizationsBilling(
  app: FastifyInstance,
  actor: ActorContext,
): Promise<ReadonlyArray<BillingRow>> {
  requirePlatformAdmin(actor);
  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{
      id: string;
      display_name: string;
      slug: string;
      organization_status: string;
      billing_status: string;
      default_currency_code: string;
      created_at: Date;
    }>(
      `SELECT id, display_name, slug, organization_status, billing_status,
              default_currency_code, created_at
         FROM xb_core.organizations
        WHERE deleted_at IS NULL
        ORDER BY display_name ASC`,
    );
    return rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      slug: r.slug,
      organizationStatus: r.organization_status,
      billingStatus: r.billing_status,
      defaultCurrencyCode: r.default_currency_code,
      createdAt: r.created_at.toISOString(),
    }));
  });
}

// ----- Feature Flags -------------------------------------------------

export interface FeatureFlagsResult {
  readonly registered: ReadonlyArray<{ key: string; description: string }>;
  readonly note: string;
}

export async function listFeatureFlags(
  actor: ActorContext,
): Promise<FeatureFlagsResult> {
  requirePlatformAdmin(actor);
  // The xb_core.feature_flags + feature_flag_overrides tables from Spec 3
  // §10 are not yet shipped as a migration. When they land this function
  // reads them; for now the section reports an honest empty state.
  return {
    registered: [],
    note: 'Feature-flag registry tables are not yet migrated. The Spec 3 §10 catalog ships in a follow-up; flags + per-scope overrides will surface here automatically.',
  };
}
