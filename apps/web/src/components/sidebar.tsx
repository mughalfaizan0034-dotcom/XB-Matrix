'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Boxes,
  FileSpreadsheet,
  LayoutDashboard,
  Megaphone,
  Package,
  Settings,
  ShoppingBag,
  Truck,
  Upload,
} from 'lucide-react';
import { cn } from '@xb/ui/lib/cn';
import { useSession } from '@/lib/session';
import { useAccessibleWorkspaces } from '@/lib/api-workspaces-switch';

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: React.ComponentType<{ className?: string }>;
}

const NAV: ReadonlyArray<NavItem> = [
  { label: 'Dashboard',     href: '/dashboard'      , icon: LayoutDashboard },
  { label: 'Sales',         href: '/sales'          , icon: ShoppingBag },
  { label: 'Advertisements', href: '/ppc'           , icon: Megaphone },
  { label: 'Inventory',     href: '/inventory'      , icon: Boxes },
  { label: 'Shipments',     href: '/shipments'      , icon: Truck },
  { label: 'Uploads',       href: '/uploads'        , icon: Upload },
  { label: 'Reports',       href: '/reports'        , icon: FileSpreadsheet },
  { label: 'Unit Economics', href: '/unit-economics', icon: BarChart3 },
  { label: 'SKU Aliases',   href: '/sku-aliases'    , icon: Package },
  { label: 'Settings',      href: '/settings'       , icon: Settings },
];

/**
 * Nav rows always navigate — every workspace-scoped page handles its
 * own "pick a workspace" empty state.
 *
 * Visibility: organization users with NO accessible workspaces collapse
 * the nav to Settings only. There's nothing useful for them on Dashboard
 * / Sales / Uploads / etc. without a workspace, and Settings still
 * hosts the self-service profile (display name + password change). The
 * full nav returns the moment an admin grants them workspace access.
 *
 * Internal users (super_admin / internal_manager / internal_staff) keep
 * the full nav regardless — they always have platform context to work
 * with via /select-workspace.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { data: user } = useSession();
  const { data: accessible } = useAccessibleWorkspaces();

  const isOrgUserWithNoWorkspaces =
    user?.userKind === 'organization' && (accessible?.length ?? 0) === 0;
  const visibleNav = isOrgUserWithNoWorkspaces
    ? NAV.filter((item) => item.href === '/settings')
    : NAV;

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-white lg:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-navy text-white">
          <span className="font-heading text-sm font-bold">xB</span>
        </div>
        <span className="font-heading text-base font-semibold text-foreground">Matrix</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                active
                  ? 'bg-navy text-white'
                  : 'text-foreground/80 hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3 text-xs text-muted-foreground">
        {/* Stays below V1.0.0 until the final launch. Bump on every push —
            patch most of the time, minor for bigger slices. */}
        V0.18.7
      </div>
    </aside>
  );
}
