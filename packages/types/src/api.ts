export interface ApiSuccess<T> {
  readonly ok: true;
  readonly data: T;
  readonly requestId: string;
}

export interface ApiFailure {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
  readonly requestId: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PageInfo {
  readonly cursor: string | null;
  readonly hasMore: boolean;
  /**
   * Total row count when the query supports it (offset-style pagination).
   * Cursor-style endpoints return null; the UI shows "Showing X–Y" without
   * a total in that case.
   */
  readonly total?: number | null;
}

export interface Paginated<T> {
  readonly items: ReadonlyArray<T>;
  readonly page: PageInfo;
}

/**
 * Canonical query shape for paginated list endpoints. Frontend builds the
 * URL search params from this; backend zod-parses the same shape.
 *
 *   page       — zero-based page number (offset mode)
 *   pageSize   — rows per page (10..200 enforced server-side)
 *   sort       — `column` or `-column` for desc
 *   q          — free-text search (server decides which columns)
 *   filters    — repeated `f.<key>=value` params
 *
 * Cursor-mode endpoints accept `cursor` instead of `page`. The two modes
 * are mutually exclusive per endpoint — pick the right mode based on the
 * data shape (cursor for append-only audit logs, page for org/user lists).
 */
export interface PaginatedQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly cursor?: string;
  readonly sort?: string;
  readonly q?: string;
  readonly filters?: Record<string, string | ReadonlyArray<string>>;
}
