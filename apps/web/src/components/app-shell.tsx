'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';

/**
 * App shell. On most routes it renders the full sidebar + topbar
 * chrome. On the workspace picker (where a freshly-signed-in user
 * lands before choosing a workspace) the nav is hidden — the user
 * picks a workspace first, then the full chrome appears.
 */
const NAV_HIDDEN_ROUTES = ['/select-workspace'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const navHidden = NAV_HIDDEN_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + '/'),
  );

  if (navHidden) {
    return <div className="h-screen overflow-auto bg-background">{children}</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
