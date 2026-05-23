'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from '@/lib/session';

/**
 * Client-side guard for authenticated routes. Redirects to /sign-in if the
 * session query resolves to null. While loading, renders a subtle placeholder.
 *
 * Backend re-checks every request, this is UI shaping, not access control.
 */
export function Protected({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading && user === null) {
      const next = encodeURIComponent(pathname || '/dashboard');
      router.replace(`/sign-in?next=${next}`);
    }
  }, [isLoading, user, router, pathname]);

  // No auto-select: the active workspace is a secured operational
  // context and must be chosen explicitly. Sign-in routes to
  // /select-workspace; until a workspace is pinned the app stays in
  // read-only "All workspaces" mode.

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}
