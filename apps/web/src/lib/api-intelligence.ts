'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

/**
 * Frontend client for /v1/intelligence/* — the engine-output layer.
 *
 * Architectural rule (CLAUDE.md): all KPI math is server-side. These
 * hooks return shapes that the UI renders verbatim. We never sum,
 * divide, or derive anything from these payloads — if a calculation
 * is missing the engine should compute it, not the page.
 *
 * Every payload includes a `readiness` block so the page can render
 * an honest empty/coming-soon state when the engine doesn't have
 * inputs yet.
 */

export interface EngineReadiness {
  readonly ready: boolean;
  readonly reason: string | null;
  readonly action?: { readonly label: string; readonly href: string };
}

/**
 * Provenance block emitted alongside every engine response. The
 * frontend renders these fields when a tooltip / debug view needs to
 * answer "where did this number come from" — it never recomputes or
 * filters by them. Mirrors the backend EngineProvenance contract; the
 * two must stay in lock-step (public-repo hygiene rule:
 * no silent response-shape drift).
 */
export interface EngineProvenance {
  readonly computedAt: string;
  readonly sourceUploadIds: ReadonlyArray<string>;
  readonly canonicalRowCount: number;
  readonly engineVersion: string;
}

// ---------- Dashboard ------------------------------------------------

export interface DashboardSalesKpis {
  readonly windowDays: number;
  readonly orders: number;
  readonly units: number;
  readonly revenue: string;
  readonly averageOrderValue: string | null;
  readonly averageSellingPrice: string | null;
  readonly dailyVelocity: string | null;
  readonly distinctSkus: number;
  readonly distinctMarketplaces: number;
}

export interface DashboardInventoryKpis {
  readonly snapshotDate: string | null;
  readonly distinctSkus: number;
  readonly distinctWarehouses: number;
  readonly totalOnHand: number;
  readonly totalAvailable: number;
  readonly totalInbound: number;
  readonly totalReserved: number;
  readonly totalValuation: string;
  readonly costCoverage: string;
}

export interface DashboardCombinedKpis {
  readonly stockCoverDays: string | null;
  readonly stockoutRiskSkus: number;
  readonly deadStockSkus: number;
}

export interface MarketplaceBreakdownEntry {
  readonly marketplace: string;
  readonly orders: number;
  readonly units: number;
  readonly revenue: string;
  readonly revenueShare: string;
}

export interface DashboardKpiBundle {
  readonly workspaceId: string;
  readonly windowDays: number;
  readonly window: { readonly from: string; readonly to: string };
  readonly sales: DashboardSalesKpis;
  readonly salesReadiness: EngineReadiness;
  readonly inventory: DashboardInventoryKpis;
  readonly inventoryReadiness: EngineReadiness;
  readonly combined: DashboardCombinedKpis;
  readonly topMarketplaces: ReadonlyArray<MarketplaceBreakdownEntry>;
  readonly dosTargetDays: string;
  readonly provenance: EngineProvenance;
}

export function useDashboardKpis(workspaceId: string | null, windowDays = 30) {
  return useQuery({
    enabled: !!workspaceId,
    queryKey: ['intelligence', 'dashboard', workspaceId, windowDays],
    queryFn: () =>
      api.get<DashboardKpiBundle>(
        `/v1/intelligence/dashboard?workspaceId=${workspaceId}&windowDays=${windowDays}`,
      ),
    staleTime: 30_000,
  });
}

// ---------- Advertising ----------------------------------------------

export interface AdvertisingKpis {
  readonly spend: string | null;
  readonly attributedSales: string | null;
  readonly orders: number | null;
  readonly impressions: number | null;
  readonly clicks: number | null;
  readonly ctr: string | null;
  readonly cpc: string | null;
  readonly acos: string | null;
  readonly tacos: string | null;
  readonly roas: string | null;
}

export interface AdvertisingSummary {
  readonly workspaceId: string;
  readonly windowDays: number;
  readonly readiness: EngineReadiness;
  readonly kpis: AdvertisingKpis;
  readonly provenance: EngineProvenance;
}

export function useAdvertisingSummary(workspaceId: string | null, windowDays = 30) {
  return useQuery({
    enabled: !!workspaceId,
    queryKey: ['intelligence', 'advertising', workspaceId, windowDays],
    queryFn: () =>
      api.get<AdvertisingSummary>(
        `/v1/intelligence/advertising?workspaceId=${workspaceId}&windowDays=${windowDays}`,
      ),
    staleTime: 60_000,
  });
}

// ---------- Unit Economics -------------------------------------------

export interface UnitEconomicsSummary {
  readonly workspaceId: string;
  readonly readiness: EngineReadiness;
  readonly inputs: {
    readonly totalSkus: number;
    readonly skusWithUnitCost: number;
    readonly skusWithSellingPrice: number;
    readonly readinessShare: string;
  };
  readonly provenance: EngineProvenance;
}

export function useUnitEconomicsSummary(workspaceId: string | null) {
  return useQuery({
    enabled: !!workspaceId,
    queryKey: ['intelligence', 'unit-economics', workspaceId],
    queryFn: () =>
      api.get<UnitEconomicsSummary>(
        `/v1/intelligence/unit-economics?workspaceId=${workspaceId}`,
      ),
    staleTime: 60_000,
  });
}

// ---------- Shipments ------------------------------------------------

export interface ShipmentsReadiness {
  readonly workspaceId: string;
  readonly readiness: EngineReadiness;
  readonly preview: {
    readonly skusAtRisk: number;
    readonly skusDeadStock: number;
    readonly dosTargetDays: string;
  };
  readonly provenance: EngineProvenance;
}

export function useShipmentsReadiness(workspaceId: string | null) {
  return useQuery({
    enabled: !!workspaceId,
    queryKey: ['intelligence', 'shipments', workspaceId],
    queryFn: () =>
      api.get<ShipmentsReadiness>(
        `/v1/intelligence/shipments?workspaceId=${workspaceId}`,
      ),
    staleTime: 60_000,
  });
}

// ---------- Reports --------------------------------------------------

export interface ReportRegistryEntry {
  readonly key: 'sales' | 'inventory' | 'ads' | 'warehouse_inventory';
  readonly title: string;
  readonly description: string;
  readonly available: boolean;
  readonly href: string;
}

export interface ReportRegistry {
  readonly workspaceId: string;
  readonly reports: ReadonlyArray<ReportRegistryEntry>;
  readonly counts: {
    readonly salesRows: number;
    readonly inventoryRows: number;
    readonly adsRows: number;
  };
  readonly provenance: EngineProvenance;
}

export function useReportRegistry(workspaceId: string | null) {
  return useQuery({
    enabled: !!workspaceId,
    queryKey: ['intelligence', 'reports', workspaceId],
    queryFn: () =>
      api.get<ReportRegistry>(`/v1/intelligence/reports?workspaceId=${workspaceId}`),
    staleTime: 60_000,
  });
}
