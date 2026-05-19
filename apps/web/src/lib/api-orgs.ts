'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@xb/types';
import { api } from './api-client';

export interface Organization {
  readonly id: string;
  readonly displayName: string;
  readonly legalName: string | null;
  readonly slug: string;
  readonly organizationStatus: 'active' | 'suspended' | 'archived';
  readonly billingStatus: 'active' | 'past_due' | 'cancelled' | 'trial' | 'not_configured';
  readonly defaultCurrencyCode: string;
  readonly defaultTimezone: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface CreateOrgInput {
  readonly displayName: string;
  readonly legalName?: string;
  readonly defaultCurrencyCode: string;
  readonly defaultTimezone?: string;
}

export interface PatchOrgInput {
  readonly displayName?: string;
  readonly legalName?: string | null;
  readonly defaultCurrencyCode?: string;
  readonly defaultTimezone?: string;
  readonly expectedRowVersion: number;
}

const ORGS_KEY = ['orgs'] as const;

export interface OrganizationsQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly q?: string;
  readonly status?: 'active' | 'suspended' | 'archived';
  readonly sort?: string;
}

export interface OrganizationsPage {
  readonly items: ReadonlyArray<Organization>;
  readonly total: number;
  readonly hasMore: boolean;
}

function buildOrgsUrl(q: OrganizationsQuery | undefined): string {
  const sp = new URLSearchParams();
  if (q?.page !== undefined) sp.set('page', String(q.page));
  if (q?.pageSize !== undefined) sp.set('pageSize', String(q.pageSize));
  if (q?.q) sp.set('q', q.q);
  if (q?.status) sp.set('status', q.status);
  if (q?.sort) sp.set('sort', q.sort);
  const qs = sp.toString();
  return qs ? `/v1/organizations?${qs}` : '/v1/organizations';
}

/**
 * Server-paginated organizations list. Pass a `query` to scope/sort/page;
 * omit it to get the first page with default sort (createdAt desc).
 *
 * Returns the full paginated envelope so consumers can drive pagination
 * UI from `total` / `hasMore` without a separate count round trip.
 */
export function useOrganizations(query?: OrganizationsQuery) {
  return useQuery({
    queryKey: [...ORGS_KEY, 'list', query ?? null],
    queryFn: () =>
      api.get<Paginated<Organization>>(buildOrgsUrl(query)).then((r) => ({
        items: r.items,
        total: r.page.total ?? r.items.length,
        hasMore: r.page.hasMore,
      })),
    staleTime: 15_000,
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrgInput) =>
      api
        .post<{ organization: Organization }>('/v1/organizations', input)
        .then((r) => r.organization),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORGS_KEY }),
  });
}

export function usePatchOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchOrgInput }) =>
      api
        .patch<{ organization: Organization }>(`/v1/organizations/${id}`, input)
        .then((r) => r.organization),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORGS_KEY }),
  });
}

type OrgTransition = 'suspend' | 'reactivate' | 'archive' | 'restore';

export function useOrgTransition(transition: OrgTransition) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedRowVersion }: { id: string; expectedRowVersion?: number }) => {
      const body = transition === 'restore' ? {} : { expectedRowVersion };
      return api
        .post<{ organization: Organization }>(`/v1/organizations/${id}/${transition}`, body)
        .then((r) => r.organization);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ORGS_KEY }),
  });
}

export function useSoftDeleteOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedRowVersion }: { id: string; expectedRowVersion: number }) =>
      api
        .delete<{ organization: Organization }>(`/v1/organizations/${id}`, { expectedRowVersion })
        .then((r) => r.organization),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORGS_KEY }),
  });
}
