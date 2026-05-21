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
  /** One of WORKSPACE_TYPE_OPTIONS, or null when not set. */
  readonly workspaceType?: string | null;
  readonly defaultCurrencyCode: string;
  readonly timezone?: string;
  readonly dosTargetDays?: number;
}

/** Controlled workspace-type vocabulary surfaced in the create/edit dialogs. */
export const WORKSPACE_TYPE_OPTIONS = [
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'dtc', label: 'DTC' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'general', label: 'General' },
] as const;

/** Human-readable label for a stored workspace-type value. */
export function workspaceTypeLabel(raw: string | null): string {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return '—';
  const match = WORKSPACE_TYPE_OPTIONS.find((t) => t.value === v);
  if (match) return match.label;
  // Legacy free-text values predate the controlled vocabulary; the
  // retired "omni_channel" type maps onto General.
  if (v === 'omni_channel' || v === 'omnichannel') return 'General';
  return raw!.trim();
}

/**
 * Coerce a stored workspace-type value onto the controlled vocabulary
 * for the edit dialog's <select>. Unknown legacy free-text becomes ''
 * (Not set); the retired "omni_channel" maps onto General.
 */
export function normalizeWorkspaceType(raw: string | null): string {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'omni_channel' || v === 'omnichannel') return 'general';
  return WORKSPACE_TYPE_OPTIONS.some((t) => t.value === v) ? v : '';
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
      // Write the fresh row (with its bumped rowVersion) into every
      // cached workspace list synchronously. Without this, an immediate
      // re-edit reads the stale cached rowVersion before the background
      // refetch lands and the optimistic-lock PATCH 409s.
      for (const key of [workspacesKey(ws.organizationId), workspacesKey(null)]) {
        qc.setQueryData<Workspace[]>(key, (old) =>
          old ? old.map((w) => (w.id === ws.id ? ws : w)) : old,
        );
      }
      qc.invalidateQueries({ queryKey: workspacesKey(ws.organizationId) });
      qc.invalidateQueries({ queryKey: workspacesKey(null) });
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
