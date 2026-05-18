import type {
  ActorContext,
  ActorId,
  ActorKind,
  OrganizationId,
  SessionId,
} from '@xb/types';

export interface Session {
  readonly sessionId: SessionId;
  readonly actorId: ActorId;
  readonly actorKind: ActorKind;
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

export function toActorContext(
  session: Session,
  requestId: ActorContext['requestId'],
): ActorContext {
  return {
    actorId: session.actorId,
    actorKind: session.actorKind,
    organizationId: session.organizationId,
    sessionId: session.sessionId,
    requestId,
    isInternalManager: session.isInternalManager,
  };
}
