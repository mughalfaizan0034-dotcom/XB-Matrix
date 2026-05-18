import type { FastifyInstance } from 'fastify';
import type { ActorContext, OrganizationId } from '@xb/types';
import { ForbiddenError } from '@xb/auth';

export interface AuditEntry {
  readonly id: string;
  readonly organizationId: string | null;
  readonly workspaceId: string | null;
  readonly actorId: string | null;
  readonly actorKind: string;
  readonly operation: string;
  readonly entityKind: string;
  readonly entityId: string | null;
  readonly occurredAt: string;
  readonly metadata: Record<string, unknown> | null;
}

interface AuditRow {
  id: string;
  organization_id: string | null;
  workspace_id: string | null;
  actor_id: string | null;
  actor_kind: string;
  operation: string;
  entity_kind: string;
  entity_id: string | null;
  occurred_at: Date;
  metadata: Record<string, unknown> | null;
}

function rowToEntry(r: AuditRow): AuditEntry {
  return {
    id: r.id,
    organizationId: r.organization_id,
    workspaceId: r.workspace_id,
    actorId: r.actor_id,
    actorKind: r.actor_kind,
    operation: r.operation,
    entityKind: r.entity_kind,
    entityId: r.entity_id,
    occurredAt: r.occurred_at.toISOString(),
    metadata: r.metadata,
  };
}

export interface ListEntityAuditOptions {
  readonly entityKind: string;     // e.g. 'xb_core.organizations'
  readonly entityId: string;
  readonly organizationId: OrganizationId;
  readonly limit?: number;
}

/**
 * Read audit log entries for a specific entity. The audit_log table is
 * partitioned by occurred_at — we always include a 90-day lower bound on
 * the predicate so the planner prunes to recent partitions only.
 *
 * RLS enforces org isolation; we set the connection context first so the
 * policy filters correctly.
 */
export async function listEntityAudit(
  app: FastifyInstance,
  actor: ActorContext,
  opts: ListEntityAuditOptions,
): Promise<ReadonlyArray<AuditEntry>> {
  await app.assertPermission(actor, {
    organizationId: opts.organizationId,
    workspaceId: null,
    module: 'settings',
    action: 'view',
  });
  if (!actor.isInternalManager && actor.organizationId !== opts.organizationId) {
    throw new ForbiddenError('cannot view audit for other organizations', 'org_scope');
  }

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<AuditRow>(
      `SELECT id, organization_id, workspace_id, actor_id, actor_kind, operation,
              entity_kind, entity_id, occurred_at, metadata
         FROM xb_audit.audit_log
        WHERE occurred_at > now() - interval '90 days'
          AND entity_kind = $1
          AND entity_id   = $2
        ORDER BY occurred_at DESC
        LIMIT $3`,
      [opts.entityKind, opts.entityId, limit],
    );
    return rows.map(rowToEntry);
  });
}
