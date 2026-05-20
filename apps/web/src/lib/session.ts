'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, ApiError } from './api-client';

export interface SessionUser {
  readonly userId: string;
  readonly actorId: string;
  readonly actorKind: 'internal_user' | 'organization_user' | 'system' | 'api_key' | 'ai_agent' | 'system_job' | 'connector';
  readonly effectiveRole:
    | 'super_admin'
    | 'internal_manager'
    | 'internal_staff'
    | 'organization_admin'
    | 'organization_user'
    | 'ai_agent'
    | 'system';
  readonly organizationId: string | null;
  readonly username: string;
  /** Email is optional in the auth-pivot phase — admins create users without one. */
  readonly email: string | null;
  readonly displayName: string;
  readonly userKind: 'internal' | 'organization';
  readonly role: string | null;
  readonly isInternalManager: boolean;
  readonly emailVerifiedAt: string | null;
}

export interface ActiveWorkspaceSummary {
  readonly id: string;
  readonly workspaceName: string;
  readonly workspaceType: string | null;
  readonly workspaceStatus: 'active' | 'archived';
  readonly organizationId: string;
  readonly organizationName: string;
}

interface MeResponse {
  readonly user: SessionUser | null;
  readonly activeWorkspace: ActiveWorkspaceSummary | null;
}

interface SignInResponse {
  readonly user: SessionUser;
}

export const SESSION_QUERY_KEY = ['session', 'me'] as const;

export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => api.get<MeResponse>('/v1/auth/me'),
    staleTime: 60_000,
    retry: false,
    select: (data) => data.user,
  });
}

/**
 * Reads the active workspace from the same /me cache `useSession` uses, so
 * we share one round trip per page load.
 */
export function useActiveWorkspace() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => api.get<MeResponse>('/v1/auth/me'),
    staleTime: 60_000,
    retry: false,
    select: (data) => data.activeWorkspace,
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (vars: { username: string; password: string; rememberDevice?: boolean }) =>
      api.post<SignInResponse>('/v1/auth/sign-in', vars),
    onSuccess: (data) => {
      // Sign-in returns just the user; the session starts with no active
      // workspace selected. Seed the cache shape so consumers don't have
      // to wait for /me to re-fetch.
      qc.setQueryData(SESSION_QUERY_KEY, { user: data.user, activeWorkspace: null });
      // Land on the workspace picker (nav hidden) — the user chooses a
      // workspace, then the full app chrome appears.
      router.push('/select-workspace');
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api.post<{ signedOut: boolean }>('/v1/auth/sign-out'),
    onSuccess: () => {
      qc.setQueryData(SESSION_QUERY_KEY, { user: null, activeWorkspace: null });
      qc.invalidateQueries();
      router.push('/sign-in');
    },
  });
}

export function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'unexpected error';
}
