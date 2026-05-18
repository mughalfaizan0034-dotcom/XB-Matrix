import type {
  ActorContext,
  ActorId,
  ActorKind,
  EffectiveRole,
  OrganizationId,
  RequestId,
  SessionId,
} from '@xb/types';

export interface Session {
  readonly sessionId: SessionId;
  readonly actorId: ActorId;
  readonly actorKind: ActorKind;
  readonly effectiveRole: EffectiveRole;
  readonly organizationId: OrganizationId | null;
  readonly isInternalManager: boolean;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface SessionStore {
  get(sessionId: SessionId): Promise<Session | null>;
  create(session: Session): Promise<void>;
  revoke(sessionId: SessionId): Promise<void>;
  revokeAllForActor(actorId: ActorId): Promise<void>;
}

export function toActorContext(session: Session, requestId: RequestId): ActorContext {
  return {
    actorId: session.actorId,
    actorKind: session.actorKind,
    effectiveRole: session.effectiveRole,
    organizationId: session.organizationId,
    sessionId: session.sessionId,
    requestId,
    isInternalManager: session.isInternalManager,
  };
}
