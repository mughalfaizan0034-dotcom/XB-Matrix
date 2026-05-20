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
 *   internal_user / super_admin     → super_admin
 *   internal_user / manager         → internal_manager
 *   internal_user / staff           → internal_staff
 *   organization_user / admin       → organization_admin
 *   organization_user / user        → organization_user
 *   ai_agent (autonomous)           → ai_agent
 *   system (jobs, no user backing)  → system
 *
 * Role hierarchy (who can create whom):
 *   super_admin       — can create: any role (including other super_admins, internal_managers)
 *   internal_manager  — can create: internal_staff + organization_admin + organization_user
 *                       (NOT super_admin, NOT another internal_manager)
 *   organization_admin— can create: organization_admin + organization_user in OWN org
 *   others            — no user creation
 */
export const EFFECTIVE_ROLES = [
  'super_admin',
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
  /**
   * RLS + resolver bypass flag. TRUE for both super_admin AND
   * internal_manager — both tiers have wide platform access. The
   * difference between them is only the createUser authorization
   * (super_admin can create managers; manager cannot).
   *
   * For code that specifically needs the super_admin distinction
   * (e.g., creating other super_admins), check
   * effectiveRole === 'super_admin' explicitly.
   */
  readonly isInternalManager: boolean;
}
