import type { ActorId, OrganizationId, RequestId, SessionId } from './ids.js';

/**
 * Actor kind — matches Spec 3 §10.2 `actor_kind` constraint and
 * `xb_audit.audit_log.actor_kind` CHECK. Written to the DB by the audit
 * trigger via `app.current_actor_kind`.
 */
export const ACTOR_KINDS = [
  'internal_user',
  'organization_user',
  'api_key',
  'system_job',
  'connector',
  'ai_agent',
  'system',
] as const;

export type ActorKind = (typeof ACTOR_KINDS)[number];

/**
 * Effective role — granular role used by the authorization resolver.
 * Derived from `user.user_kind` + (`internal_user_role` | `organization_user_role`)
 * at sign-in time.
 *
 *   internal_user / manager         → internal_manager
 *   internal_user / staff           → internal_staff
 *   organization_user / admin       → organization_admin
 *   organization_user / user        → organization_user
 *   ai_agent (autonomous)           → ai_agent
 *   system (jobs, no user backing)  → system
 */
export const EFFECTIVE_ROLES = [
  'internal_manager',
  'internal_staff',
  'organization_admin',
  'organization_user',
  'ai_agent',
  'system',
] as const;

export type EffectiveRole = (typeof EFFECTIVE_ROLES)[number];

export interface ActorContext {
  readonly actorId: ActorId;
  readonly actorKind: ActorKind;
  readonly effectiveRole: EffectiveRole;
  readonly organizationId: OrganizationId | null;
  readonly sessionId: SessionId | null;
  readonly requestId: RequestId;
  readonly isInternalManager: boolean;
}
