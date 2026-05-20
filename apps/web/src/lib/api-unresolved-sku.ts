'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './api-client';
import { ALIAS_TYPES, type AliasType } from './api-sku-aliases';

export type UnresolvedReason = 'no_match' | 'ambiguous' | 'mapping_error';
export type UnresolvedStatus = 'pending' | 'mapped' | 'dismissed';

export { ALIAS_TYPES };
export type { AliasType };

export interface UnresolvedGroup {
  readonly aliasType: AliasType;
  readonly aliasValue: string;
  readonly sourcePlatform: string | null;
  readonly sourceMarketplace: string | null;
  readonly sourceAccount: string | null;
  readonly reason: UnresolvedReason;
  readonly affectedRows: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly sampleUploadIds: ReadonlyArray<string>;
}

export interface UnresolvedRow {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly uploadId: string;
  readonly uploadKind: string;
  readonly rowNumber: number;
  readonly aliasType: AliasType;
  readonly aliasValue: string;
  readonly sourcePlatform: string | null;
  readonly sourceMarketplace: string | null;
  readonly sourceAccount: string | null;
  readonly reason: UnresolvedReason;
  readonly sourcePayload: Record<string, unknown>;
  readonly status: UnresolvedStatus;
  readonly resolvedAliasId: string | null;
  readonly resolvedSkuNormalized: string | null;
  readonly resolvedAt: string | null;
  readonly dismissedAt: string | null;
  readonly dismissalReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface GroupAggregates {
  readonly pendingRows: number;
  readonly distinctAliases: number;
  readonly distinctUploads: number;
}

interface GroupsResponse {
  readonly items: ReadonlyArray<UnresolvedGroup>;
  readonly page: { cursor: string | null; hasMore: boolean; total?: number | null };
  readonly aggregates: GroupAggregates;
}

interface RowsResponse {
  readonly items: ReadonlyArray<UnresolvedRow>;
  readonly page: { cursor: string | null; hasMore: boolean; total?: number | null };
}

export interface GroupsQuery {
  readonly workspaceId: string;
  readonly q?: string;
  readonly aliasType?: AliasType;
  readonly sourcePlatform?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

const KEY = ['unresolved-sku'] as const;

function buildGroupsUrl(q: GroupsQuery): string {
  const sp = new URLSearchParams();
  sp.set('workspaceId', q.workspaceId);
  if (q.q) sp.set('q', q.q);
  if (q.aliasType) sp.set('aliasType', q.aliasType);
  if (q.sourcePlatform) sp.set('sourcePlatform', q.sourcePlatform);
  if (q.page !== undefined) sp.set('page', String(q.page));
  if (q.pageSize !== undefined) sp.set('pageSize', String(q.pageSize));
  return `/v1/unresolved-sku/groups?${sp.toString()}`;
}

export function useUnresolvedGroups(query: GroupsQuery | null) {
  return useQuery({
    queryKey: [...KEY, 'groups', query ?? null],
    queryFn: () =>
      api.get<GroupsResponse>(buildGroupsUrl(query!)).then((r) => ({
        items: r.items,
        total: r.page.total ?? r.items.length,
        hasMore: r.page.hasMore,
        aggregates: r.aggregates,
      })),
    enabled: query !== null && !!query.workspaceId,
    staleTime: 15_000,
  });
}

export interface RowsQuery {
  readonly workspaceId: string;
  readonly status?: UnresolvedStatus;
  readonly uploadId?: string;
  readonly aliasType?: AliasType;
  readonly aliasValue?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

function buildRowsUrl(q: RowsQuery): string {
  const sp = new URLSearchParams();
  sp.set('workspaceId', q.workspaceId);
  if (q.status) sp.set('status', q.status);
  if (q.uploadId) sp.set('uploadId', q.uploadId);
  if (q.aliasType) sp.set('aliasType', q.aliasType);
  if (q.aliasValue) sp.set('aliasValue', q.aliasValue);
  if (q.page !== undefined) sp.set('page', String(q.page));
  if (q.pageSize !== undefined) sp.set('pageSize', String(q.pageSize));
  return `/v1/unresolved-sku/rows?${sp.toString()}`;
}

export function useUnresolvedRows(query: RowsQuery | null) {
  return useQuery({
    queryKey: [...KEY, 'rows', query ?? null],
    queryFn: () =>
      api.get<RowsResponse>(buildRowsUrl(query!)).then((r) => ({
        items: r.items,
        total: r.page.total ?? r.items.length,
        hasMore: r.page.hasMore,
      })),
    enabled: query !== null && !!query.workspaceId,
    staleTime: 15_000,
  });
}

export interface GroupKey {
  readonly workspaceId: string;
  readonly aliasType: AliasType;
  readonly aliasValue: string;
  readonly sourcePlatform?: string | null;
  readonly sourceMarketplace?: string | null;
  readonly sourceAccount?: string | null;
}

export interface ReplayResult {
  readonly resolvedSkuNormalized: string | null;
  readonly resolvedAliasId: string | null;
  readonly markedMapped: number;
  readonly stillUnresolved: boolean;
}

export function useReplayUnresolved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GroupKey) =>
      api.post<ReplayResult>('/v1/unresolved-sku/replay', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['sku-aliases'] });
    },
  });
}

export function useDismissUnresolved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GroupKey & { reason?: string | null }) =>
      api.post<{ markedDismissed: number }>('/v1/unresolved-sku/dismiss', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRestoreUnresolved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GroupKey) =>
      api.post<{ restored: number }>('/v1/unresolved-sku/restore', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
