import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import type {
  ActorContext,
  ActorId,
  ActorKind,
  EffectiveRole,
  OrganizationId,
  SessionId,
  UserId,
} from '@xb/types';
import { UnauthenticatedError } from '@xb/auth';
import { verifyPassword } from '../lib/password.js';

export interface AuthenticatedSession {
  readonly token: string;
  readonly user: AuthenticatedUser;
}

export interface AuthenticatedUser {
  readonly userId: UserId;
  readonly actorId: ActorId;
  readonly actorKind: ActorKind;
  readonly effectiveRole: EffectiveRole;
  readonly organizationId: OrganizationId | null;
  readonly email: string;
  readonly displayName: string;
  readonly userKind: 'internal' | 'organization';
  readonly role: string | null;
  readonly isInternalManager: boolean;
}

interface UserRow {
  id: string;
  actor_id: string;
  user_kind: 'internal' | 'organization';
  organization_id: string | null;
  email: string;
  display_name: string;
  password_hash: string;
  user_status: 'active' | 'deactivated' | 'pending_invite';
  internal_user_role: 'manager' | 'staff' | null;
  organization_user_role: 'admin' | 'user' | null;
}

async function loadUserByEmail(app: FastifyInstance, email: string): Promise<UserRow | null> {
  const { rows } = await app.pg.query<UserRow>(
    `SELECT id, actor_id, user_kind, organization_id, email, display_name,
            password_hash, user_status, internal_user_role, organization_user_role
       FROM xb_core.users
      WHERE lower(email) = lower($1)
        AND deleted_at IS NULL
      LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

async function loadUserByActorId(app: FastifyInstance, actorId: string): Promise<UserRow | null> {
  const { rows } = await app.pg.query<UserRow>(
    `SELECT id, actor_id, user_kind, organization_id, email, display_name,
            password_hash, user_status, internal_user_role, organization_user_role
       FROM xb_core.users
      WHERE actor_id = $1
        AND deleted_at IS NULL
      LIMIT 1`,
    [actorId],
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
    email: row.email,
    displayName: row.display_name,
    userKind: row.user_kind,
    role: row.user_kind === 'internal' ? row.internal_user_role : row.organization_user_role,
    isInternalManager,
  };
}

export async function signIn(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<AuthenticatedSession> {
  const row = await loadUserByEmail(app, email);
  if (!row) {
    throw new UnauthenticatedError('invalid email or password');
  }
  if (row.user_status !== 'active') {
    throw new UnauthenticatedError(`account is ${row.user_status}`);
  }
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    throw new UnauthenticatedError('invalid email or password');
  }

  const user = toAuthenticatedUser(row);
  const sessionId = ulid() as SessionId;
  const token = await app.jwt.sign({
    sub: user.userId,
    ses: sessionId,
    act: user.actorId,
    kind: user.actorKind,
    role: user.effectiveRole,
    org: user.organizationId,
    mgr: user.isInternalManager,
  });

  app.pg
    .query('UPDATE xb_core.users SET last_login_at = now() WHERE id = $1', [user.userId])
    .catch((err) => app.log.warn({ err, userId: user.userId }, 'failed to update last_login_at'));

  return { token, user };
}

export async function loadCurrentUser(
  app: FastifyInstance,
  actor: ActorContext,
): Promise<AuthenticatedUser> {
  const row = await loadUserByActorId(app, actor.actorId);
  if (!row) {
    throw new UnauthenticatedError('user not found');
  }
  return toAuthenticatedUser(row);
}
