'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, LogOut, Search } from 'lucide-react';
import { cn } from '@xb/ui/lib/cn';
import { useSession, useSignOut, describeError } from '@/lib/session';
import { useToast } from '@xb/ui';

export function Topbar() {
  const { data: user } = useSession();
  const signOut = useSignOut();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

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
      </div>
      <div className="flex items-center gap-3">
        {user ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={cn(
                'flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm transition-colors',
                'hover:bg-muted',
                open && 'border-border bg-muted',
              )}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">
                {initials}
              </div>
              <div className="hidden text-left leading-tight md:block">
                <div className="text-xs font-medium text-foreground">{user.displayName}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {user.effectiveRole.replace('_', ' ')}
                </div>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {open ? (
              <div className="absolute right-0 mt-1 w-60 rounded-md border border-border bg-card p-1 shadow-xb-md">
                <div className="border-b border-border px-3 py-2.5">
                  <div className="text-sm font-medium text-foreground">{user.displayName}</div>
                  <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  disabled={signOut.isPending}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
