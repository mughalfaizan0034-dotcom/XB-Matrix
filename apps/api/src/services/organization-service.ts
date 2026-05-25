import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { ulid } from 'ulid';
import type { ActorContext, OrganizationId } from '@xb/types';
import { isValidSlug, toSlug } from '@xb/types/slug';
import { ForbiddenError } from '@xb/auth';
import { canViewOrganizations } from '../lib/permissions.js';
import { ConflictError, ConcurrencyError, NotFoundError, SemanticError } from '../lib/errors.js';

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
  /** Zero-based page offset. */
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: Organization['organizationStatus'];
  /** Free-text search across display_name + legal_name + slug. */
  readonly q?: string;
  /** Sort column. Prefix with `-` for descending (e.g., `-createdAt`). */
  readonly sort?: string;
}

export interface OrganizationListResult {
  readonly items: ReadonlyArray<Organization>;
  readonly total: number;
  readonly hasMore: boolean;
}

const SORT_COLUMN_MAP: Record<string, string> = {
  displayName: 'display_name',
  slug: 'slug',
  status: 'organization_status',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

function parseSort(sort: string | undefined): { column: string; direction: 'ASC' | 'DESC' } {
  if (!sort) return { column: 'created_at', direction: 'DESC' };
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  const column = SORT_COLUMN_MAP[key] ?? 'created_at';
  return { column, direction: desc ? 'DESC' : 'ASC' };
}

/**
 * List organizations with offset-based pagination, optional search, and
 * server-side sorting. The result shape carries `total` so the UI can
 * render "Showing X–Y of N" without a separate count round trip.
 *
 *   - internal_manager + internal_staff see everything
 *   - organization_user / organization_admin see only their own org
 *   - others get an empty list
 *
 * The search uses ILIKE — fine for the < 10k orgs we'll have at maturity.
 * If org count ever crosses ~100k we'll want a trigram index + tsvector;
 * not worth the operational cost today.
 */
export async function listOrganizations(
  app: FastifyInstance,
  actor: ActorContext,
  opts: ListOptions = {},
): Promise<OrganizationListResult> {
  await app.assertPermission(actor, {
    organizationId: (actor.organizationId ?? 'platform') as OrganizationId,
    workspaceId: null,
    module: 'settings',
    action: 'view',
  });

  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 200);
  const page = Math.max(opts.page ?? 0, 0);
  const offset = page * pageSize;
  const { column, direction } = parseSort(opts.sort);

  // Org-scoped users see only their own org. No pagination needed — at
  // most one row — but we keep the same shape so the route is uniform.
  if (!canViewOrganizations(actor)) {
    if (!actor.organizationId) return { items: [], total: 0, hasMore: false };
    const items = await app.withConnection(actor, async (client) =>
      listOrgsInTx(client, actor.organizationId!),
    );
    return { items, total: items.length, hasMore: false };
  }

  // Internal users: build a parameterized WHERE for status + search.
  const where: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (opts.status) {
    where.push(`organization_status = $${idx++}`);
    params.push(opts.status);
  }
  if (opts.q && opts.q.trim()) {
    const like = `%${opts.q.trim().toLowerCase()}%`;
    where.push(
      `(lower(display_name) LIKE $${idx} OR lower(coalesce(legal_name, '')) LIKE $${idx} OR slug LIKE $${idx})`,
    );
    params.push(like);
    idx++;
  }

  const whereSql = where.length ? `AND ${where.join(' AND ')}` : '';

  const { rows: countRows } = await app.pg.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM xb_core.organizations WHERE deleted_at IS NULL ${whereSql}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);

  // ORDER BY is interpolated (allow-listed via SORT_COLUMN_MAP) — never
  // user-controlled. LIMIT/OFFSET are parameterized.
  const dataParams = [...params, pageSize, offset];
  const { rows } = await app.pg.query<OrgRow>(
    `${SELECT_ORG} ${whereSql} ORDER BY ${column} ${direction}, id ${direction} LIMIT $${idx++} OFFSET $${idx++}`,
    dataParams,
  );
  const items = rows.map(rowToOrganization);
  return { items, total, hasMore: offset + items.length < total };
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

  if (canViewOrganizations(actor)) {
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
  readonly defaultCurrencyCode: string;
  readonly defaultTimezone?: string;
}

/**
 * Create a new organization. Internal manager only.
 *
 * Slug is derived from displayName via toSlug() and is immutable after
 * creation — there is no API path to change it. Routing keys, URLs, audit
 * references all depend on the slug staying stable.
 *
 * Duplicate displayName (after slug derivation) raises ConflictError
 * mapped to HTTP 409 — never surfaces as a 500 to the frontend.
 */
export async function createOrganization(
  app: FastifyInstance,
  actor: ActorContext,
  input: CreateOrganizationInput,
): Promise<Organization> {
  if (!actor.isInternalManager) {
    throw new ForbiddenError('only internal managers can create organizations', 'internal_only');
  }

  const slug = toSlug(input.displayName);
  if (!isValidSlug(slug)) {
    throw new SemanticError(
      'Organization name must contain at least one letter or digit (used to generate a URL identifier).',
      'invalid_slug_source',
    );
  }

  const id = ulid();
  try {
    return await app.withConnection(actor, async (client) => {
      await client.query(
        `INSERT INTO xb_core.organizations
           (id, display_name, legal_name, slug, default_currency_code, default_timezone,
            created_by_actor_id, updated_by_actor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [
          id,
          input.displayName.trim(),
          input.legalName?.trim() || null,
          slug,
          input.defaultCurrencyCode,
          input.defaultTimezone ?? 'UTC',
          actor.actorId,
        ],
      );
      const { rows } = await client.query<OrgRow>(`${SELECT_ORG} AND id = $1`, [id]);
      if (!rows[0]) throw new Error('inserted organization vanished');
      return rowToOrganization(rows[0]);
    });
  } catch (err) {
    if (isUniqueViolation(err, 'uq_organizations_slug')) {
      throw new ConflictError(
        `An organization with the name "${input.displayName.trim()}" (slug: ${slug}) already exists.`,
        'organization_exists',
        { slug },
      );
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  if (e?.code !== '23505') return false;
  return !constraint || e.constraint === constraint;
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
      throw new ConcurrencyError();
    }
    return rowToOrganization(result.rows[0]!);
  });
}

// ---------------------------------------------------------------------------
// Lifecycle operations
// ---------------------------------------------------------------------------
//
// Hard delete is intentionally NOT exposed. The lifecycle is:
//
//   active ──suspend──> suspended ──reactivate──> active
//     │                                                 │
//     ├──archive──> archived ──restore──> active────────┘
//     │
//     └──soft-delete──> (deleted_at set; visible only to internal managers)
//                        └──restore──> active
//
// All transitions require `settings.edit` (internal_manager bypass applies).
// The audit trigger writes a `record.updated` / `record.soft_deleted` /
// `record.restored` entry automatically based on the diff.

async function transitionOrgStatus(
  app: FastifyInstance,
  actor: ActorContext,
  id: OrganizationId,
  expectedRowVersion: number,
  next: Organization['organizationStatus'],
  requireFrom?: ReadonlyArray<Organization['organizationStatus']>,
): Promise<Organization> {
  await app.assertPermission(actor, {
    organizationId: id,
    workspaceId: null,
    module: 'settings',
    action: 'edit',
  });
  if (!actor.isInternalManager && actor.organizationId !== id) {
    throw new ForbiddenError('cannot edit other organizations', 'org_scope');
  }
  return app.withConnection(actor, async (client) => {
    const { rows: existing } = await client.query<OrgRow>(`${SELECT_ORG} AND id = $1`, [id]);
    const cur = existing[0];
    if (!cur) throw new NotFoundError('organization', id);
    if (requireFrom && !requireFrom.includes(cur.organization_status)) {
      throw new SemanticError(
        `cannot transition from ${cur.organization_status} to ${next}`,
        'invalid_status_transition',
        { from: cur.organization_status, to: next, allowedFrom: requireFrom },
      );
    }
    const result = await client.query<OrgRow>(
      `UPDATE xb_core.organizations
          SET organization_status = $3::varchar,
              updated_by_actor_id = $4,
              suspended_at = CASE WHEN $3::varchar = 'suspended' THEN now() ELSE NULL END,
              archived_at  = CASE WHEN $3::varchar = 'archived'  THEN now() ELSE NULL END
        WHERE id = $1
          AND deleted_at IS NULL
          AND row_version = $2
        RETURNING id, display_name, legal_name, slug, organization_status, billing_status,
                  default_currency_code, default_timezone, created_at, updated_at, row_version`,
      [id, expectedRowVersion, next, actor.actorId],
    );
    if (result.rows.length === 0) throw new ConcurrencyError();
    return rowToOrganization(result.rows[0]!);
  });
}

export const suspendOrganization = (
  app: FastifyInstance,
  actor: ActorContext,
  id: OrganizationId,
  expectedRowVersion: number,
) => transitionOrgStatus(app, actor, id, expectedRowVersion, 'suspended', ['active']);

export const reactivateOrganization = (
  app: FastifyInstance,
  actor: ActorContext,
  id: OrganizationId,
  expectedRowVersion: number,
) => transitionOrgStatus(app, actor, id, expectedRowVersion, 'active', ['suspended', 'archived']);

export const archiveOrganization = (
  app: FastifyInstance,
  actor: ActorContext,
  id: OrganizationId,
  expectedRowVersion: number,
) => transitionOrgStatus(app, actor, id, expectedRowVersion, 'archived', ['active', 'suspended']);

/**
 * Soft delete. Sets deleted_at; the row remains for 90 days and is then
 * hard-purged by a worker (which writes a `record.hard_deleted` audit
 * entry first). Internal managers only.
 */
export async function softDeleteOrganization(
  app: FastifyInstance,
  actor: ActorContext,
  id: OrganizationId,
  expectedRowVersion: number,
): Promise<Organization> {
  if (!actor.isInternalManager) {
    throw new ForbiddenError('only internal managers can delete organizations', 'internal_only');
  }
  return app.withConnection(actor, async (client) => {
    const result = await client.query<OrgRow>(
      `UPDATE xb_core.organizations
          SET deleted_at = now(),
              deleted_by_actor_id = $3
        WHERE id = $1
          AND deleted_at IS NULL
          AND row_version = $2
        RETURNING id, display_name, legal_name, slug, organization_status, billing_status,
                  default_currency_code, default_timezone, created_at, updated_at, row_version`,
      [id, expectedRowVersion, actor.actorId],
    );
    if (result.rows.length === 0) throw new ConcurrencyError();
    return rowToOrganization(result.rows[0]!);
  });
}

/**
 * Restore a soft-deleted organization. Clears deleted_at and resets status to
 * active. Internal managers only. Only works within the 90-day window before
 * the hard-purge job removes the row.
 */
export async function restoreOrganization(
  app: FastifyInstance,
  actor: ActorContext,
  id: OrganizationId,
): Promise<Organization> {
  if (!actor.isInternalManager) {
    throw new ForbiddenError('only internal managers can restore organizations', 'internal_only');
  }
  return app.withConnection(actor, async (client) => {
    const result = await client.query<OrgRow>(
      `UPDATE xb_core.organizations
          SET deleted_at = NULL,
              deleted_by_actor_id = NULL,
              organization_status = 'active',
              suspended_at = NULL,
              archived_at = NULL,
              updated_by_actor_id = $2
        WHERE id = $1
          AND deleted_at IS NOT NULL
        RETURNING id, display_name, legal_name, slug, organization_status, billing_status,
                  default_currency_code, default_timezone, created_at, updated_at, row_version`,
      [id, actor.actorId],
    );
    if (result.rows.length === 0) throw new NotFoundError('soft-deleted organization', id);
    return rowToOrganization(result.rows[0]!);
  });
}
