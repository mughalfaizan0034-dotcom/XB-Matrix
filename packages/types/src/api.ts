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
}

export interface Paginated<T> {
  readonly items: ReadonlyArray<T>;
  readonly page: PageInfo;
}
