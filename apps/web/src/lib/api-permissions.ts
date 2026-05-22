'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

export const WORKSPACE_ACCESS_LEVELS = ['none', 'view', 'edit'] as const;
export type WorkspaceAccessLevel = (typeof WORKSPACE_ACCESS_LEVELS)[number];

export interface UserWorkspaceAssignment {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly accessLevel: WorkspaceAccessLevel;
}

export interface UserPermissionsResponse {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly workspaces: ReadonlyArray<UserWorkspaceAssignment>;
}

export function userPermissionsKey(userId: string): readonly string[] {
  return ['permissions', 'user', userId];
}

export function useUserPermissions(userId: string | null) {
  return useQuery({
    queryKey: userPermissionsKey(userId ?? ''),
    queryFn: () => api.get<UserPermissionsResponse>(`/v1/permissions/users/${userId}`),
    enabled: !!userId,
    staleTime: 10_000,
  });
}

export function useSetUserPermissions(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignments: Record<string, WorkspaceAccessLevel>) =>
      api.post<{ saved: boolean }>(`/v1/permissions/users/${userId}`, { assignments }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userPermissionsKey(userId) });
      // Visibility queries (sidebar + picker + /me) key off these rows.
      qc.invalidateQueries({ queryKey: ['workspaces', 'accessible'] });
      qc.invalidateQueries({ queryKey: ['session', 'me'] });
    },
  });
}
