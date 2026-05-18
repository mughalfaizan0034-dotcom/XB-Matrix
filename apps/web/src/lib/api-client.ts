import type { ApiResponse } from '@xb/types';
import { loadWebPublicConfig } from '@xb/config/web';

const webConfig =
  typeof window !== 'undefined' || typeof process !== 'undefined'
    ? loadWebPublicConfig(typeof process !== 'undefined' ? process.env : {})
    : { apiBaseUrl: '', appName: 'xB Matrix' };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, idempotencyKey, headers, ...init } = opts;

  const res = await fetch(`${webConfig.apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!payload) {
    throw new ApiError('invalid response', 'invalid_response', res.status);
  }
  if (!payload.ok) {
    throw new ApiError(payload.error.message, payload.error.code, res.status);
  }
  return payload.data;
}
