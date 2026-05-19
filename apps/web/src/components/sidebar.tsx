'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Boxes,
  FileSpreadsheet,
  LayoutDashboard,
  Lock,
  Megaphone,
  Settings,
  ShoppingBag,
  Truck,
  Upload,
} from 'lucide-react';
import { cn } from '@xb/ui/lib/cn';
import { useToast } from '@xb/ui';
import { useActiveWorkspace } from '@/lib/session';

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  /**
   * Module is workspace-scoped. When no active workspace is selected the
   * sidebar shows a Lock + dimmed state AND swallows clicks so the user
   * can't land on a module page that has nothing to show — a toast points
   * them at the topbar switcher instead.
   */
  readonly requiresWorkspace?: boolean;
}

const NAV: ReadonlyArray<NavItem> = [
  { label: 'Dashboard',     href: '/dashboard',     icon: LayoutDashboard },
  { label: 'Sales',         href: '/sales',         icon: ShoppingBag,    requiresWorkspace: true },
  { label: 'PPC',           href: '/ppc',           icon: Megaphone,      requiresWorkspace: true },
  { label: 'Inventory',     href: '/inventory',     icon: Boxes,          requiresWorkspace: true },
  { label: 'Shipments',     href: '/shipments',     icon: Truck,          requiresWorkspace: true },
  { label: 'Uploads',       href: '/uploads',       icon: Upload,         requiresWorkspace: true },
  { label: 'Reports',       href: '/reports',       icon: FileSpreadsheet, requiresWorkspace: true },
  { label: 'Unit Economics', href: '/unit-economics', icon: BarChart3,    requiresWorkspace: true },
  { label: 'Settings',      href: '/settings',      icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: activeWorkspace } = useActiveWorkspace();
  const toast = useToast();
  const hasActive = !!activeWorkspace;

  function onGatedClick(e: React.MouseEvent, label: string) {
    e.preventDefault();
    toast.push(
      'info',
      `${label} needs an active workspace. Pick one from the topbar switcher to unlock it.`,
    );
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-white lg:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-navy text-white">
          <span className="font-heading text-sm font-bold">xB</span>
        </div>
        <span className="font-heading text-base font-semibold text-foreground">Matrix</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const gated = item.requiresWorkspace && !hasActive;
          const rowClass = cn(
            'group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            active
              ? 'bg-navy text-white'
              : gated
                ? 'cursor-not-allowed text-foreground/40 hover:bg-muted/40 hover:text-foreground/60'
                : 'text-foreground/80 hover:bg-muted hover:text-foreground',
          );
          const body = (
            <>
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {gated ? (
                <Lock
                  className="h-3 w-3 opacity-60 group-hover:opacity-100"
                  aria-label="Needs a workspace"
                />
              ) : null}
            </>
          );
          // Render gated rows as buttons (no navigation) — Link would
          // silently navigate to the module page, where the user's only
          // option is to come back. The toast tells them where to fix it.
          if (gated) {
            return (
              <button
                key={item.href}
                type="button"
                aria-disabled="true"
                title="Select a workspace from the topbar switcher to enable this module."
                onClick={(e) => onGatedClick(e, item.label)}
                className={rowClass}
              >
                {body}
              </button>
            );
          }
          return (
            <Link key={item.href} href={item.href} className={rowClass}>
              {body}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3 text-xs text-muted-foreground">
        v0.1.0 · foundation
      </div>
    </aside>
  );
}
