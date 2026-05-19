'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@xb/ui';
import { verifyEmail } from '@/lib/api-users';
import { ApiError } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { SESSION_QUERY_KEY } from '@/lib/session';

type State = 'verifying' | 'success' | 'error';

export default function VerifyEmailPage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(params?.token ?? '');
  const router = useRouter();
  const qc = useQueryClient();
  const [state, setState] = useState<State>('verifying');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('No verification token in the URL.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await verifyEmail(token);
        if (cancelled) return;
        qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
        setState('success');
        setMessage('Your email is verified.');
      } catch (err) {
        if (cancelled) return;
        setState('error');
        setMessage(err instanceof ApiError ? err.message : 'Verification failed.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, qc]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-xb-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-navy text-white">
            <span className="font-heading text-sm font-bold">xB</span>
          </div>
          <div>
            <h1 className="font-heading text-xl font-semibold text-foreground">xB Matrix</h1>
            <p className="text-xs text-muted-foreground">Email verification</p>
          </div>
        </div>

        {state === 'verifying' ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Verifying…</div>
        ) : state === 'success' ? (
          <div className="space-y-4">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              {message}
            </div>
            <Button onClick={() => router.replace('/dashboard')} className="w-full">
              Continue to dashboard
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              {message}
            </div>
            <Link
              href="/sign-in"
              className="block text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
