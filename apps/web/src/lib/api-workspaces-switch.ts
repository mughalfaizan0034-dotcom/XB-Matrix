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
    // Two-step cache update so the UI flips immediately regardless of
    // the /me refetch race:
    //   1) Optimistically merge the workspace the server just confirmed
    //      into the cached /me payload — useSession + useActiveWorkspace
    //      both read this. Without this, observers occasionally saw the
    //      stale (null) activeWorkspace because the invalidation race
    //      between mutation resolve + refetch isn't fully deterministic.
    //   2) Then invalidate so /me is also re-fetched from the server,
    //      catching any drift (e.g., the server has more info than the
    //      mutation response carries).
    onSuccess: (active) => {
      qc.setQueryData<MeShape | undefined>(SESSION_QUERY_KEY, (prev) =>
        prev ? { ...prev, activeWorkspace: active } : prev,
      );
      return qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}
