'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './api-client';

export const ALIAS_TYPES = [
  'platform_sku',
  'asin',
  'upc',
  'ean',
  'gtin',
  'isbn',
  'fnsku',
  'supplier_sku',
  'internal_sku',
  'warehouse_sku',
] as const;
export type AliasType = (typeof ALIAS_TYPES)[number];

export const SOURCE_METHODS = [
  'manual',
  'rule',
  'fuzzy',
  'ai_suggested',
  'auto_first_seen',
] as const;
export type SourceMethod = (typeof SOURCE_METHODS)[number];

export interface SkuAlias {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly skuNormalized: string;
  readonly aliasValue: string;
  readonly aliasType: AliasType;
  readonly sourcePlatform: string | null;
  readonly sourceAccount: string | null;
  readonly sourceMarketplace: string | null;
  readonly regionCode: string | null;
  readonly warehouseCode: string | null;
  readonly isActive: boolean;
  readonly sourceMethod: SourceMethod;
  readonly confidence: number | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface AliasAggregates {
  readonly totalAliases: number;
  readonly distinctSkus: number;
  readonly distinctPlatforms: number;
}

export interface AliasesQuery {
  readonly workspaceId: string;
  readonly q?: string;
  readonly aliasType?: AliasType;
  readonly sourcePlatform?: string;
  readonly skuNormalized?: string;
  readonly isActive?: boolean;
  readonly sort?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

interface ListResponse {
  readonly items: ReadonlyArray<SkuAlias>;
  readonly page: { cursor: string | null; hasMore: boolean; total?: number | null };
  readonly aggregates: AliasAggregates;
}

const KEY = ['sku-aliases'] as const;

function buildUrl(q: AliasesQuery): string {
  const sp = new URLSearchParams();
  sp.set('workspaceId', q.workspaceId);
  if (q.q) sp.set('q', q.q);
  if (q.aliasType) sp.set('aliasType', q.aliasType);
  if (q.sourcePlatform) sp.set('sourcePlatform', q.sourcePlatform);
  if (q.skuNormalized) sp.set('skuNormalized', q.skuNormalized);
  if (q.isActive !== undefined) sp.set('isActive', String(q.isActive));
  if (q.sort) sp.set('sort', q.sort);
  if (q.page !== undefined) sp.set('page', String(q.page));
  if (q.pageSize !== undefined) sp.set('pageSize', String(q.pageSize));
  return `/v1/sku-aliases?${sp.toString()}`;
}

export function useSkuAliases(query: AliasesQuery | null) {
  return useQuery({
    queryKey: [...KEY, 'list', query ?? null],
    queryFn: () =>
      api.get<ListResponse>(buildUrl(query!)).then((r) => ({
        items: r.items,
        total: r.page.total ?? r.items.length,
        hasMore: r.page.hasMore,
        aggregates: r.aggregates,
      })),
    enabled: query !== null && !!query.workspaceId,
    staleTime: 15_000,
  });
}

export interface AliasConflict {
  readonly aliasType: AliasType;
  readonly aliasValue: string;
  readonly sourcePlatform: string | null;
  readonly sourceMarketplace: string | null;
  readonly sourceAccount: string | null;
  readonly resolvedSkus: ReadonlyArray<string>;
  readonly aliasIds: ReadonlyArray<string>;
}

export function useAliasConflicts(workspaceId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'conflicts', workspaceId],
    queryFn: () =>
      api
        .get<{ items: ReadonlyArray<AliasConflict> }>(
          `/v1/sku-aliases/conflicts?workspaceId=${encodeURIComponent(workspaceId!)}`,
        )
        .then((r) => r.items),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export interface CreateAliasInput {
  readonly workspaceId: string;
  readonly skuNormalized: string;
  readonly aliasValue: string;
  readonly aliasType: AliasType;
  readonly sourcePlatform?: string | null;
  readonly sourceAccount?: string | null;
  readonly sourceMarketplace?: string | null;
  readonly regionCode?: string | null;
  readonly warehouseCode?: string | null;
  readonly isActive?: boolean;
  readonly sourceMethod?: SourceMethod;
  readonly confidence?: number | null;
  readonly notes?: string | null;
}

export function useCreateSkuAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAliasInput) =>
      api.post<{ alias: SkuAlias }>('/v1/sku-aliases', input).then((r) => r.alias),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface PatchAliasInput {
  readonly id: string;
  readonly expectedRowVersion: number;
  readonly skuNormalized?: string;
  readonly isActive?: boolean;
  readonly confidence?: number | null;
  readonly notes?: string | null;
}

export function usePatchSkuAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...rest }: PatchAliasInput) =>
      api.patch<{ alias: SkuAlias }>(`/v1/sku-aliases/${id}`, rest).then((r) => r.alias),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteSkuAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedRowVersion }: { id: string; expectedRowVersion: number }) =>
      api.delete<{ deleted: boolean }>(`/v1/sku-aliases/${id}`, { expectedRowVersion }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
