'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@xb/types';
import { api } from './api-client';

export interface Workspace {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceName: string;
  readonly workspaceType: 'marketplace' | 'dtc' | 'warehouse' | 'omni_channel';
  readonly workspaceStatus: 'active' | 'archived';
  readonly defaultCurrencyCode: string;
  readonly timezone: string;
  readonly dosTargetDays: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface CreateWorkspaceInput {
  readonly organizationId: string;
  readonly workspaceName: string;
  readonly workspaceType: Workspace['workspaceType'];
  readonly defaultCurrencyCode: string;
  readonly timezone?: string;
  readonly dosTargetDays?: number;
}

export function workspacesKey(orgId: string | null): readonly string[] {
  return ['workspaces', orgId ?? 'self'];
}

export function useWorkspaces(opts: { organizationId?: string | null } = {}) {
  const orgId = opts.organizationId ?? null;
  return useQuery({
    queryKey: workspacesKey(orgId),
    queryFn: () => {
      const qs = orgId ? `?organizationId=${encodeURIComponent(orgId)}` : '';
      return api.get<Paginated<Workspace>>(`/v1/workspaces${qs}`).then((r) => r.items);
    },
    staleTime: 15_000,
    enabled: orgId !== null || opts.organizationId === undefined,
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) =>
      api.post<{ workspace: Workspace }>('/v1/workspaces', input).then((r) => r.workspace),
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: workspacesKey(ws.organizationId) });
      qc.invalidateQueries({ queryKey: workspacesKey(null) });
    },
  });
}
