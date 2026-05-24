'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from './session';
import { api } from './api-client';

/**
 * Recycle bin client. Surfaces the 30-day grace window for soft-deleted
 * users / orgs / workspaces to internal managers + super admin (the
 * backend enforces requirePlatformAdmin on every endpoint; the UI just
 * avoids dead surfaces for non-eligible roles).
 *
 * Lifecycle reads (project_deletion_lifecycle):
 *   deleted_at    when the soft-delete happened
 *   deleted_by    display name of the actor who did it (null = system)
 *   purge_at      when the cron will hard-delete (30 days after delete)
 *   days_remaining floored whole days until purge
 *
 * Canonical action vocabulary stays consistent across surfaces:
 *   Restore               -> POST /recycle-bin/:kind/:id/restore
 *   Permanently delete    -> POST /recycle-bin/:kind/:id/purge
 *
 * Generic over kind so the UI consumes one hook per action, not three.
 */

export type RecycleBinKind = 'user' | 'organization' | 'workspace';
export type RecycleBinProtectedReason = 'self' | 'super_admin' | null;

export interface RecycleBinEntry {
  readonly id: string;
  readonly kind: RecycleBinKind;
  readonly label: string;
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  readonly deletedAt: string;
  readonly deletedBy: string | null;
  readonly purgeAt: string;
  readonly daysRemaining: number;
  /** When set, Permanently delete is disabled and the row carries a Protected badge. */
  readonly protectedReason: RecycleBinProtectedReason;
}

interface ListResponse {
  readonly items: ReadonlyArray<RecycleBinEntry>;
}

interface RestoreResponse {
  readonly id: string;
  readonly kind: RecycleBinKind;
  readonly restoredAt: string;
}

interface PurgeResponse {
  readonly id: string;
  readonly kind: RecycleBinKind;
  readonly reason: 'manual';
  readonly purgedAt: string;
}

// Actor-scoped cache key so a session switch invalidates the bin
// naturally. Same pattern as api-notifications.
function recycleBinKey(actorId: string | null, kind: RecycleBinKind) {
  return ['recycle-bin', actorId, kind] as const;
}

export function useRecycleBin(kind: RecycleBinKind) {
  const { data: user } = useSession();
  return useQuery({
    queryKey: recycleBinKey(user?.actorId ?? null, kind),
    queryFn: () =>
      api.get<ListResponse>(`/v1/platform/recycle-bin?kind=${kind}`),
    enabled: user != null && user.isInternalManager === true,
    staleTime: 15_000,
    select: (r) => r.items,
  });
}

export function useRestoreEntity() {
  const qc = useQueryClient();
  const { data: user } = useSession();
  const actorId = user?.actorId ?? null;
  return useMutation({
    mutationFn: ({ kind, id }: { kind: RecycleBinKind; id: string }) =>
      api.post<RestoreResponse>(
        `/v1/platform/recycle-bin/${kind}/${id}/restore`,
        {},
      ),
    onSuccess: (_data, { kind }) => {
      qc.invalidateQueries({ queryKey: recycleBinKey(actorId, kind) });
    },
  });
}

export function usePurgeEntity() {
  const qc = useQueryClient();
  const { data: user } = useSession();
  const actorId = user?.actorId ?? null;
  return useMutation({
    mutationFn: ({ kind, id }: { kind: RecycleBinKind; id: string }) =>
      api.post<PurgeResponse>(
        `/v1/platform/recycle-bin/${kind}/${id}/purge`,
        {},
      ),
    onSuccess: (_data, { kind }) => {
      qc.invalidateQueries({ queryKey: recycleBinKey(actorId, kind) });
    },
  });
}
