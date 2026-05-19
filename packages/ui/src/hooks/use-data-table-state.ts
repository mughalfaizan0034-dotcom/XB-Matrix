'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SortState } from '../components/data-table.js';

export interface DataTableState {
  readonly page: number;
  readonly pageSize: number;
  readonly sort: SortState | null;
  readonly search: string;
  readonly filters: Record<string, string | string[] | null>;
  readonly columnVisibility: Record<string, boolean>;
  readonly density: 'compact' | 'comfortable';
  readonly selectedRowKeys: string[];
}

export interface DataTableStateActions {
  readonly setPage: (n: number) => void;
  readonly setPageSize: (n: number) => void;
  readonly setSort: (s: SortState | null) => void;
  readonly setSearch: (s: string) => void;
  readonly setFilter: (key: string, value: string | string[] | null) => void;
  readonly clearFilter: (key: string) => void;
  readonly clearAllFilters: () => void;
  readonly setColumnVisibility: (v: Record<string, boolean>) => void;
  readonly setDensity: (d: 'compact' | 'comfortable') => void;
  readonly setSelectedRowKeys: (keys: string[]) => void;
}

export interface UseDataTableStateOptions {
  /**
   * Storage key prefix for localStorage-persisted preferences (density,
   * column visibility, pageSize). Pass a stable string like
   * `'orgs-table'` so the same table preserves its preferences across
   * reloads but doesn't collide with other tables.
   */
  readonly storageKey: string;
  /**
   * URL-state key prefix. When set, sort/search/filters/page sync to
   * the URL search params with this prefix (e.g., `?orgs.q=foo`). Skip
   * for tables in dialogs/drawers where URL sync would be noisy.
   */
  readonly urlKey?: string;
  readonly defaultPageSize?: number;
  readonly defaultDensity?: 'compact' | 'comfortable';
  readonly defaultSort?: SortState | null;
  /** Pre-set column visibility for known-hidden columns. */
  readonly defaultColumnVisibility?: Record<string, boolean>;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Owns all table state for one table instance:
 *   - sort / search / filters / page (URL-synced when urlKey is set)
 *   - density / column visibility / page size (localStorage-persisted)
 *   - row selection (in-memory only; reloading is the natural reset)
 *
 * URL sync uses the History API directly (no Next.js router push) to
 * avoid spurious re-renders of unrelated trees. localStorage writes are
 * SSR-safe (guarded by `typeof window`).
 */
export function useDataTableState(opts: UseDataTableStateOptions): readonly [DataTableState, DataTableStateActions] {
  const { storageKey, urlKey, defaultPageSize = DEFAULT_PAGE_SIZE, defaultDensity = 'comfortable', defaultSort = null, defaultColumnVisibility } = opts;

  // ---- localStorage-persisted preferences ----
  const [pageSize, setPageSizeRaw] = useState<number>(() =>
    readNum(`${storageKey}:pageSize`, defaultPageSize),
  );
  const [density, setDensityRaw] = useState<'compact' | 'comfortable'>(() =>
    (readStr(`${storageKey}:density`, defaultDensity) as 'compact' | 'comfortable') ?? defaultDensity,
  );
  const [columnVisibility, setColumnVisibilityRaw] = useState<Record<string, boolean>>(() =>
    readJSON(`${storageKey}:columnVisibility`, defaultColumnVisibility ?? {}),
  );

  // ---- URL-synced state ----
  const urlParams = useMemo(() => (urlKey ? readUrlParams(urlKey) : null), [urlKey]);
  const [page, setPageRaw] = useState<number>(urlParams?.page ?? 0);
  const [sort, setSortRaw] = useState<SortState | null>(urlParams?.sort ?? defaultSort);
  const [search, setSearchRaw] = useState<string>(urlParams?.search ?? '');
  const [filters, setFiltersRaw] = useState<Record<string, string | string[] | null>>(
    urlParams?.filters ?? {},
  );

  // ---- in-memory only ----
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  // Push URL on relevant state changes (debounced via rAF so rapid
  // keystrokes don't flood the history stack).
  const urlSyncQueued = useRef<number | null>(null);
  useEffect(() => {
    if (!urlKey) return;
    if (urlSyncQueued.current) cancelAnimationFrame(urlSyncQueued.current);
    urlSyncQueued.current = requestAnimationFrame(() => {
      writeUrlParams(urlKey, { page, sort, search, filters });
      urlSyncQueued.current = null;
    });
    return () => {
      if (urlSyncQueued.current) cancelAnimationFrame(urlSyncQueued.current);
    };
  }, [urlKey, page, sort, search, filters]);

  // Persist preference changes.
  useEffect(() => writeNum(`${storageKey}:pageSize`, pageSize), [storageKey, pageSize]);
  useEffect(() => writeStr(`${storageKey}:density`, density), [storageKey, density]);
  useEffect(() => writeJSON(`${storageKey}:columnVisibility`, columnVisibility), [storageKey, columnVisibility]);

  // Wrapped setters reset page on changes that invalidate the current page.
  const setSort = useCallback((s: SortState | null) => {
    setSortRaw(s);
    setPageRaw(0);
  }, []);
  const setSearch = useCallback((s: string) => {
    setSearchRaw(s);
    setPageRaw(0);
  }, []);
  const setFilter = useCallback((key: string, value: string | string[] | null) => {
    setFiltersRaw((cur) => {
      const next = { ...cur };
      if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) delete next[key];
      else next[key] = value;
      return next;
    });
    setPageRaw(0);
  }, []);
  const clearFilter = useCallback((key: string) => {
    setFiltersRaw((cur) => {
      if (!(key in cur)) return cur;
      const next = { ...cur };
      delete next[key];
      return next;
    });
    setPageRaw(0);
  }, []);
  const clearAllFilters = useCallback(() => {
    setFiltersRaw({});
    setSearchRaw('');
    setPageRaw(0);
  }, []);
  const setPage = useCallback((n: number) => setPageRaw(Math.max(0, n)), []);
  const setPageSize = useCallback((n: number) => {
    setPageSizeRaw(n);
    setPageRaw(0);
  }, []);
  const setColumnVisibility = useCallback(
    (v: Record<string, boolean>) => setColumnVisibilityRaw(v),
    [],
  );
  const setDensity = useCallback((d: 'compact' | 'comfortable') => setDensityRaw(d), []);

  const state: DataTableState = {
    page,
    pageSize,
    sort,
    search,
    filters,
    columnVisibility,
    density,
    selectedRowKeys,
  };
  const actions: DataTableStateActions = {
    setPage,
    setPageSize,
    setSort,
    setSearch,
    setFilter,
    clearFilter,
    clearAllFilters,
    setColumnVisibility,
    setDensity,
    setSelectedRowKeys,
  };
  return [state, actions] as const;
}

// ---- storage helpers (SSR-safe) ---------------------------------------------

function readStr(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function readNum(key: string, fallback: number): number {
  const s = readStr(key, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function readJSON<T>(key: string, fallback: T): T {
  const s = readStr(key, '');
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
function writeStr(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota or private mode — ignore */
  }
}
function writeNum(key: string, value: number): void {
  writeStr(key, String(value));
}
function writeJSON(key: string, value: unknown): void {
  writeStr(key, JSON.stringify(value));
}

// ---- URL helpers ------------------------------------------------------------

interface UrlState {
  readonly page: number;
  readonly sort: SortState | null;
  readonly search: string;
  readonly filters: Record<string, string | string[] | null>;
}

function readUrlParams(prefix: string): UrlState | null {
  if (typeof window === 'undefined') return null;
  const sp = new URLSearchParams(window.location.search);
  const get = (k: string) => sp.get(`${prefix}.${k}`);

  const page = Number(get('page') ?? '0');
  const search = get('q') ?? '';
  const sortRaw = get('sort');
  let sort: SortState | null = null;
  if (sortRaw) {
    const desc = sortRaw.startsWith('-');
    sort = { column: desc ? sortRaw.slice(1) : sortRaw, direction: desc ? 'desc' : 'asc' };
  }
  const filters: Record<string, string | string[] | null> = {};
  for (const [key, value] of sp.entries()) {
    const filterPrefix = `${prefix}.f.`;
    if (key.startsWith(filterPrefix)) {
      const fkey = key.slice(filterPrefix.length);
      const existing = filters[fkey];
      if (existing === undefined) filters[fkey] = value;
      else if (Array.isArray(existing)) existing.push(value);
      else filters[fkey] = [existing as string, value];
    }
  }
  return { page: Number.isFinite(page) ? page : 0, sort, search, filters };
}

function writeUrlParams(prefix: string, state: UrlState): void {
  if (typeof window === 'undefined') return;
  const sp = new URLSearchParams(window.location.search);
  // Clear all params under our prefix first so removed filters don't linger.
  for (const key of Array.from(sp.keys())) {
    if (key === `${prefix}.page` || key === `${prefix}.q` || key === `${prefix}.sort` || key.startsWith(`${prefix}.f.`)) {
      sp.delete(key);
    }
  }
  if (state.page > 0) sp.set(`${prefix}.page`, String(state.page));
  if (state.search) sp.set(`${prefix}.q`, state.search);
  if (state.sort) {
    sp.set(`${prefix}.sort`, state.sort.direction === 'desc' ? `-${state.sort.column}` : state.sort.column);
  }
  for (const [k, v] of Object.entries(state.filters)) {
    if (v === null || v === '') continue;
    if (Array.isArray(v)) {
      for (const item of v) sp.append(`${prefix}.f.${k}`, item);
    } else {
      sp.set(`${prefix}.f.${k}`, v);
    }
  }
  const qs = sp.toString();
  const next = qs ? `${window.location.pathname}?${qs}${window.location.hash}` : `${window.location.pathname}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', next);
}
