'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@xb/types';
import { api } from './api-client';

export interface Workspace {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceName: string;
  readonly workspaceType: string | null;
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
  /** Free-text, optional. Omit or pass null when not set. */
  readonly workspaceType?: string | null;
  readonly defaultCurrencyCode: string;
  readonly timezone?: string;
  readonly dosTargetDays?: number;
}

export interface PatchWorkspaceInput {
  readonly workspaceName?: string;
  readonly workspaceType?: Workspace['workspaceType'];
  readonly defaultCurrencyCode?: string;
  readonly timezone?: string;
  readonly dosTargetDays?: number;
  readonly expectedRowVersion: number;
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

export function usePatchWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchWorkspaceInput }) =>
      api
        .patch<{ workspace: Workspace }>(`/v1/workspaces/${id}`, input)
        .then((r) => r.workspace),
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: workspacesKey(ws.organizationId) });
    },
  });
}

type WsTransition = 'archive' | 'reactivate' | 'restore';

export function useWorkspaceTransition(transition: WsTransition) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      expectedRowVersion,
    }: {
      id: string;
      expectedRowVersion?: number;
    }) => {
      const body = transition === 'restore' ? {} : { expectedRowVersion };
      return api
        .post<{ workspace: Workspace }>(`/v1/workspaces/${id}/${transition}`, body)
        .then((r) => r.workspace);
    },
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: workspacesKey(ws.organizationId) });
    },
  });
}

export function useSoftDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      expectedRowVersion,
    }: {
      id: string;
      expectedRowVersion: number;
    }) =>
      api
        .delete<{ workspace: Workspace }>(`/v1/workspaces/${id}`, { expectedRowVersion })
        .then((r) => r.workspace),
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: workspacesKey(ws.organizationId) });
    },
  });
}
