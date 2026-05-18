import type { Brand } from './brand.js';

export type Ulid = Brand<string, 'Ulid'>;

export type OrganizationId = Brand<Ulid, 'OrganizationId'>;
export type WorkspaceId = Brand<Ulid, 'WorkspaceId'>;
export type ActorId = Brand<Ulid, 'ActorId'>;
export type UserId = Brand<Ulid, 'UserId'>;
export type InternalUserId = Brand<Ulid, 'InternalUserId'>;
export type CustomerUserId = Brand<Ulid, 'CustomerUserId'>;
export type SessionId = Brand<Ulid, 'SessionId'>;
export type RequestId = Brand<Ulid, 'RequestId'>;
export type AuditId = Brand<Ulid, 'AuditId'>;
export type UploadId = Brand<Ulid, 'UploadId'>;
export type ReportId = Brand<Ulid, 'ReportId'>;
export type EngineRunId = Brand<Ulid, 'EngineRunId'>;
export type AiConversationId = Brand<Ulid, 'AiConversationId'>;
export type ApiKeyId = Brand<Ulid, 'ApiKeyId'>;
