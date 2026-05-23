'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';

/**
 * App shell.
 *
 * Most routes render the full main sidebar + topbar chrome. Two
 * exceptions:
 *   - /select-workspace: full-screen, no chrome (freshly-signed-in
 *     user picks a workspace before the operational nav appears).
 *   - /academy/*: topbar stays, but the main app sidebar swaps for
 *     the Academy category sidebar (rendered by the academy layout
 *     via AcademyShell). The AppShell omits its own sidebar on
 *     these routes so the two don't stack.
 */
const NAV_HIDDEN_ROUTES = ['/select-workspace'];
const SIDEBAR_REPLACED_ROUTES = ['/academy'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const navHidden = NAV_HIDDEN_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + '/'),
  );
  const sidebarReplaced = SIDEBAR_REPLACED_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + '/'),
  );

  if (navHidden) {
    return <div className="h-screen overflow-auto bg-background">{children}</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarReplaced ? null : <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
