'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@xb/ui';
import { cn } from '@xb/ui/lib/cn';
import {
  ChevronDown,
  ChevronRight,
  Search,
  BookOpen,
  ArrowLeft,
} from 'lucide-react';
import {
  ACADEMY_CATEGORIES,
  articlesByCategory,
  searchArticles,
  type AcademyCategory,
} from '@/academy/index';

/**
 * Academy shell. Renders on every /academy/* route, replacing the
 * main app sidebar with the Academy category navigation (single-
 * sidebar pattern per project_academy_surface restructure spec).
 * Topbar stays via the parent (app) layout, so workspace switching
 * and the profile menu remain reachable.
 *
 * Structure:
 *   - Left column: persistent collapsible category nav, sticky
 *     search header pinned below the topbar.
 *   - Right column: doc-reader content (children).
 *
 * The sidebar drives client-side search and category filtering
 * over the typed article registry. Future search indexing /
 * role-aware article filtering layer in here.
 */
export function AcademyShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const [query, setQuery] = useState('');

  // Build the visible-tree from the registry, optionally filtered by
  // the search query. Empty query renders every category; non-empty
  // query collapses categories with zero matches.
  const tree = useMemo(() => {
    if (!query.trim()) return articlesByCategory();
    const matches = new Set(searchArticles(query).map((a) => a.meta.slug));
    return articlesByCategory()
      .map(({ category, articles }) => ({
        category,
        articles: articles.filter((a) => matches.has(a.meta.slug)),
      }))
      .filter((c) => c.articles.length > 0);
  }, [query]);

  return (
    <div className="flex min-h-full">
      <AcademySidebar
        tree={tree}
        query={query}
        onQueryChange={setQuery}
        activeSlug={extractSlug(pathname)}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-3xl px-6 py-8 lg:px-10 lg:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}

interface SidebarProps {
  readonly tree: ReadonlyArray<{
    category: AcademyCategory;
    articles: ReadonlyArray<{ meta: { slug: string; title: string; stub?: boolean } }>;
  }>;
  readonly query: string;
  readonly onQueryChange: (q: string) => void;
  readonly activeSlug: string | null;
}

function AcademySidebar({ tree, query, onQueryChange, activeSlug }: SidebarProps) {
  // Categories collapsed-by-default-when-inactive. The active
  // article's parent category stays expanded. Search auto-expands
  // every category that has matches.
  const searching = query.trim().length > 0;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  function toggle(category: AcademyCategory) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function isExpanded(category: AcademyCategory, hasActive: boolean): boolean {
    if (searching) return true;
    if (hasActive) return true;
    return !collapsed.has(category);
  }

  return (
    <aside className="sticky top-0 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
      {/* Sticky search header. Stays visible while the sidebar scrolls. */}
      <div className="sticky top-0 z-10 border-b border-border bg-card px-3 py-3">
        <Link
          href="/dashboard"
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to app
        </Link>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search Academy"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>
      </div>

      {/* Scrollable category list. */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {tree.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No articles match the search.
          </p>
        ) : (
          tree.map(({ category, articles }) => {
            const hasActive = activeSlug !== null && articles.some((a) => a.meta.slug === activeSlug);
            const expanded = isExpanded(category, hasActive);
            const ChevronIcon = expanded ? ChevronDown : ChevronRight;
            return (
              <div key={category} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggle(category)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronIcon className="h-3 w-3" />
                  <span className="flex-1">{category}</span>
                </button>
                {expanded ? (
                  <ul className="mt-0.5 space-y-0.5">
                    {articles.map((a) => {
                      const active = activeSlug === a.meta.slug;
                      return (
                        <li key={a.meta.slug}>
                          <Link
                            href={`/academy/${a.meta.slug}`}
                            className={cn(
                              'relative flex items-center gap-2 rounded-md px-5 py-1.5 text-sm transition-colors',
                              active
                                ? 'bg-accent/10 font-medium text-accent before:absolute before:left-2 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-accent'
                                : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                            )}
                          >
                            <span className="flex-1 truncate">{a.meta.title}</span>
                            {a.meta.stub ? (
                              <Badge tone="neutral" className="text-[9px]">
                                Soon
                              </Badge>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })
        )}
      </nav>

      <div className="border-t border-border px-3 py-3 text-[10px] text-muted-foreground">
        <div className="inline-flex items-center gap-1.5">
          <BookOpen className="h-3 w-3 text-accent" />
          <span>Academy</span>
        </div>
      </div>
    </aside>
  );
}

function extractSlug(pathname: string): string | null {
  const match = pathname.match(/^\/academy\/([^/]+)/);
  return match ? match[1]! : null;
}

export { ACADEMY_CATEGORIES };
