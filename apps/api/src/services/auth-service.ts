import type { FastifyInstance } from 'fastify';
import type {
  ActorContext,
  ActorId,
  ActorKind,
  EffectiveRole,
  OrganizationId,
  UserId,
} from '@xb/types';
import { UnauthenticatedError } from '@xb/auth';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { NotFoundError, SemanticError } from '../lib/errors.js';
import {
  createSession,
  revokeAllSessionsForUser,
  revokeSession,
  type RevokeReason,
} from './session-service.js';
import {
  consumeToken,
  mintToken,
  revokeUserTokens,
  verifyToken,
} from './token-service.js';
import {
  emailVerificationEmail,
  passwordResetEmail,
} from '../email/templates.js';

export interface AuthenticatedSession {
  readonly token: string;
  readonly user: AuthenticatedUser;
  readonly sessionId: string;
}

export interface AuthenticatedUser {
  readonly userId: UserId;
  readonly actorId: ActorId;
  readonly actorKind: ActorKind;
  readonly effectiveRole: EffectiveRole;
  readonly organizationId: OrganizationId | null;
  readonly username: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly userKind: 'internal' | 'organization';
  readonly role: string | null;
  readonly isInternalManager: boolean;
  readonly emailVerifiedAt: string | null;
}

interface UserRow {
  id: string;
  actor_id: string;
  user_kind: 'internal' | 'organization';
  organization_id: string | null;
  username: string;
  email: string | null;
  display_name: string;
  password_hash: string;
  user_status: 'active' | 'deactivated' | 'pending_invite';
  internal_user_role: 'manager' | 'staff' | null;
  organization_user_role: 'admin' | 'user' | null;
  email_verified_at: Date | null;
}

const SELECT_USER = `
  SELECT id, actor_id, user_kind, organization_id, username, email, display_name,
         password_hash, user_status, internal_user_role, organization_user_role,
         email_verified_at
    FROM xb_core.users
`;

async function loadUserByEmail(app: FastifyInstance, email: string): Promise<UserRow | null> {
  const { rows } = await app.pg.query<UserRow>(
    `${SELECT_USER} WHERE lower(email) = lower($1) AND deleted_at IS NULL LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

/**
 * Username-first lookup for sign-in (2026-05-20 auth pivot).
 * Username has its own unique index, so we never fall back to email
 * here — username is the identity until email infrastructure ships.
 */
async function loadUserByUsername(app: FastifyInstance, username: string): Promise<UserRow | null> {
  const { rows } = await app.pg.query<UserRow>(
    `${SELECT_USER} WHERE lower(username) = lower($1) AND deleted_at IS NULL LIMIT 1`,
    [username],
  );
  return rows[0] ?? null;
}

async function loadUserByActorId(app: FastifyInstance, actorId: string): Promise<UserRow | null> {
  const { rows } = await app.pg.query<UserRow>(
    `${SELECT_USER} WHERE actor_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [actorId],
  );
  return rows[0] ?? null;
}

async function loadUserById(app: FastifyInstance, userId: string): Promise<UserRow | null> {
  const { rows } = await app.pg.query<UserRow>(
    `${SELECT_USER} WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

function computeEffectiveRole(row: UserRow): EffectiveRole {
  if (row.user_kind === 'internal') {
    return row.internal_user_role === 'manager' ? 'internal_manager' : 'internal_staff';
  }
  return row.organization_user_role === 'admin' ? 'organization_admin' : 'organization_user';
}

function toAuthenticatedUser(row: UserRow): AuthenticatedUser {
  const effectiveRole = computeEffectiveRole(row);
  const isInternalManager = effectiveRole === 'internal_manager';
  return {
    userId: row.id as UserId,
    actorId: row.actor_id as ActorId,
    actorKind: row.user_kind === 'internal' ? 'internal_user' : 'organization_user',
    effectiveRole,
    organizationId: (row.organization_id ?? null) as OrganizationId | null,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    userKind: row.user_kind,
    role: row.user_kind === 'internal' ? row.internal_user_role : row.organization_user_role,
    isInternalManager,
    emailVerifiedAt: row.email_verified_at ? row.email_verified_at.toISOString() : null,
  };
}

/**
 * Sign in: verify password, persist a session row, sign JWT with session id.
 * The session id is what makes server-side revocation possible (sign-out,
 * password reset cascade, admin revoke).
 *
 * Identity: username (2026-05-20 auth pivot). Email-based sign-in
 * returns once resend.com is wired up.
 *
 * rememberDevice: when true, the session row is created with a 30-day
 * TTL instead of the default 7-day. Lets operators stay signed in
 * across browser restarts without re-auth pressure.
 */
const REMEMBER_DEVICE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function signIn(
  app: FastifyInstance,
  username: string,
  password: string,
  meta: {
    userAgent: string | null;
    ipAddress: string | null;
    rememberDevice?: boolean;
  },
): Promise<AuthenticatedSession> {
  const row = await loadUserByUsername(app, username);
  // Constant-ish error for both "no such user" and "wrong password" so
  // we don't leak which usernames exist.
  if (!row) throw new UnauthenticatedError('invalid username or password');
  if (row.user_status === 'deactivated') {
    throw new UnauthenticatedError('account is deactivated');
  }
  if (row.user_status === 'pending_invite') {
    throw new UnauthenticatedError('account is not yet activated — ask an administrator to set your password');
  }
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) throw new UnauthenticatedError('invalid username or password');

  const user = toAuthenticatedUser(row);

  const client = await app.pg.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_actor_id', $1, true)", [user.actorId]);
    await client.query("SELECT set_config('app.current_actor_kind', $1, true)", [user.actorKind]);
    if (user.organizationId) {
      await client.query("SELECT set_config('app.current_organization_id', $1, true)", [
        user.organizationId,
      ]);
    }
    const session = await createSession(app, client, {
      userId: user.userId,
      actorId: user.actorId,
      organizationId: user.organizationId,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      ttlSeconds: meta.rememberDevice ? REMEMBER_DEVICE_TTL_SECONDS : undefined,
    });
    await client.query('COMMIT');

    const token = await app.jwt.sign({
      sub: user.userId,
      ses: session.id,
      act: user.actorId,
      kind: user.actorKind,
      role: user.effectiveRole,
      org: user.organizationId,
      mgr: user.isInternalManager,
    });

    app.pg
      .query('UPDATE xb_core.users SET last_login_at = now() WHERE id = $1', [user.userId])
      .catch((err) => app.log.warn({ err }, 'failed to update last_login_at'));

    return { token, user, sessionId: session.id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Sign out: revoke the session row so a stolen cookie stops working
 * platform-wide, then clear the cookie at the route layer.
 */
export async function signOut(
  app: FastifyInstance,
  actor: ActorContext,
  reason: RevokeReason = 'sign_out',
): Promise<void> {
  if (!actor.sessionId) return;
  await app.withConnection(actor, async (client) => {
    await revokeSession(app, client, actor.sessionId!, reason);
  });
}

export async function loadCurrentUser(
  app: FastifyInstance,
  actor: ActorContext,
): Promise<AuthenticatedUser> {
  const row = await loadUserByActorId(app, actor.actorId);
  if (!row) throw new UnauthenticatedError('user not found');
  return toAuthenticatedUser(row);
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

const PUBLIC_WEB_BASE =
  process.env.PUBLIC_WEB_BASE_URL ??
  'https://mughalfaizan0034-dotcom.github.io/XB-Matrix';

/**
 * Request a password reset email. ALWAYS returns success — never reveal
 * whether the email is registered (account enumeration prevention).
 *
 * Rate-limiting happens in the route handler (per email + per IP).
 */
export async function requestPasswordReset(
  app: FastifyInstance,
  email: string,
  ip: string | null,
): Promise<void> {
  const row = await loadUserByEmail(app, email);
  if (!row) {
    app.log.info({ email }, 'password reset requested for unknown email — silently dropping');
    return;
  }
  if (row.user_status !== 'active') {
    app.log.info({ userId: row.id, status: row.user_status }, 'password reset requested for non-active user — dropping');
    return;
  }
  if (!row.email) {
    // Username-only users (post auth pivot) don't have an email; the
    // admin password-reset endpoint on /v1/users/:id/reset-password
    // is the recovery path until email infrastructure ships.
    app.log.info({ userId: row.id }, 'password reset requested for user without email — dropping');
    return;
  }

  await app.withConnection(
    {
      actorId: row.actor_id as ActorId,
      actorKind: row.user_kind === 'internal' ? 'internal_user' : 'organization_user',
      effectiveRole: computeEffectiveRole(row),
      organizationId: (row.organization_id ?? null) as OrganizationId | null,
      sessionId: null,
      requestId: 'system' as ActorContext['requestId'],
      isInternalManager: false,
    },
    async (client) => {
      // Invalidate any prior live password reset tokens for this user.
      await revokeUserTokens(app, client, row.id, 'password_reset');
    },
  );

  const { token, expiresAt } = await mintToken(app, null, {
    type: 'password_reset',
    targetUserId: row.id,
    targetEmail: row.email,
    createdIp: ip,
  });

  const url = `${PUBLIC_WEB_BASE}/reset-password/?token=${encodeURIComponent(token)}`;
  const msg = passwordResetEmail({
    displayName: row.display_name,
    resetUrl: url,
    expiresAt: new Date(expiresAt).toUTCString(),
    requestIp: ip,
  });
  await app.email
    .send({ to: row.email, subject: msg.subject, html: msg.html, text: msg.text, tags: ['password-reset'] })
    .catch((err) => app.log.error({ err }, 'failed to send password reset email'));
}

/**
 * Complete password reset. Verify token, set new password, revoke all
 * sessions (so any other devices are logged out immediately), revoke
 * remaining password-reset tokens.
 */
export async function completePasswordReset(
  app: FastifyInstance,
  token: string,
  newPassword: string,
): Promise<{ userId: string; revokedSessions: number }> {
  const verify = await verifyToken(app, 'password_reset', token);
  if (!verify.ok) {
    throw new SemanticError(
      verify.reason === 'expired'
        ? 'This password reset link has expired. Request a new one.'
        : verify.reason === 'consumed'
          ? 'This password reset link has already been used.'
          : 'Invalid or expired password reset link.',
      'invalid_token',
    );
  }
  const record = verify.record;
  if (!record.target_user_id) {
    throw new SemanticError('Reset link is not bound to a user.', 'invalid_token');
  }
  const user = await loadUserById(app, record.target_user_id);
  if (!user) throw new NotFoundError('user', record.target_user_id);

  const hash = await hashPassword(newPassword);

  const client = await app.pg.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_actor_id', $1, true)", [user.actor_id]);
    await client.query("SELECT set_config('app.current_actor_kind', $1, true)", [
      user.user_kind === 'internal' ? 'internal_user' : 'organization_user',
    ]);
    if (user.organization_id) {
      await client.query("SELECT set_config('app.current_organization_id', $1, true)", [
        user.organization_id,
      ]);
    }

    const consumed = await consumeToken(app, client, 'password_reset', token, user.actor_id);
    if (!consumed) {
      // Race: another request consumed the same token between verify and now.
      throw new SemanticError('This reset link was just used.', 'invalid_token');
    }

    await client.query(
      `UPDATE xb_core.users
          SET password_hash = $1,
              password_changed_at = now()
        WHERE id = $2`,
      [hash, user.id],
    );

    const revokedSessions = await revokeAllSessionsForUser(app, client, user.id, 'password_reset');
    // Also revoke any other live password reset tokens for this user.
    await revokeUserTokens(app, client, user.id, 'password_reset');

    await client.query('COMMIT');
    return { userId: user.id, revokedSessions };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

export async function requestEmailVerification(
  app: FastifyInstance,
  user: AuthenticatedUser,
): Promise<void> {
  if (user.emailVerifiedAt) return;
  if (!user.email) return;  // username-only user, no email to verify

  await app.withConnection(
    {
      actorId: user.actorId,
      actorKind: user.actorKind,
      effectiveRole: user.effectiveRole,
      organizationId: user.organizationId,
      sessionId: null,
      requestId: 'system' as ActorContext['requestId'],
      isInternalManager: user.isInternalManager,
    },
    async (client) => {
      await revokeUserTokens(app, client, user.userId, 'email_verification');
    },
  );

  const { token, expiresAt } = await mintToken(app, null, {
    type: 'email_verification',
    targetUserId: user.userId,
    targetEmail: user.email,
    createdByActorId: user.actorId,
  });
  const url = `${PUBLIC_WEB_BASE}/verify-email/?token=${encodeURIComponent(token)}`;
  const msg = emailVerificationEmail({
    displayName: user.displayName,
    verifyUrl: url,
    expiresAt: new Date(expiresAt).toUTCString(),
  });
  await app.email
    .send({ to: user.email, subject: msg.subject, html: msg.html, text: msg.text, tags: ['verify-email'] })
    .catch((err) => app.log.error({ err }, 'failed to send verification email'));
}

export async function consumeEmailVerification(
  app: FastifyInstance,
  token: string,
): Promise<{ userId: string }> {
  const verify = await verifyToken(app, 'email_verification', token);
  if (!verify.ok) {
    throw new SemanticError(
      verify.reason === 'expired'
        ? 'This verification link has expired. Request a new one from your settings.'
        : 'Invalid or expired verification link.',
      'invalid_token',
    );
  }
  const record = verify.record;
  if (!record.target_user_id) {
    throw new SemanticError('Verification link is not bound to a user.', 'invalid_token');
  }
  const user = await loadUserById(app, record.target_user_id);
  if (!user) throw new NotFoundError('user', record.target_user_id);

  const client = await app.pg.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_actor_id', $1, true)", [user.actor_id]);
    await client.query("SELECT set_config('app.current_actor_kind', $1, true)", [
      user.user_kind === 'internal' ? 'internal_user' : 'organization_user',
    ]);
    const consumed = await consumeToken(app, client, 'email_verification', token, user.actor_id);
    if (!consumed) {
      throw new SemanticError('This verification link was just used.', 'invalid_token');
    }
    await client.query(`UPDATE xb_core.users SET email_verified_at = now() WHERE id = $1`, [user.id]);
    await client.query('COMMIT');
    return { userId: user.id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
