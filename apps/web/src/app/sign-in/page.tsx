'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, FormField, Input, useToast } from '@xb/ui';
import { describeError, useSession, useSignIn } from '@/lib/session';

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInShell />}>
      <SignInForm />
    </Suspense>
  );
}

function SignInShell({ children }: { children?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-xb-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-navy text-white">
            <span className="font-heading text-sm font-bold">xB</span>
          </div>
          <div>
            <h1 className="font-heading text-xl font-semibold text-foreground">xB Matrix</h1>
            <p className="text-xs text-muted-foreground">Sign in to continue</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}

function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const { data: user } = useSession();
  const signIn = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const next = search?.get('next') ?? '/dashboard';

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, router, next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await signIn.mutateAsync({ email, password });
      toast.push('success', 'Signed in.');
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  return (
    <SignInShell>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label="Email" required>
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )}
        </FormField>

        <FormField label="Password" required>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
        </FormField>

        <Button type="submit" disabled={signIn.isPending || !email || !password}>
          {signIn.isPending ? 'Signing in…' : 'Continue'}
        </Button>

        <Link
          href="/forgot-password"
          className="text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Forgot password?
        </Link>
      </form>
    </SignInShell>
  );
}
