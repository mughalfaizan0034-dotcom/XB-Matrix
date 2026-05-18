import type { ActorId, OrganizationId, RequestId, SessionId } from './ids.js';

export const ACTOR_KINDS = [
  'internal_manager',
  'internal_staff',
  'organization_admin',
  'organization_user',
  'ai_agent',
  'system',
] as const;

export type ActorKind = (typeof ACTOR_KINDS)[number];

export interface ActorContext {
  readonly actorId: ActorId;
  readonly actorKind: ActorKind;
  readonly organizationId: OrganizationId | null;
  readonly sessionId: SessionId | null;
  readonly requestId: RequestId;
  readonly isInternalManager: boolean;
}
