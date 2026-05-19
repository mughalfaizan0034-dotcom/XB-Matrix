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

export function useSetActiveWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string | null) =>
      api
        .post<{ active: AccessibleWorkspace | null }>('/v1/workspaces/active', { workspaceId })
        .then((r) => r.active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}
