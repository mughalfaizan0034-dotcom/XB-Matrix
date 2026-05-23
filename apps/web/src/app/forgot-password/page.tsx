'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, FormField, Input } from '@xb/ui';
import { forgotPassword } from '@/lib/api-users';
import { ApiError } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'rate_limited') {
        setError(err.message);
      } else {
        // Always succeed visually, we never leak whether an email exists.
        setSubmitted(true);
      }
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
            <p className="text-xs text-muted-foreground">Reset your password</p>
          </div>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              If an account exists for <strong>{email}</strong>, a password reset link has been sent.
              Check your inbox (and spam folder).
            </div>
            <p className="text-xs text-muted-foreground">
              The link expires in 1 hour. If you don&apos;t receive it, you can{' '}
              <button
                type="button"
                className="text-foreground underline-offset-4 hover:underline"
                onClick={() => setSubmitted(false)}
              >
                try again
              </button>
              .
            </p>
            <Link
              href="/sign-in"
              className="block text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Enter the email address on your account. If it matches an active user, we&apos;ll send
              a link to set a new password.
            </p>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <FormField label="Email" required>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              )}
            </FormField>

            <Button type="submit" disabled={submitting || !email}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </Button>

            <Link
              href="/sign-in"
              className="text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
