import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { ulid } from 'ulid';
import type { ActorContext, ActorId, OrganizationId } from '@xb/types';
import { ForbiddenError } from '@xb/auth';
import { hashPassword } from '../lib/password.js';
import {
  ConflictError,
  NotFoundError,
  SemanticError,
} from '../lib/errors.js';
import {
  consumeToken,
  mintToken,
  revokeUserTokens,
  verifyToken,
} from './token-service.js';
import { createSession } from './session-service.js';
import { invitationEmail } from '../email/templates.js';

export type InviteRole =
  | 'internal_manager'
  | 'internal_staff'
  | 'organization_admin'
  | 'organization_user';

export interface InviteUserInput {
  readonly email: string;
  readonly displayName: string;
  readonly role: InviteRole;
  /** required for organization_* roles; ignored for internal_* */
  readonly organizationId?: OrganizationId | null;
}

export interface InvitationView {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  readonly role: InviteRole;
  readonly expiresAt: string;
  readonly acceptUrl: string;
}

const PUBLIC_WEB_BASE =
  process.env.PUBLIC_WEB_BASE_URL ??
  'https://mughalfaizan0034-dotcom.github.io/XB-Matrix';

function isInternal(role: InviteRole): boolean {
  return role === 'internal_manager' || role === 'internal_staff';
}

function buildAcceptUrl(token: string): string {
  return `${PUBLIC_WEB_BASE}/accept-invite/${encodeURIComponent(token)}/`;
}

/**
 * Authorization for inviting:
 *   - internal_manager: invite anyone (any role, any org)
 *   - organization_admin: invite organization_admin or organization_user in OWN org
 *   - others: cannot invite
 */
function assertCanInvite(actor: ActorContext, role: InviteRole, organizationId: string | null): void {
  if (actor.isInternalManager) return;
  if (actor.effectiveRole === 'organization_admin') {
    if (role !== 'organization_admin' && role !== 'organization_user') {
      throw new ForbiddenError('only internal managers can invite internal users', 'role_scope');
    }
    if (organizationId !== actor.organizationId) {
      throw new ForbiddenError('cannot invite users to another organization', 'org_scope');
    }
    return;
  }
  throw new ForbiddenError('only managers and org admins can invite users', 'not_authorized');
}

/**
 * Create a pending_invite user + an invitation token + send the invitation
 * email. The user row is the durable identity; the token is the one-time
 * grant of "I am this user and I have the email I claim".
 *
 * The password_hash is set to a never-matching sentinel. accept-invite
 * replaces it with a real scrypt hash when the recipient sets their password.
 */
export async function inviteUser(
  app: FastifyInstance,
  actor: ActorContext,
  input: InviteUserInput,
): Promise<InvitationView> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!email || !displayName) {
    throw new SemanticError('Email and display name are required.', 'invalid_input');
  }
  const orgId = isInternal(input.role) ? null : input.organizationId ?? actor.organizationId ?? null;
  if (!isInternal(input.role) && !orgId) {
    throw new SemanticError(
      'organization_admin and organization_user invites require an organizationId.',
      'invalid_input',
    );
  }
  assertCanInvite(actor, input.role, orgId);

  // Sentinel password hash that verifyPassword cannot ever match — the
  // hex random fills the key region with junk; format conforms to the
  // scrypt$1$<salt>$<key> shape so verify() decodes it without throwing.
  const sentinel = `scrypt$1$${randomBytes(16).toString('hex')}$${randomBytes(64).toString('hex')}`;

  const userId = ulid();
  const actorId = ulid();
  const username = email;

  try {
    return await app.withConnection(actor, async (client) => {
      // Org exists check
      let organizationName: string | null = null;
      if (orgId) {
        const { rows: orgRows } = await client.query<{ display_name: string; organization_status: string }>(
          `SELECT display_name, organization_status FROM xb_core.organizations WHERE id = $1 AND deleted_at IS NULL`,
          [orgId],
        );
        const org = orgRows[0];
        if (!org) throw new NotFoundError('organization', orgId);
        if (org.organization_status !== 'active') {
          throw new SemanticError(
            `Cannot invite users to a ${org.organization_status} organization. Reactivate first.`,
            'parent_org_not_active',
          );
        }
        organizationName = org.display_name;
      }

      // Create the actor first (users.actor_id has FK).
      await client.query(
        `INSERT INTO xb_core.actors
           (id, organization_id, actor_kind, display_name, actor_status, created_by_actor_id)
         VALUES ($1, $2, $3, $4, 'active', $5)`,
        [
          actorId,
          orgId,
          isInternal(input.role) ? 'internal_user' : 'organization_user',
          displayName,
          actor.actorId,
        ],
      );

      // Then the user, pending_invite.
      await client.query(
        `INSERT INTO xb_core.users
           (id, actor_id, user_kind, organization_id, username, display_name, email,
            password_hash, internal_user_role, organization_user_role,
            user_status, created_by_actor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending_invite', $11)`,
        [
          userId,
          actorId,
          isInternal(input.role) ? 'internal' : 'organization',
          orgId,
          username,
          displayName,
          email,
          sentinel,
          isInternal(input.role)
            ? input.role === 'internal_manager'
              ? 'manager'
              : 'staff'
            : null,
          isInternal(input.role)
            ? null
            : input.role === 'organization_admin'
              ? 'admin'
              : 'user',
          actor.actorId,
        ],
      );

      const { token, expiresAt } = await mintToken(app, actor, {
        type: 'invitation',
        targetUserId: userId,
        targetEmail: email,
        createdByActorId: actor.actorId,
      });

      const acceptUrl = buildAcceptUrl(token);
      const msg = invitationEmail({
        displayName,
        inviterDisplayName: 'Your team', // resolver will improve when we look up the inviter's display name
        organizationName,
        acceptUrl,
        expiresAt: new Date(expiresAt).toUTCString(),
      });
      app.email
        .send({ to: email, subject: msg.subject, html: msg.html, text: msg.text, tags: ['invitation'] })
        .catch((err) => app.log.error({ err }, 'failed to send invitation email'));

      return {
        userId,
        email,
        displayName,
        organizationId: orgId,
        organizationName,
        role: input.role,
        expiresAt,
        acceptUrl,
      };
    });
  } catch (err) {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr.constraint === 'uq_users_email') {
      throw new ConflictError(
        `A user with the email "${email}" already exists.`,
        'user_exists',
      );
    }
    throw err;
  }
}

export interface AcceptInvitationInput {
  readonly token: string;
  readonly password: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
}

/**
 * Accept an invitation: consume the token, set the real password, mark the
 * user active + email_verified, and create the first session in one tx.
 * Returns the new session so the route can issue the cookie immediately
 * (the user lands on the dashboard signed in).
 */
export async function acceptInvitation(
  app: FastifyInstance,
  input: AcceptInvitationInput,
): Promise<{
  sessionId: string;
  jwt: string;
  userId: string;
  displayName: string;
  email: string;
}> {
  if (input.password.length < 12) {
    throw new SemanticError('Password must be at least 12 characters.', 'weak_password');
  }
  const verify = await verifyToken(app, 'invitation', input.token);
  if (!verify.ok) {
    throw new SemanticError(
      verify.reason === 'expired'
        ? 'This invitation has expired. Ask the inviter to resend it.'
        : verify.reason === 'consumed'
          ? 'This invitation has already been used.'
          : 'Invalid or expired invitation.',
      'invalid_token',
    );
  }
  const record = verify.record;
  if (!record.target_user_id) {
    throw new SemanticError('Invitation is not bound to a user.', 'invalid_token');
  }

  const hash = await hashPassword(input.password);

  const client = await app.pg.connect();
  try {
    await client.query('BEGIN');

    // Load the pending user row inside the tx.
    const { rows: userRows } = await client.query<{
      id: string;
      actor_id: string;
      user_kind: 'internal' | 'organization';
      organization_id: string | null;
      email: string;
      display_name: string;
      user_status: 'active' | 'deactivated' | 'pending_invite';
      internal_user_role: 'manager' | 'staff' | null;
      organization_user_role: 'admin' | 'user' | null;
    }>(
      `SELECT id, actor_id, user_kind, organization_id, email, display_name,
              user_status, internal_user_role, organization_user_role
         FROM xb_core.users WHERE id = $1 AND deleted_at IS NULL`,
      [record.target_user_id],
    );
    const user = userRows[0];
    if (!user) throw new NotFoundError('user', record.target_user_id);
    if (user.user_status === 'deactivated') {
      throw new SemanticError('This account has been deactivated.', 'deactivated');
    }
    // Allow re-accept if status is still pending_invite. If already active,
    // their account exists — they should sign in instead.
    if (user.user_status === 'active') {
      throw new SemanticError(
        'This invitation was already accepted. Sign in with your email and password.',
        'already_accepted',
      );
    }

    // Connection context for audit + RLS.
    await client.query("SELECT set_config('app.current_actor_id', $1, true)", [user.actor_id]);
    await client.query("SELECT set_config('app.current_actor_kind', $1, true)", [
      user.user_kind === 'internal' ? 'internal_user' : 'organization_user',
    ]);
    if (user.organization_id) {
      await client.query("SELECT set_config('app.current_organization_id', $1, true)", [
        user.organization_id,
      ]);
    }

    const consumed = await consumeToken(app, client, 'invitation', input.token, user.actor_id);
    if (!consumed) {
      throw new SemanticError('This invitation was just used.', 'invalid_token');
    }

    await client.query(
      `UPDATE xb_core.users
          SET user_status = 'active',
              password_hash = $2,
              password_changed_at = now(),
              email_verified_at = now()
        WHERE id = $1`,
      [user.id, hash],
    );

    const session = await createSession(app, client, {
      userId: user.id as ActorId as never,
      actorId: user.actor_id as ActorId,
      organizationId: (user.organization_id ?? null) as OrganizationId | null,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });

    await client.query('COMMIT');

    const effectiveRole =
      user.user_kind === 'internal'
        ? user.internal_user_role === 'manager'
          ? 'internal_manager'
          : 'internal_staff'
        : user.organization_user_role === 'admin'
          ? 'organization_admin'
          : 'organization_user';
    const isInternalManager = effectiveRole === 'internal_manager';
    const jwt = await app.jwt.sign({
      sub: user.id,
      ses: session.id,
      act: user.actor_id,
      kind: user.user_kind === 'internal' ? 'internal_user' : 'organization_user',
      role: effectiveRole,
      org: user.organization_id,
      mgr: isInternalManager,
    });

    return {
      sessionId: session.id,
      jwt,
      userId: user.id,
      displayName: user.display_name,
      email: user.email,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Re-mint an invitation token (e.g. the previous one expired or was lost).
 * Revokes any outstanding invitation tokens for the user and sends a fresh
 * email with a new link.
 */
export async function resendInvitation(
  app: FastifyInstance,
  actor: ActorContext,
  userId: string,
): Promise<InvitationView> {
  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{
      id: string;
      email: string;
      display_name: string;
      user_kind: 'internal' | 'organization';
      organization_id: string | null;
      user_status: string;
      internal_user_role: 'manager' | 'staff' | null;
      organization_user_role: 'admin' | 'user' | null;
    }>(
      `SELECT id, email, display_name, user_kind, organization_id, user_status,
              internal_user_role, organization_user_role
         FROM xb_core.users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const u = rows[0];
    if (!u) throw new NotFoundError('user', userId);
    if (u.user_status !== 'pending_invite') {
      throw new SemanticError(
        'Only pending invitations can be resent. This user is already active.',
        'not_pending',
      );
    }
    const role: InviteRole =
      u.user_kind === 'internal'
        ? u.internal_user_role === 'manager'
          ? 'internal_manager'
          : 'internal_staff'
        : u.organization_user_role === 'admin'
          ? 'organization_admin'
          : 'organization_user';
    assertCanInvite(actor, role, u.organization_id);

    await revokeUserTokens(app, client, u.id, 'invitation');
    const { token, expiresAt } = await mintToken(app, actor, {
      type: 'invitation',
      targetUserId: u.id,
      targetEmail: u.email,
      createdByActorId: actor.actorId,
    });

    let organizationName: string | null = null;
    if (u.organization_id) {
      const { rows: orgRows } = await client.query<{ display_name: string }>(
        `SELECT display_name FROM xb_core.organizations WHERE id = $1`,
        [u.organization_id],
      );
      organizationName = orgRows[0]?.display_name ?? null;
    }

    const acceptUrl = buildAcceptUrl(token);
    const msg = invitationEmail({
      displayName: u.display_name,
      inviterDisplayName: 'Your team',
      organizationName,
      acceptUrl,
      expiresAt: new Date(expiresAt).toUTCString(),
    });
    app.email
      .send({ to: u.email, subject: msg.subject, html: msg.html, text: msg.text, tags: ['invitation-resend'] })
      .catch((err) => app.log.error({ err }, 'failed to resend invitation email'));

    return {
      userId: u.id,
      email: u.email,
      displayName: u.display_name,
      organizationId: u.organization_id,
      organizationName,
      role,
      expiresAt,
      acceptUrl,
    };
  });
}

/**
 * Revoke an outstanding invitation: marks the pending user soft-deleted
 * and invalidates all invitation tokens.
 */
export async function revokeInvitation(
  app: FastifyInstance,
  actor: ActorContext,
  userId: string,
): Promise<void> {
  await app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{
      id: string;
      user_status: string;
      organization_id: string | null;
    }>(
      `SELECT id, user_status, organization_id
         FROM xb_core.users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const u = rows[0];
    if (!u) throw new NotFoundError('user', userId);
    if (u.user_status !== 'pending_invite') {
      throw new SemanticError(
        'Only pending invitations can be revoked. Use deactivate for active users.',
        'not_pending',
      );
    }
    assertCanInvite(actor, 'organization_user', u.organization_id);

    await revokeUserTokens(app, client, u.id, 'invitation');
    await client.query(
      `UPDATE xb_core.users SET deleted_at = now(), deleted_by_actor_id = $2 WHERE id = $1`,
      [u.id, actor.actorId],
    );
  });
}
