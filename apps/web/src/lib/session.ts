'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, ApiError } from './api-client';

export interface SessionUser {
  readonly userId: string;
  readonly actorId: string;
  readonly actorKind: 'internal_user' | 'organization_user' | 'system' | 'api_key' | 'ai_agent' | 'system_job' | 'connector';
  readonly effectiveRole:
    | 'internal_manager'
    | 'internal_staff'
    | 'organization_admin'
    | 'organization_user'
    | 'ai_agent'
    | 'system';
  readonly organizationId: string | null;
  readonly email: string;
  readonly displayName: string;
  readonly userKind: 'internal' | 'organization';
  readonly role: string | null;
  readonly isInternalManager: boolean;
}

interface MeResponse {
  readonly user: SessionUser | null;
}

interface SignInResponse {
  readonly user: SessionUser;
}

export const SESSION_QUERY_KEY = ['session', 'me'] as const;

export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => api.get<MeResponse>('/v1/auth/me').then((r) => r.user),
    staleTime: 60_000,
    retry: false,
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      api.post<SignInResponse>('/v1/auth/sign-in', vars),
    onSuccess: (data) => {
      qc.setQueryData(SESSION_QUERY_KEY, data.user);
      router.push('/dashboard');
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api.post<{ signedOut: boolean }>('/v1/auth/sign-out'),
    onSuccess: () => {
      qc.setQueryData(SESSION_QUERY_KEY, null);
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
