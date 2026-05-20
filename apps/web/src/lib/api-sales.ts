'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

export interface SalesOrder {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly uploadId: string;
  readonly orderId: string;
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly totalPrice: string;
  readonly currencyCode: string;
  readonly orderDate: string; // YYYY-MM-DD
  readonly marketplace: string | null;
  readonly channel: string | null;
  readonly createdAt: string;
}

export interface SalesAggregates {
  readonly totalOrders: number;
  readonly totalQuantity: number;
  readonly totalGross: string; // numeric as text — present as is
}

export interface SalesQuery {
  readonly workspaceId: string;
  readonly q?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly marketplace?: string;
  readonly channel?: string;
  readonly sku?: string;
  readonly sort?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface SalesPage {
  readonly items: ReadonlyArray<SalesOrder>;
  readonly total: number;
  readonly hasMore: boolean;
  readonly aggregates: SalesAggregates;
}

interface ListResponse {
  readonly items: ReadonlyArray<SalesOrder>;
  readonly page: { cursor: string | null; hasMore: boolean; total?: number | null };
  readonly aggregates: SalesAggregates;
}

const SALES_KEY = ['sales'] as const;

function buildUrl(q: SalesQuery): string {
  const sp = new URLSearchParams();
  sp.set('workspaceId', q.workspaceId);
  if (q.q) sp.set('q', q.q);
  if (q.dateFrom) sp.set('dateFrom', q.dateFrom);
  if (q.dateTo) sp.set('dateTo', q.dateTo);
  if (q.marketplace) sp.set('marketplace', q.marketplace);
  if (q.channel) sp.set('channel', q.channel);
  if (q.sku) sp.set('sku', q.sku);
  if (q.sort) sp.set('sort', q.sort);
  if (q.page !== undefined) sp.set('page', String(q.page));
  if (q.pageSize !== undefined) sp.set('pageSize', String(q.pageSize));
  return `/v1/sales?${sp.toString()}`;
}

export function useSalesOrders(query: SalesQuery | null) {
  return useQuery({
    queryKey: [...SALES_KEY, 'list', query ?? null],
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

export interface SalesFacets {
  readonly marketplaces: ReadonlyArray<string>;
  readonly channels: ReadonlyArray<string>;
}

export function useSalesFacets(workspaceId: string | null) {
  return useQuery({
    queryKey: [...SALES_KEY, 'facets', workspaceId],
    queryFn: () =>
      api.get<SalesFacets>(`/v1/sales/facets?workspaceId=${encodeURIComponent(workspaceId!)}`),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}
