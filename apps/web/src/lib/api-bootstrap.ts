'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

/**
 * Hooks for the temporary bootstrap / testing tools.
 * See apps/api/src/routes/bootstrap.ts for the matching backend
 * (internal-manager-only).
 */

export type BootstrapRole =
  | 'internal_manager'
  | 'internal_staff'
  | 'organization_admin'
  | 'organization_user';

export interface BootstrapUserInput {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
  readonly role: BootstrapRole;
  readonly organizationId?: string | null;
  readonly markEmailVerified?: boolean;
}

export interface BootstrappedUser {
  readonly userId: string;
  readonly actorId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: BootstrapRole;
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  readonly emailVerified: boolean;
}

export function useBootstrapUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BootstrapUserInput) =>
      api
        .post<{ user: BootstrappedUser }>('/v1/bootstrap/user', input)
        .then((r) => r.user),
    onSuccess: () => {
      // Invalidate users + organizations caches so the new user shows up
      // immediately in any open management surface.
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export interface ResolverProbe {
  readonly module: string;
  readonly action: string;
  readonly organizationId: string | null;
  readonly workspaceId: string | null;
  readonly allowed: boolean;
  readonly source: string;
  readonly reason?: string;
}

export interface DebugContext {
  readonly actor: {
    readonly actorId: string;
    readonly actorKind: string;
    readonly effectiveRole: string;
    readonly organizationId: string | null;
    readonly isInternalManager: boolean;
    readonly sessionId: string | null;
  };
  readonly organizations: ReadonlyArray<{
    readonly id: string;
    readonly displayName: string;
    readonly organizationStatus: string;
  }>;
  readonly workspaces: ReadonlyArray<{
    readonly id: string;
    readonly workspaceName: string;
    readonly organizationId: string;
    readonly organizationName: string;
    readonly workspaceStatus: string;
  }>;
  readonly resolverProbes: ReadonlyArray<ResolverProbe>;
}

export function useDebugContext(enabled: boolean) {
  return useQuery({
    queryKey: ['bootstrap', 'debug-context'],
    queryFn: () => api.get<DebugContext>('/v1/bootstrap/debug-context'),
    enabled,
    staleTime: 30_000,
  });
}
