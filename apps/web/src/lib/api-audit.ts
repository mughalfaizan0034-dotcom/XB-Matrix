'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

export interface AuditEntry {
  readonly id: string;
  readonly organizationId: string | null;
  readonly workspaceId: string | null;
  readonly actorId: string | null;
  readonly actorKind: string;
  readonly operation: string;
  readonly entityKind: string;
  readonly entityId: string | null;
  readonly occurredAt: string;
  readonly metadata: Record<string, unknown> | null;
}

export function useOrganizationAudit(orgId: string | null, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['audit', 'org', orgId],
    queryFn: () =>
      api
        .get<{ items: ReadonlyArray<AuditEntry> }>(`/v1/audit/organizations/${orgId}`)
        .then((r) => r.items),
    enabled: !!orgId && (opts.enabled ?? true),
    staleTime: 10_000,
  });
}

export function useWorkspaceAudit(wsId: string | null, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['audit', 'ws', wsId],
    queryFn: () =>
      api
        .get<{ items: ReadonlyArray<AuditEntry> }>(`/v1/audit/workspaces/${wsId}`)
        .then((r) => r.items),
    enabled: !!wsId && (opts.enabled ?? true),
    staleTime: 10_000,
  });
}
