'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from '@/lib/session';

/**
 * Client-side guard for authenticated routes. Redirects to /sign-in if the
 * session query resolves to null. While loading, renders a subtle placeholder.
 *
 * Backend re-checks every request — this is UI shaping, not access control.
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
