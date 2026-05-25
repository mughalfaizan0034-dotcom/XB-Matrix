import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import type { ActorContext, OrganizationId } from '@xb/types';
import { ForbiddenError } from '@xb/auth';
import {
  actorKindFor,
  internalRoleColumnFor,
  isInternalCreatableRole,
  orgRoleColumnFor,
  userKindFor,
  type CreatableRole,
} from '../lib/permissions.js';
import { hashPassword } from '../lib/password.js';
import {
  ConflictError,
  NotFoundError,
  SemanticError,
} from '../lib/errors.js';

/**
 * Temporary bootstrap / testing tool.
 *
 * Internal-manager-only. Lets a manager manually create a user with a
 * known password and skip the invitation + email-verification flow so
 * realistic multi-user testing can happen before that lifecycle is
 * fully built out.
 *
 * This is NOT the final user-creation UX — production user creation
 * goes through invitations-service. When the full invitation +
 * verification lifecycle ships, this path either:
 *   - gets removed, or
 *   - stays as a super-admin operational tool, kept manager-only.
 *
 * Authorization: hard-gated to actor.isInternalManager. Org admins
 * cannot use this — they still go through invitations.
 */

export type BootstrapRole = CreatableRole;

export interface BootstrapUserInput {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
  readonly role: BootstrapRole;
  /** Required for organization_* roles; ignored for internal_* */
  readonly organizationId?: OrganizationId | null;
  /** When true, sets email_verified_at = now() so sign-in doesn't ask. */
  readonly markEmailVerified?: boolean;
}

export interface BootstrappedUser {
  readonly userId: string;
  readonly actorId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: BootstrapRole;
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  readonly emailVerified: boolean;
}

/**
 * Create a fully-active user without the invitation round-trip.
 * Inserts actor + user in one tx, with password already hashed and
 * status='active'. Optional bypass of email verification gate.
 */
export async function bootstrapUser(
  app: FastifyInstance,
  actor: ActorContext,
  input: BootstrapUserInput,
): Promise<BootstrappedUser> {
  if (!actor.isInternalManager) {
    throw new ForbiddenError(
      'Only internal managers can use the bootstrap user-creation tool.',
      'not_manager',
    );
  }

  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!email || !displayName) {
    throw new SemanticError('Email and display name are required.', 'invalid_input');
  }
  if (input.password.length < 12) {
    throw new SemanticError(
      'Password must be at least 12 characters.',
      'weak_password',
    );
  }

  const orgId = isInternalCreatableRole(input.role)
    ? null
    : input.organizationId ?? null;
  if (!isInternalCreatableRole(input.role) && !orgId) {
    throw new SemanticError(
      'organization_admin and organization_user require an organizationId.',
      'invalid_input',
    );
  }

  const hash = await hashPassword(input.password);
  const userId = ulid();
  const newActorId = ulid();
  const username = email;
  const markVerified = input.markEmailVerified ?? true;

  try {
    return await app.withConnection(actor, async (client) => {
      // Resolve org name + status for echo + sanity-check.
      let organizationName: string | null = null;
      if (orgId) {
        const { rows: orgRows } = await client.query<{
          display_name: string;
          organization_status: string;
        }>(
          `SELECT display_name, organization_status
             FROM xb_core.organizations
            WHERE id = $1 AND deleted_at IS NULL`,
          [orgId],
        );
        const org = orgRows[0];
        if (!org) throw new NotFoundError('organization', orgId);
        if (org.organization_status !== 'active') {
          throw new SemanticError(
            `Cannot create users in a ${org.organization_status} organization.`,
            'parent_org_not_active',
          );
        }
        organizationName = org.display_name;
      }

      await client.query(
        `INSERT INTO xb_core.actors
           (id, organization_id, actor_kind, display_name, actor_status, created_by_actor_id)
         VALUES ($1, $2, $3, $4, 'active', $5)`,
        [
          newActorId,
          orgId,
          actorKindFor(input.role),
          displayName,
          actor.actorId,
        ],
      );

      await client.query(
        `INSERT INTO xb_core.users
           (id, actor_id, user_kind, organization_id, username, display_name, email,
            password_hash, internal_user_role, organization_user_role,
            user_status, email_verified_at, password_changed_at,
            created_by_actor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active',
                 CASE WHEN $11 THEN now() ELSE NULL END,
                 now(), $12)`,
        [
          userId,
          newActorId,
          userKindFor(input.role),
          orgId,
          username,
          displayName,
          email,
          hash,
          internalRoleColumnFor(input.role),
          orgRoleColumnFor(input.role),
          markVerified,
          actor.actorId,
        ],
      );

      return {
        userId,
        actorId: newActorId,
        email,
        displayName,
        role: input.role,
        organizationId: orgId,
        organizationName,
        emailVerified: markVerified,
      };
    });
  } catch (err) {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr.constraint === 'uq_users_email') {
      throw new ConflictError(
        `A user with the email "${email}" already exists. Pick a different email or deactivate the existing user first.`,
        'user_exists',
      );
    }
    throw err;
  }
}

// =====================================================================
// Debug visibility — actor context + resolver decision snapshot.
//
// Internal-manager-only. Returns a structured summary so an operator
// can diagnose "why doesn't this user see X" without reading server
// logs. The snapshot is point-in-time; it doesn't persist anything.
// =====================================================================

export interface ResolverProbe {
  readonly module: string;
  readonly action: string;
  readonly organizationId: string | null;
  readonly workspaceId: string | null;
  readonly allowed: boolean;
  readonly source: string;
  readonly reason?: string;
}

export interface DebugContextOutput {
  readonly actor: {
    readonly actorId: string;
    readonly actorKind: string;
    readonly effectiveRole: string;
    readonly organizationId: string | null;
    readonly isInternalManager: boolean;
    readonly sessionId: string | null;
  };
  readonly organizations: ReadonlyArray<{
    readonly id: string;
    readonly displayName: string;
    readonly organizationStatus: string;
  }>;
  readonly workspaces: ReadonlyArray<{
    readonly id: string;
    readonly workspaceName: string;
    readonly organizationId: string;
    readonly organizationName: string;
    readonly workspaceStatus: string;
  }>;
  readonly resolverProbes: ReadonlyArray<ResolverProbe>;
}

/**
 * Build a debug snapshot of what the current actor can see / do.
 * Probes the resolver against a fixed grid of (module × action) over
 * the actor's accessible orgs + workspaces so the operator gets the
 * full picture in one round-trip.
 *
 * Bounded: probes are capped to the first 10 workspaces — operators
 * with more visibility should drill into specific workspaces by id.
 */
export async function buildDebugContext(
  app: FastifyInstance,
  actor: ActorContext,
): Promise<DebugContextOutput> {
  if (!actor.isInternalManager) {
    throw new ForbiddenError(
      'Debug context is internal-manager only.',
      'not_manager',
    );
  }

  // Orgs the manager can see (all of them, scoped only by deleted_at).
  const { rows: orgRows } = await app.pg.query<{
    id: string;
    display_name: string;
    organization_status: string;
  }>(
    `SELECT id, display_name, organization_status
       FROM xb_core.organizations
      WHERE deleted_at IS NULL
      ORDER BY display_name
      LIMIT 100`,
  );

  // Workspaces across all orgs (manager scope).
  const { rows: wsRows } = await app.pg.query<{
    id: string;
    workspace_name: string;
    organization_id: string;
    organization_name: string;
    workspace_status: string;
  }>(
    `SELECT w.id, w.workspace_name,
            w.organization_id, o.display_name AS organization_name,
            w.workspace_status
       FROM xb_core.workspaces w
       JOIN xb_core.organizations o ON o.id = w.organization_id
      WHERE w.deleted_at IS NULL AND o.deleted_at IS NULL
      ORDER BY o.display_name, w.workspace_name
      LIMIT 200`,
  );

  // Resolver grid: a small set of representative (module, action) pairs
  // probed against the first workspace per org, so the result is
  // actionable rather than overwhelming.
  const PROBE_GRID: ReadonlyArray<{ module: string; action: string }> = [
    { module: 'settings', action: 'view' },
    { module: 'settings', action: 'edit' },
    { module: 'settings', action: 'admin' },
    { module: 'uploads', action: 'view' },
    { module: 'uploads', action: 'create' },
    { module: 'sales', action: 'view' },
    { module: 'inventory', action: 'view' },
  ];

  const probedWorkspaces = wsRows.slice(0, 10);
  const probes: ResolverProbe[] = [];
  for (const ws of probedWorkspaces) {
    for (const cell of PROBE_GRID) {
      const decision = await app.resolver.resolve(actor, {
        organizationId: ws.organization_id as OrganizationId,
        workspaceId: ws.id as never,
        module: cell.module as never,
        action: cell.action as never,
      });
      probes.push({
        module: cell.module,
        action: cell.action,
        organizationId: ws.organization_id,
        workspaceId: ws.id,
        allowed: decision.allowed,
        source: decision.source,
        reason: decision.reason,
      });
    }
  }

  return {
    actor: {
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      effectiveRole: actor.effectiveRole,
      organizationId: actor.organizationId ?? null,
      isInternalManager: actor.isInternalManager,
      sessionId: actor.sessionId ?? null,
    },
    organizations: orgRows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      organizationStatus: r.organization_status,
    })),
    workspaces: wsRows.map((r) => ({
      id: r.id,
      workspaceName: r.workspace_name,
      organizationId: r.organization_id,
      organizationName: r.organization_name,
      workspaceStatus: r.workspace_status,
    })),
    resolverProbes: probes,
  };
}
