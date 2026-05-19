import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { ulid } from 'ulid';
import type { ActorContext } from '@xb/types';

export const TOKEN_TYPES = [
  'invitation',
  'email_verification',
  'password_reset',
  'email_change',
  'magic_link',
  'mfa_otp',
] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

/** Default TTLs in seconds; override per call via opts.ttlSeconds. */
const DEFAULT_TTL: Record<TokenType, number> = {
  invitation:         60 * 60 * 24 * 7,     // 7 days
  email_verification: 60 * 60 * 24,         // 24 hours
  password_reset:     60 * 60,              // 1 hour
  email_change:       60 * 60 * 2,          // 2 hours
  magic_link:         60 * 15,              // 15 minutes
  mfa_otp:            60 * 5,               // 5 minutes
};

export interface AuthTokenRow {
  id: string;
  token_type: TokenType;
  target_user_id: string | null;
  target_email: string;
  pending_payload: Record<string, unknown> | null;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

export interface MintOptions {
  readonly type: TokenType;
  readonly targetUserId: string | null;
  readonly targetEmail: string;
  readonly pendingPayload?: Record<string, unknown>;
  readonly ttlSeconds?: number;
  readonly createdByActorId?: string | null;
  readonly createdIp?: string | null;
  /**
   * If the caller is already inside a transaction (e.g., inviteUser just
   * inserted the user row and needs auth_tokens.target_user_id to see it
   * via the same snapshot), pass the open client so the INSERT shares the
   * outer tx instead of opening a new one that would FK-fail against
   * uncommitted rows.
   */
  readonly client?: PoolClient;
}

export interface MintResult {
  readonly token: string;        // raw token to share via URL (NEVER store)
  readonly tokenId: string;      // DB row id
  readonly expiresAt: string;    // ISO
}

export type VerifyResult =
  | { ok: true; record: AuthTokenRow }
  | { ok: false; reason: 'not_found' | 'expired' | 'consumed' | 'wrong_type' };

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Generate a cryptographically random token suitable for URL embedding.
 * 32 bytes → 256 bits of entropy → 43-char base64url. Concatenated with the
 * token id as a hex prefix would aid lookup, but we keep the token opaque
 * and rely on the hash unique index for O(log n) lookup.
 */
function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

const SELECT_TOKEN = `
  SELECT id, token_type, target_user_id, target_email, pending_payload,
         expires_at, consumed_at, created_at
    FROM xb_core.auth_tokens
`;

/**
 * Mint a one-time-use token. Returns the raw token to the caller; only the
 * sha-256 hex of the token lives in the DB. Caller is responsible for
 * delivering the raw token to the recipient (typically via email).
 */
export async function mintToken(
  app: FastifyInstance,
  actor: ActorContext | null,
  opts: MintOptions,
): Promise<MintResult> {
  const token = generateRawToken();
  const tokenHash = sha256Hex(token);
  const tokenId = ulid();
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL[opts.type];
  const expiresAt = new Date(Date.now() + ttl * 1000);
  const createdByActorId = opts.createdByActorId ?? actor?.actorId ?? null;

  const insert = async (client: PoolClient): Promise<void> => {
    await client.query(
      `INSERT INTO xb_core.auth_tokens
         (id, token_type, token_hash, target_user_id, target_email, pending_payload,
          expires_at, created_by_actor_id, created_ip)
       VALUES ($1, $2, $3, $4, lower($5), $6, $7, $8, $9)`,
      [
        tokenId,
        opts.type,
        tokenHash,
        opts.targetUserId,
        opts.targetEmail,
        opts.pendingPayload ? JSON.stringify(opts.pendingPayload) : null,
        expiresAt,
        createdByActorId,
        opts.createdIp ?? null,
      ],
    );
  };

  if (opts.client) {
    await insert(opts.client);
  } else {
    await withMaybeContext(app, actor, insert);
  }

  return { token, tokenId, expiresAt: expiresAt.toISOString() };
}

/**
 * Look up a token by raw value. Does not consume — call `consumeToken` to
 * mark used. Verifies type to prevent cross-type misuse (an invitation
 * token presented to /reset-password is "wrong_type", not "not_found",
 * for clearer diagnostics in dev logs without leaking to users).
 */
export async function verifyToken(
  app: FastifyInstance,
  type: TokenType,
  token: string,
): Promise<VerifyResult> {
  const tokenHash = sha256Hex(token);
  const { rows } = await app.pg.query<AuthTokenRow>(
    `${SELECT_TOKEN} WHERE token_hash = $1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.token_type !== type) return { ok: false, reason: 'wrong_type' };
  if (row.consumed_at) return { ok: false, reason: 'consumed' };
  if (row.expires_at <= new Date()) return { ok: false, reason: 'expired' };
  return { ok: true, record: row };
}

/**
 * Mark a token consumed. Returns the row. Idempotent within a single tx —
 * an attempt to consume an already-consumed token from a parallel request
 * returns null (caller treats as "wrong/expired" to the user).
 */
export async function consumeToken(
  app: FastifyInstance,
  client: PoolClient,
  type: TokenType,
  token: string,
  consumedByActorId: string | null,
): Promise<AuthTokenRow | null> {
  const tokenHash = sha256Hex(token);
  const { rows } = await client.query<AuthTokenRow>(
    `UPDATE xb_core.auth_tokens
        SET consumed_at = now(),
            consumed_by_actor_id = $3
      WHERE token_hash = $1
        AND token_type = $2
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING id, token_type, target_user_id, target_email, pending_payload,
                expires_at, consumed_at, created_at`,
    [tokenHash, type, consumedByActorId],
  );
  return rows[0] ?? null;
}

/**
 * Revoke all live tokens of a given type for a user (e.g., issuing a new
 * password reset invalidates any pending one). Returns count revoked.
 */
export async function revokeUserTokens(
  app: FastifyInstance,
  client: PoolClient,
  userId: string,
  type: TokenType,
): Promise<number> {
  const result = await client.query(
    `UPDATE xb_core.auth_tokens
        SET consumed_at = now()
      WHERE target_user_id = $1
        AND token_type = $2
        AND consumed_at IS NULL`,
    [userId, type],
  );
  return result.rowCount ?? 0;
}

/**
 * If the caller has actor context, run inside a tx with that context set so
 * the audit trigger captures actor. Otherwise (public flows: token mint
 * happens after forgot-password request, no logged-in user), use the pool
 * directly and rely on the system actor context already in place.
 */
async function withMaybeContext<T>(
  app: FastifyInstance,
  actor: ActorContext | null,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (actor) return app.withConnection(actor, work);
  const client = await app.pg.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_actor_kind', 'system', true)");
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
