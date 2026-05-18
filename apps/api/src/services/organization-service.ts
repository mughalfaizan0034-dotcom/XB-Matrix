import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { ulid } from 'ulid';
import type { ActorContext, OrganizationId } from '@xb/types';
import { ForbiddenError } from '@xb/auth';

export interface Organization {
  readonly id: OrganizationId;
  readonly displayName: string;
  readonly legalName: string | null;
  readonly slug: string;
  readonly organizationStatus: 'active' | 'suspended' | 'archived';
  readonly billingStatus: 'active' | 'past_due' | 'cancelled' | 'trial' | 'not_configured';
  readonly defaultCurrencyCode: string;
  readonly defaultTimezone: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

interface OrgRow {
  id: string;
  display_name: string;
  legal_name: string | null;
  slug: string;
  organization_status: Organization['organizationStatus'];
  billing_status: Organization['billingStatus'];
  default_currency_code: string;
  default_timezone: string;
  created_at: Date;
  updated_at: Date;
  row_version: number;
}

function rowToOrganization(r: OrgRow): Organization {
  return {
    id: r.id as OrganizationId,
    displayName: r.display_name,
    legalName: r.legal_name,
    slug: r.slug,
    organizationStatus: r.organization_status,
    billingStatus: r.billing_status,
    defaultCurrencyCode: r.default_currency_code,
    defaultTimezone: r.default_timezone,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    rowVersion: r.row_version,
  };
}

const SELECT_ORG = `
  SELECT id, display_name, legal_name, slug, organization_status, billing_status,
         default_currency_code, default_timezone, created_at, updated_at, row_version
    FROM xb_core.organizations
   WHERE deleted_at IS NULL
`;

export interface ListOptions {
  readonly limit?: number;
  readonly cursor?: string | null;
  readonly status?: Organization['organizationStatus'];
}

/**
 * List organizations.
 * - internal_manager + internal_staff see everything
 * - organization_user / organization_admin see only their own organization
 * - others get an empty list
 */
export async function listOrganizations(
  app: FastifyInstance,
  actor: ActorContext,
  opts: ListOptions = {},
): Promise<ReadonlyArray<Organization>> {
  await app.assertPermission(actor, {
    organizationId: (actor.organizationId ?? 'platform') as OrganizationId,
    workspaceId: null,
    module: 'settings',
    action: 'view',
  });

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

  if (actor.isInternalManager || actor.effectiveRole === 'internal_staff') {
    const params: unknown[] = [limit];
    let where = '';
    if (opts.status) {
      where = 'AND organization_status = $2';
      params.push(opts.status);
    }
    const { rows } = await app.pg.query<OrgRow>(
      `${SELECT_ORG} ${where} ORDER BY created_at DESC LIMIT $1`,
      params,
    );
    return rows.map(rowToOrganization);
  }

  if (actor.organizationId) {
    return app.withConnection(actor, async (client) => listOrgsInTx(client, actor.organizationId!));
  }
  return [];
}

async function listOrgsInTx(client: PoolClient, orgId: string): Promise<Organization[]> {
  const { rows } = await client.query<OrgRow>(`${SELECT_ORG} AND id = $1`, [orgId]);
  return rows.map(rowToOrganization);
}

export async function getOrganization(
  app: FastifyInstance,
  actor: ActorContext,
  id: OrganizationId,
): Promise<Organization | null> {
  await app.assertPermission(actor, {
    organizationId: id,
    workspaceId: null,
    module: 'settings',
    action: 'view',
  });

  if (actor.isInternalManager || actor.effectiveRole === 'internal_staff') {
    const { rows } = await app.pg.query<OrgRow>(`${SELECT_ORG} AND id = $1`, [id]);
    return rows[0] ? rowToOrganization(rows[0]) : null;
  }
  if (actor.organizationId === id) {
    return app.withConnection(actor, async (client) => {
      const { rows } = await client.query<OrgRow>(`${SELECT_ORG} AND id = $1`, [id]);
      return rows[0] ? rowToOrganization(rows[0]) : null;
    });
  }
  return null;
}

export interface CreateOrganizationInput {
  readonly displayName: string;
  readonly legalName?: string;
  readonly slug: string;
  readonly defaultCurrencyCode: string;
  readonly defaultTimezone?: string;
}

/**
 * Create a new organization. Internal manager only.
 *
 * Runs in a tx with the actor context set so the audit trigger captures
 * who did it. No RLS on organizations (platform-global), so the connection
 * context only matters for the audit trigger.
 */
export async function createOrganization(
  app: FastifyInstance,
  actor: ActorContext,
  input: CreateOrganizationInput,
): Promise<Organization> {
  if (!actor.isInternalManager) {
    throw new ForbiddenError('only internal managers can create organizations', 'internal_only');
  }
  const id = ulid();
  return app.withConnection(actor, async (client) => {
    await client.query(
      `INSERT INTO xb_core.organizations
         (id, display_name, legal_name, slug, default_currency_code, default_timezone,
          created_by_actor_id, updated_by_actor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [
        id,
        input.displayName,
        input.legalName ?? null,
        input.slug,
        input.defaultCurrencyCode,
        input.defaultTimezone ?? 'UTC',
        actor.actorId,
      ],
    );
    const { rows } = await client.query<OrgRow>(`${SELECT_ORG} AND id = $1`, [id]);
    if (!rows[0]) throw new Error('inserted organization vanished');
    return rowToOrganization(rows[0]);
  });
}

export interface PatchOrganizationInput {
  readonly displayName?: string;
  readonly legalName?: string | null;
  readonly defaultCurrencyCode?: string;
  readonly defaultTimezone?: string;
  readonly expectedRowVersion: number;
}

export async function patchOrganization(
  app: FastifyInstance,
  actor: ActorContext,
  id: OrganizationId,
  input: PatchOrganizationInput,
): Promise<Organization> {
  await app.assertPermission(actor, {
    organizationId: id,
    workspaceId: null,
    module: 'settings',
    action: 'edit',
  });
  // Org admins can only patch their own org; internal managers can patch any.
  if (!actor.isInternalManager && actor.organizationId !== id) {
    throw new ForbiddenError('cannot edit other organizations', 'org_scope');
  }

  return app.withConnection(actor, async (client) => {
    const updates: string[] = [];
    const params: unknown[] = [];
    let p = 0;
    if (input.displayName !== undefined) {
      params.push(input.displayName);
      updates.push(`display_name = $${++p}`);
    }
    if (input.legalName !== undefined) {
      params.push(input.legalName);
      updates.push(`legal_name = $${++p}`);
    }
    if (input.defaultCurrencyCode !== undefined) {
      params.push(input.defaultCurrencyCode);
      updates.push(`default_currency_code = $${++p}`);
    }
    if (input.defaultTimezone !== undefined) {
      params.push(input.defaultTimezone);
      updates.push(`default_timezone = $${++p}`);
    }
    if (updates.length === 0) {
      const { rows } = await client.query<OrgRow>(`${SELECT_ORG} AND id = $1`, [id]);
      if (!rows[0]) throw new ForbiddenError('organization not found', 'not_found');
      return rowToOrganization(rows[0]);
    }
    params.push(actor.actorId);
    updates.push(`updated_by_actor_id = $${++p}`);
    params.push(id);
    params.push(input.expectedRowVersion);
    const idIdx = ++p;
    const verIdx = ++p;

    const result = await client.query<OrgRow>(
      `UPDATE xb_core.organizations
          SET ${updates.join(', ')}
        WHERE id = $${idIdx}
          AND deleted_at IS NULL
          AND row_version = $${verIdx}
        RETURNING id, display_name, legal_name, slug, organization_status, billing_status,
                  default_currency_code, default_timezone, created_at, updated_at, row_version`,
      params,
    );
    if (result.rows.length === 0) {
      throw new ForbiddenError('organization not found or row_version mismatch', 'stale_version');
    }
    return rowToOrganization(result.rows[0]!);
  });
}
