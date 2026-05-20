'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

export interface InventorySnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly uploadId: string;
  readonly sku: string;
  readonly warehouseCode: string;
  readonly snapshotDate: string;
  readonly quantityOnHand: number;
  readonly quantityReserved: number;
  readonly quantityAvailable: number;
  readonly quantityInbound: number;
  readonly unitCost: string | null;
  readonly currencyCode: string | null;
  readonly createdAt: string;
}

export interface InventoryAggregates {
  readonly distinctSkus: number;
  readonly distinctWarehouses: number;
  readonly totalOnHand: number;
  readonly totalAvailable: number;
  readonly totalValuation: string;
}

export interface InventoryQuery {
  readonly workspaceId: string;
  readonly q?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly warehouse?: string;
  readonly sku?: string;
  readonly latestOnly?: boolean;
  readonly sort?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface InventoryPage {
  readonly items: ReadonlyArray<InventorySnapshot>;
  readonly total: number;
  readonly hasMore: boolean;
  readonly aggregates: InventoryAggregates;
}

interface ListResponse {
  readonly items: ReadonlyArray<InventorySnapshot>;
  readonly page: { cursor: string | null; hasMore: boolean; total?: number | null };
  readonly aggregates: InventoryAggregates;
}

const KEY = ['inventory'] as const;

function buildUrl(q: InventoryQuery): string {
  const sp = new URLSearchParams();
  sp.set('workspaceId', q.workspaceId);
  if (q.q) sp.set('q', q.q);
  if (q.dateFrom) sp.set('dateFrom', q.dateFrom);
  if (q.dateTo) sp.set('dateTo', q.dateTo);
  if (q.warehouse) sp.set('warehouse', q.warehouse);
  if (q.sku) sp.set('sku', q.sku);
  if (q.latestOnly === false) sp.set('latestOnly', 'false');
  if (q.sort) sp.set('sort', q.sort);
  if (q.page !== undefined) sp.set('page', String(q.page));
  if (q.pageSize !== undefined) sp.set('pageSize', String(q.pageSize));
  return `/v1/inventory?${sp.toString()}`;
}

export function useInventory(query: InventoryQuery | null) {
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

export interface InventoryFacets {
  readonly warehouses: ReadonlyArray<string>;
}

export function useInventoryFacets(workspaceId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'facets', workspaceId],
    queryFn: () =>
      api.get<InventoryFacets>(`/v1/inventory/facets?workspaceId=${encodeURIComponent(workspaceId!)}`),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}
