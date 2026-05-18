import type { ApiResponse, Paginated } from '@xb/types';

export function ok<T>(data: T, requestId: string): ApiResponse<T> {
  return { ok: true, data, requestId };
}

export function paginated<T>(items: ReadonlyArray<T>, cursor: string | null = null): Paginated<T> {
  return { items, page: { cursor, hasMore: cursor !== null } };
}
