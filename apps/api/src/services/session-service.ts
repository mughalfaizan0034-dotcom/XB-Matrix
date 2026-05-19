import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { ulid } from 'ulid';
import type { ActorId, OrganizationId, SessionId, UserId } from '@xb/types';

export interface SessionRow {
  readonly id: SessionId;
  readonly userId: UserId;
  readonly actorId: ActorId;
  readonly organizationId: OrganizationId | null;
  readonly activeWorkspaceId: string | null;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

interface RawSessionRow {
  id: string;
  user_id: string;
  actor_id: string;
  organization_id: string | null;
  active_workspace_id: string | null;
  expires_at: Date;
  revoked_at: Date | null;
}

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type RevokeReason =
  | 'sign_out'
  | 'password_reset'
  | 'admin_revoke'
  | 'expired'
  | 'security_event';

function toRow(r: RawSessionRow): SessionRow {
  return {
    id: r.id as SessionId,
    userId: r.user_id as UserId,
    actorId: r.actor_id as ActorId,
    organizationId: r.organization_id as OrganizationId | null,
    activeWorkspaceId: r.active_workspace_id,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
  };
}

/**
 * Create a session row. Caller (sign-in) embeds the returned `id` in the
 * JWT it signs into the cookie; every subsequent request looks the row
 * up to detect revocation.
 */
export async function createSession(
  app: FastifyInstance,
  client: PoolClient,
  input: {
    userId: UserId;
    actorId: ActorId;
    organizationId: OrganizationId | null;
    userAgent: string | null;
    ipAddress: string | null;
    ttlSeconds?: number;
  },
): Promise<SessionRow> {
  const id = ulid() as SessionId;
  const expiresAt = new Date(Date.now() + (input.ttlSeconds ?? SESSION_TTL_SECONDS) * 1000);
  await client.query(
    `INSERT INTO xb_core.sessions
       (id, user_id, actor_id, organization_id, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      input.userId,
      input.actorId,
      input.organizationId,
      input.userAgent?.slice(0, 500) ?? null,
      input.ipAddress ?? null,
      expiresAt,
    ],
  );
  const { rows } = await client.query<RawSessionRow>(
    `SELECT id, user_id, actor_id, organization_id, active_workspace_id,
            expires_at, revoked_at
       FROM xb_core.sessions
      WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw new Error('session vanished after insert');
  return toRow(rows[0]);
}

/**
 * Look up a session by id. Returns null when not found, expired, or
 * revoked. Hot-path lookup — Redis cache wraps this in
 * `app.session.cachedGet` below.
 */
export async function getSession(
  app: FastifyInstance,
  sessionId: string,
): Promise<SessionRow | null> {
  const { rows } = await app.pg.query<RawSessionRow>(
    `SELECT id, user_id, actor_id, organization_id, active_workspace_id,
            expires_at, revoked_at
       FROM xb_core.sessions
      WHERE id = $1
        AND revoked_at IS NULL
        AND expires_at > now()`,
    [sessionId],
  );
  return rows[0] ? toRow(rows[0]) : null;
}

/**
 * Revoke a single session (sign-out). Idempotent.
 */
export async function revokeSession(
  app: FastifyInstance,
  client: PoolClient,
  sessionId: string,
  reason: RevokeReason,
): Promise<void> {
  await client.query(
    `UPDATE xb_core.sessions
        SET revoked_at = now(), revoke_reason = $2
      WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId, reason],
  );
}

/**
 * Revoke every live session for a user. Used after password reset / admin
 * deactivation — anyone holding a stale cookie is immediately logged out.
 * Returns the number of sessions revoked.
 */
export async function revokeAllSessionsForUser(
  app: FastifyInstance,
  client: PoolClient,
  userId: string,
  reason: RevokeReason,
): Promise<number> {
  const result = await client.query(
    `UPDATE xb_core.sessions
        SET revoked_at = now(), revoke_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, reason],
  );
  return result.rowCount ?? 0;
}

/**
 * Update the active workspace for a session. Drives the workspace switcher.
 */
export async function setActiveWorkspace(
  app: FastifyInstance,
  client: PoolClient,
  sessionId: string,
  workspaceId: string | null,
): Promise<void> {
  await client.query(
    `UPDATE xb_core.sessions
        SET active_workspace_id = $2, last_seen_at = now()
      WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId, workspaceId],
  );
}

/**
 * Touch last_seen_at. Called best-effort by the auth-cookie hook so we
 * have a coarse signal for activity-based timeouts later. Throttled to
 * once per minute per session via Redis to avoid write amplification.
 */
export async function touchSession(
  app: FastifyInstance,
  sessionId: string,
): Promise<void> {
  try {
    if (app.redis.status === 'ready') {
      const key = `xb:sess:touch:${sessionId}`;
      const set = await app.redis.set(key, '1', 'EX', 60, 'NX');
      if (set !== 'OK') return; // already touched within the last 60s
    }
  } catch {
    // If Redis is down, just always write — it's a single UPDATE.
  }
  await app.pg
    .query(`UPDATE xb_core.sessions SET last_seen_at = now() WHERE id = $1`, [sessionId])
    .catch(() => undefined);
}
