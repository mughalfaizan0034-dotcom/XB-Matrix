'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { Button, FormField, Input, useToast } from '@xb/ui';
import { resetPassword } from '@/lib/api-users';
import { ApiError } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { SESSION_QUERY_KEY } from '@/lib/session';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(params?.token ?? '');
  const toast = useToast();
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordError =
    password.length === 0
      ? null
      : password.length < 12
        ? 'Password must be at least 12 characters.'
        : null;
  const confirmError =
    confirm.length === 0 ? null : confirm !== password ? 'Passwords do not match.' : null;
  const canSubmit =
    !submitting && password.length >= 12 && confirm === password && token.length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      // Backend revoked all sessions; clear cached "me" so the UI knows.
      qc.setQueryData(SESSION_QUERY_KEY, null);
      toast.push('success', 'Password updated. Please sign in with your new password.');
      router.replace('/sign-in');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reset password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-xb-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-navy text-white">
            <span className="font-heading text-sm font-bold">xB</span>
          </div>
          <div>
            <h1 className="font-heading text-xl font-semibold text-foreground">xB Matrix</h1>
            <p className="text-xs text-muted-foreground">Choose a new password</p>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
            <div className="mt-2 text-xs">
              <Link href="/forgot-password" className="underline-offset-4 hover:underline">
                Request a new reset link
              </Link>
            </div>
          </div>
        ) : null}

        <p className="mb-4 text-sm text-muted-foreground">
          Setting a new password will sign you out of all sessions on every device.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField label="New password" required error={passwordError}>
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            )}
          </FormField>

          <FormField label="Confirm password" required error={confirmError}>
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            )}
          </FormField>

          <Button type="submit" disabled={!canSubmit}>
            {submitting ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </div>
    </main>
  );
}
