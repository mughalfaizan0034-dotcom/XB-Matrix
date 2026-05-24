'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';

/**
 * Landing route. The platform has no public marketing surface, the
 * root URL is an authentication-aware redirect:
 *
 *   - session resolves to a user  -> /dashboard
 *     (the dashboard route handles its own no-workspace bounce via
 *      the existing /select-workspace guard; the academy-shell logo
 *      handles the no-workspace case independently)
 *   - session resolves to null    -> /sign-in
 *
 * While the session query is in flight we render a minimal skeleton
 * instead of bouncing eagerly, otherwise a transient hiccup would
 * eject a signed-in user back to the sign-in screen.
 */
export default function RootPage() {
  const router = useRouter();
  const { data: user, isLoading } = useSession();

  useEffect(() => {
    if (isLoading) return;
    router.replace(user ? '/dashboard' : '/sign-in');
  }, [user, isLoading, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div
        className="h-9 w-9 animate-pulse rounded-md bg-navy"
        aria-label="Loading"
      />
    </main>
  );
}
