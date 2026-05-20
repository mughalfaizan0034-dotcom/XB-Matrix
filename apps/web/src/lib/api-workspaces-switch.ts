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
    // The backend reloads the active workspace from the database after
    // the UPDATE commits (see workspace-service.selectActiveWorkspace),
    // so the response is the authoritative state — no need for a /me
    // refetch race afterwards.
    //
    //   1) Cancel any in-flight /me to stop a stale response from
    //      overwriting our update.
    //   2) Merge the server-confirmed workspace into the cached /me
    //      payload synchronously. useSession + useActiveWorkspace both
    //      read this key, so the UI flips immediately.
    //   3) Mark the query as fresh (not just invalidated) so it doesn't
    //      refetch on the next mount and risk clobbering. Naturally
    //      goes stale after staleTime; the next legitimate refetch
    //      will pick up any concurrent changes.
    onSuccess: async (active) => {
      await qc.cancelQueries({ queryKey: SESSION_QUERY_KEY });
      qc.setQueryData<MeShape | undefined>(SESSION_QUERY_KEY, (prev) =>
        prev ? { ...prev, activeWorkspace: active } : { user: null, activeWorkspace: active },
      );
    },
  });
}
