'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

export interface PlatformAuditEntry {
  readonly id: string;
  readonly organizationId: string | null;
  readonly workspaceId: string | null;
  readonly actorId: string | null;
  readonly actorKind: string;
  readonly operation: string;
  readonly entityKind: string;
  readonly entityId: string | null;
  readonly occurredAt: string;
}

export interface DiagnosticsResult {
  readonly api: { uptime: number; nodeVersion: string };
  readonly database: { connected: boolean; latencyMs: number | null };
  readonly redis: { status: string };
  readonly storage: { configured: boolean };
  readonly counts: {
    organizations: number;
    workspaces: number;
    users: number;
    uploads: number;
    auditEvents30d: number;
    channelSalesRows: number;
  };
}

export interface BillingRow {
  readonly id: string;
  readonly displayName: string;
  readonly slug: string;
  readonly organizationStatus: string;
  readonly billingStatus: string;
  readonly defaultCurrencyCode: string;
  readonly createdAt: string;
}

export interface FeatureFlagsResult {
  readonly registered: ReadonlyArray<{ key: string; description: string }>;
  readonly note: string;
}

export function usePlatformAudit(limit = 100) {
  return useQuery({
    queryKey: ['platform', 'audit', limit],
    queryFn: () =>
      api
        .get<{ items: ReadonlyArray<PlatformAuditEntry> }>(`/v1/platform/audit?limit=${limit}`)
        .then((r) => r.items),
    staleTime: 15_000,
  });
}

export function usePlatformDiagnostics() {
  return useQuery({
    queryKey: ['platform', 'diagnostics'],
    queryFn: () => api.get<DiagnosticsResult>('/v1/platform/diagnostics'),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function usePlatformBilling() {
  return useQuery({
    queryKey: ['platform', 'billing'],
    queryFn: () =>
      api
        .get<{ items: ReadonlyArray<BillingRow> }>('/v1/platform/billing')
        .then((r) => r.items),
    staleTime: 30_000,
  });
}

export function usePlatformFeatureFlags() {
  return useQuery({
    queryKey: ['platform', 'feature-flags'],
    queryFn: () => api.get<FeatureFlagsResult>('/v1/platform/feature-flags'),
    staleTime: 60_000,
  });
}
