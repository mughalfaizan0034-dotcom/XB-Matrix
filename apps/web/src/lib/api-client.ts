import type { ApiResponse } from '@xb/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown,
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
  const hasBody = body !== undefined;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        // Only declare a JSON content-type when we are actually sending a body.
        // Fastify (and every conforming HTTP parser) rejects a request that
        // advertises `content-type: application/json` with no body —
        // sign-out, restore, and other "no-payload POSTs" were 400-ing here.
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        ...headers,
      },
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? err.message : 'network error',
      'network_error',
      0,
    );
  }

  const payload = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!payload) {
    throw new ApiError('invalid response', 'invalid_response', res.status);
  }
  if (!payload.ok) {
    throw new ApiError(
      payload.error.message,
      payload.error.code,
      res.status,
      payload.error.details,
    );
  }
  return payload.data;
}

export const api = {
  get:    <T>(path: string)                                 => apiRequest<T>(path, { method: 'GET' }),
  post:   <T>(path: string, body?: unknown, idem?: string)  => apiRequest<T>(path, { method: 'POST',   body, idempotencyKey: idem }),
  patch:  <T>(path: string, body?: unknown, idem?: string)  => apiRequest<T>(path, { method: 'PATCH',  body, idempotencyKey: idem }),
  delete: <T>(path: string, body?: unknown)                 => apiRequest<T>(path, { method: 'DELETE', body }),
};
