'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@xb/types';
import { api } from './api-client';

export interface UserSummary {
  readonly id: string;
  readonly actorId: string;
  readonly username: string;
  /** Email is optional in the auth-pivot phase. */
  readonly email: string | null;
  readonly displayName: string;
  readonly userKind: 'internal' | 'organization';
  readonly organizationId: string | null;
  readonly internalRole: 'super_admin' | 'manager' | 'staff' | null;
  readonly orgRole: 'admin' | 'user' | null;
  readonly status: 'active' | 'deactivated' | 'pending_invite';
  readonly emailVerifiedAt: string | null;
  readonly lastLoginAt: string | null;
  readonly createdAt: string;
  readonly rowVersion: number;
}

// --- Direct user creation (PRIMARY path 2026-05-20) -----------------

export type CreateUserRole =
  | 'super_admin'
  | 'internal_manager'
  | 'internal_staff'
  | 'organization_admin'
  | 'organization_user';

export interface CreateUserInput {
  readonly username: string;
  readonly displayName: string;
  readonly password: string;
  readonly role: CreateUserRole;
  readonly organizationId?: string | null;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      api.post<{ user: UserSummary }>('/v1/users', input).then((r) => r.user),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: usersKey(u.organizationId) });
    },
  });
}

export function useAdminResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post<{ reset: boolean }>(`/v1/users/${id}/reset-password`, { password }),
  });
}

/** Remove a user — soft delete. Idempotent, no row-version required. */
export function useRemoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; organizationId: string | null }) =>
      api.post<{ removed: boolean }>(`/v1/users/${id}/remove`),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: usersKey(vars.organizationId) });
    },
  });
}

export function usersKey(orgId: string | null): readonly string[] {
  return ['users', orgId ?? 'platform'];
}

export function useUsers(opts: { organizationId?: string | null } = {}) {
  const orgId = opts.organizationId ?? null;
  return useQuery({
    queryKey: usersKey(orgId),
    queryFn: () => {
      const qs = orgId ? `?organizationId=${encodeURIComponent(orgId)}` : '';
      return api.get<Paginated<UserSummary>>(`/v1/users${qs}`).then((r) => r.items);
    },
    staleTime: 15_000,
    enabled: orgId !== null,
  });
}

/**
 * Internal XB Matrix staff — super_admin / internal_manager /
 * internal_staff (organization_id IS NULL). The platform-administration
 * layer, kept separate from customer/tenant users. The API returns
 * internal users when /v1/users is called with no organizationId.
 */
export function useInternalUsers() {
  return useQuery({
    queryKey: usersKey(null),
    queryFn: () => api.get<Paginated<UserSummary>>('/v1/users').then((r) => r.items),
    staleTime: 15_000,
  });
}

type UserTransition = 'deactivate' | 'reactivate';

export function useUserTransition(transition: UserTransition) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedRowVersion }: { id: string; expectedRowVersion: number }) =>
      api
        .post<{ user: UserSummary }>(`/v1/users/${id}/${transition}`, { expectedRowVersion })
        .then((r) => r.user),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: usersKey(u.organizationId) });
    },
  });
}

// --- Invitations ---

export type InviteRole =
  | 'internal_manager'
  | 'internal_staff'
  | 'organization_admin'
  | 'organization_user';

export interface InvitationView {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  readonly role: InviteRole;
  readonly expiresAt: string;
  readonly acceptUrl: string;
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      email: string;
      displayName: string;
      role: InviteRole;
      organizationId: string | null;
    }) =>
      api
        .post<{ invitation: InvitationView }>('/v1/invitations', input)
        .then((r) => r.invitation),
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: usersKey(inv.organizationId) });
    },
  });
}

export function useResendInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api
        .post<{ invitation: InvitationView }>(`/v1/invitations/${userId}/resend`, {})
        .then((r) => r.invitation),
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: usersKey(inv.organizationId) });
    },
  });
}

export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; organizationId: string | null }) =>
      api.post<{ revoked: boolean }>(`/v1/invitations/${id}/revoke`, {}).then((r) => r),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: usersKey(vars.organizationId) });
    },
  });
}

// --- Public auth flows ---

export async function acceptInvitation(token: string, password: string) {
  return api.post<{ userId: string; email: string; displayName: string }>(
    '/v1/invitations/accept',
    { token, password },
  );
}

export async function forgotPassword(email: string) {
  return api.post<{ sent: boolean; message: string }>('/v1/auth/forgot-password', { email });
}

export async function resetPassword(token: string, password: string) {
  return api.post<{ reset: boolean }>('/v1/auth/reset-password', { token, password });
}

export async function verifyEmail(token: string) {
  return api.post<{ verified: boolean }>('/v1/auth/verify-email', { token });
}

export async function resendVerification() {
  return api.post<{ sent?: boolean; alreadyVerified?: boolean }>(
    '/v1/auth/resend-verification',
    {},
  );
}
