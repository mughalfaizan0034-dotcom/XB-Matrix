'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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

        <div className="mt-6 border-t border-border pt-4 text-center">
          <a
            href="https://xceleratebrands.com/testimonials-reviews"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Powered by{' '}
            <span className="font-medium text-foreground">Xcelerate Brands</span>
          </a>
        </div>
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const next = search?.get('next') ?? '/dashboard';

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, router, next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await signIn.mutateAsync({ username, password, rememberDevice });
      toast.push('success', 'Signed in.');
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  return (
    <SignInShell>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label="Username" required>
          {(p) => (
            <Input
              {...p}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={120}
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

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={(e) => setRememberDevice(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <span>Remember this device for 30 days</span>
        </label>

        <Button type="submit" disabled={signIn.isPending || !username || !password}>
          {signIn.isPending ? 'Signing in…' : 'Continue'}
        </Button>

        {/*
          Forgot-password is removed until email infrastructure
          (resend.com) is wired. Until then, an administrator can
          reset a user's password directly from Settings → Users.
        */}
      </form>
    </SignInShell>
  );
}
