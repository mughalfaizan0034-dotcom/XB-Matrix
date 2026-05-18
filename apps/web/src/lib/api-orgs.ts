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

export function useOrganizations() {
  return useQuery({
    queryKey: ORGS_KEY,
    queryFn: () =>
      api.get<Paginated<Organization>>('/v1/organizations').then((r) => r.items),
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
