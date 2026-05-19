'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, FormField, Input, useToast } from '@xb/ui';
import { SESSION_QUERY_KEY } from '@/lib/session';
import { useQueryClient } from '@tanstack/react-query';
import { acceptInvitation } from '@/lib/api-users';
import { ApiError } from '@/lib/api-client';
import Link from 'next/link';

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<Shell title="Set your password" />}>
      <AcceptInviteForm />
    </Suspense>
  );
}

function AcceptInviteForm() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search?.get('token') ?? '';
  const toast = useToast();
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) setError('No invitation token in the URL.');
  }, [token]);

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
      const result = await acceptInvitation(token, password);
      qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      toast.push('success', `Welcome, ${result.displayName}.`);
      router.replace('/dashboard');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Unable to accept invitation.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell title="Set your password">
      {error ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <p className="mb-4 text-sm text-muted-foreground">
        Pick a strong password to activate your account. We&apos;ll sign you in straight away.
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
          {submitting ? 'Activating…' : 'Activate account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-xb-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-navy text-white">
            <span className="font-heading text-sm font-bold">xB</span>
          </div>
          <div>
            <h1 className="font-heading text-xl font-semibold text-foreground">xB Matrix</h1>
            <p className="text-xs text-muted-foreground">{title}</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
