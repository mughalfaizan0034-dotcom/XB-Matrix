'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LifeBuoy, LogOut, Search, UserCircle } from 'lucide-react';
import { DropdownMenu, useToast, type DropdownMenuItem } from '@xb/ui';
import { cn } from '@xb/ui/lib/cn';
import { useSession, useSignOut, describeError } from '@/lib/session';
import { roleLabel } from '@/lib/role-labels';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';
import { ProfileDialog } from '@/components/profile-dialog';
import { NotificationCenter } from '@/components/notification-center';

export function Topbar() {
  const { data: user } = useSession();
  const signOut = useSignOut();
  const toast = useToast();
  const router = useRouter();
  const [showProfile, setShowProfile] = useState(false);

  async function onSignOut() {
    try {
      await signOut.mutateAsync();
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  const initials = (user?.displayName ?? user?.email ?? '?')
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const menuItems: DropdownMenuItem[] = [
    {
      key: 'profile',
      label: 'Profile',
      icon: UserCircle,
      onSelect: () => setShowProfile(true),
    },
    {
      key: 'support',
      label: 'Manage Support Tickets',
      icon: LifeBuoy,
      onSelect: () => router.push('/support'),
      divider: true,
    },
    {
      key: 'sign-out',
      label: signOut.isPending ? 'Signing out…' : 'Sign out',
      icon: LogOut,
      disabled: signOut.isPending,
      onSelect: onSignOut,
    },
  ];

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-white/85 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground md:flex">
          <Search className="h-3.5 w-3.5" />
          <span>Search…</span>
          <kbd className="ml-2 rounded bg-muted px-1.5 py-0.5 font-sans text-[10px] font-semibold text-muted-foreground">
            ⌘K
          </kbd>
        </div>
        {user ? <WorkspaceSwitcher /> : null}
      </div>
      <div className="flex items-center gap-2">
        {user ? <NotificationCenter /> : null}
        {user ? (
          <DropdownMenu
            align="end"
            width="w-64"
            trigger={
              <span
                className={cn(
                  'flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm transition-colors',
                  'hover:bg-muted',
                )}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">
                  {initials}
                </span>
                <span className="hidden text-left leading-tight md:block">
                  <span className="block text-xs font-medium text-foreground">{user.displayName}</span>
                  <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                    {roleLabel(user.effectiveRole)}
                  </span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            }
            header={
              <div>
                <div className="text-sm font-medium text-foreground">{user.displayName}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
            }
            items={menuItems}
          />
        ) : null}
      </div>

      <ProfileDialog open={showProfile} onClose={() => setShowProfile(false)} />
    </header>
  );
}
