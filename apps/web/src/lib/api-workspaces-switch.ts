'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';
import { SESSION_QUERY_KEY } from './session';

export interface AccessibleWorkspace {
  readonly id: string;
  readonly workspaceName: string;
  readonly workspaceType: 'marketplace' | 'dtc' | 'warehouse' | 'omni_channel';
  readonly workspaceStatus: 'active' | 'archived';
  readonly organizationId: string;
  readonly organizationName: string;
}

export const ACCESSIBLE_WORKSPACES_QUERY_KEY = ['workspaces', 'accessible'] as const;

export function useAccessibleWorkspaces() {
  return useQuery({
    queryKey: ACCESSIBLE_WORKSPACES_QUERY_KEY,
    queryFn: () =>
      api
        .get<{ items: ReadonlyArray<AccessibleWorkspace> }>('/v1/workspaces/accessible')
        .then((r) => r.items),
    staleTime: 30_000,
  });
}

interface MeShape {
  readonly user: unknown;
  readonly activeWorkspace: AccessibleWorkspace | null;
}

export function useSetActiveWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string | null) =>
      api
        .post<{ active: AccessibleWorkspace | null }>('/v1/workspaces/active', { workspaceId })
        .then((r) => r.active),
    // Three-step cache reconciliation so the UI flips deterministically
    // regardless of any in-flight /me refetch race:
    //   1) Cancel any in-flight /me request — if one was mid-flight
    //      with the OLD active workspace it would clobber our update.
    //   2) Optimistically merge the workspace the server confirmed
    //      straight into the cached /me payload. useSession +
    //      useActiveWorkspace both read this key, so the UI flips
    //      synchronously on the next render.
    //   3) Force-refetch /me (not just invalidate) so observers
    //      converge with the server's authoritative state. refetchQueries
    //      is awaited end-to-end, so by the time mutateAsync resolves
    //      every cache + observer is up-to-date.
    onSuccess: async (active) => {
      await qc.cancelQueries({ queryKey: SESSION_QUERY_KEY });
      qc.setQueryData<MeShape | undefined>(SESSION_QUERY_KEY, (prev) =>
        prev ? { ...prev, activeWorkspace: active } : { user: null, activeWorkspace: active },
      );
      await qc.refetchQueries({ queryKey: SESSION_QUERY_KEY, exact: true });
    },
  });
}
