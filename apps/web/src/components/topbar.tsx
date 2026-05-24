'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  ChevronDown,
  FileText,
  LifeBuoy,
  LogOut,
  MessageCircle,
  Search,
  Ticket,
  UserCircle,
} from 'lucide-react';
import { DropdownMenu, useToast, type DropdownMenuItem } from '@xb/ui';
import { cn } from '@xb/ui/lib/cn';
import { useSession, useSignOut, describeError } from '@/lib/session';
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

  // Help menu groups all learning + support entry points together so
  // the topbar stays a clean [Bell] [Help] [Avatar] triad. Documentation
  // and Contact Support are placeholder slots; they wire up to real
  // routes when those surfaces ship. They render disabled today so the
  // mental model is visible without false-affordance navigation.
  const helpItems: DropdownMenuItem[] = [
    {
      key: 'academy',
      label: 'Academy',
      icon: BookOpen,
      onSelect: () => router.push('/academy'),
    },
    {
      key: 'tickets',
      label: 'Support Tickets',
      icon: Ticket,
      onSelect: () => router.push('/support'),
      divider: true,
    },
    {
      key: 'docs',
      label: 'Documentation',
      icon: FileText,
      disabled: true,
      onSelect: () => undefined,
    },
    {
      key: 'contact',
      label: 'Contact Support',
      icon: MessageCircle,
      disabled: true,
      onSelect: () => undefined,
    },
  ];

  // Profile dropdown holds only account-level actions now.
  const profileItems: DropdownMenuItem[] = [
    {
      key: 'profile',
      label: 'Edit Profile',
      icon: UserCircle,
      onSelect: () => setShowProfile(true),
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
      <div className="flex items-center gap-1">
        {user ? <NotificationCenter /> : null}
        {user ? (
          <DropdownMenu
            align="end"
            width="w-56"
            trigger={
              <span
                aria-label="Help and resources"
                title="Help and resources"
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
                  'hover:bg-muted hover:text-foreground',
                )}
              >
                <LifeBuoy className="h-4 w-4" />
              </span>
            }
            items={helpItems}
          />
        ) : null}
        {user ? (
          <DropdownMenu
            align="end"
            width="w-56"
            trigger={
              <span
                aria-label="Account menu"
                title="Account menu"
                className={cn(
                  'ml-1 flex items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1.5 text-sm transition-colors',
                  'hover:bg-muted',
                )}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">
                  {initials}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            }
            items={profileItems}
          />
        ) : null}
      </div>

      <ProfileDialog open={showProfile} onClose={() => setShowProfile(false)} />
    </header>
  );
}
