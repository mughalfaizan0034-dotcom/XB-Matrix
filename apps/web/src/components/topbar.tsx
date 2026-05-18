'use client';

import { Search } from 'lucide-react';

export function Topbar() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-white/80 px-6 backdrop-blur">
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
        <div className="text-sm text-muted-foreground">Workspace · Default</div>
        <div className="h-8 w-8 rounded-full bg-navy-100 ring-1 ring-border" />
      </div>
    </header>
  );
}
