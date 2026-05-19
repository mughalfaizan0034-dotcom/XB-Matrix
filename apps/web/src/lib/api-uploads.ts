'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@xb/types';
import { api } from './api-client';

export type UploadStatus = 'queued' | 'uploading' | 'validating' | 'ready' | 'failed';

export const UPLOAD_KINDS = [
  'generic',
  'sales',
  'inventory',
  'ad_spend',
  'shipments',
  'returns',
] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export interface UploadSummary {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly uploadKind: UploadKind;
  readonly originalFilename: string;
  readonly contentType: string;
  readonly fileSizeBytes: number;
  readonly sha256: string;
  readonly storageBucket: string;
  readonly storageObjectKey: string;
  readonly uploadStatus: UploadStatus;
  readonly validationSummary: Record<string, unknown> | null;
  readonly errorMessage: string | null;
  readonly retryCount: number;
  readonly validationStartedAt: string | null;
  readonly validationCompletedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdByActorId: string | null;
  readonly rowVersion: number;
}

export interface UploadsQuery {
  readonly workspaceId?: string;
  readonly status?: UploadStatus;
  readonly q?: string;
  readonly sort?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface UploadsPage {
  readonly items: ReadonlyArray<UploadSummary>;
  readonly total: number;
  readonly hasMore: boolean;
}

const UPLOADS_KEY = ['uploads'] as const;

function buildUploadsUrl(q: UploadsQuery | undefined): string {
  const sp = new URLSearchParams();
  if (q?.workspaceId) sp.set('workspaceId', q.workspaceId);
  if (q?.status) sp.set('status', q.status);
  if (q?.q) sp.set('q', q.q);
  if (q?.sort) sp.set('sort', q.sort);
  if (q?.page !== undefined) sp.set('page', String(q.page));
  if (q?.pageSize !== undefined) sp.set('pageSize', String(q.pageSize));
  const qs = sp.toString();
  return qs ? `/v1/uploads?${qs}` : '/v1/uploads';
}

export function useUploads(query?: UploadsQuery) {
  return useQuery({
    queryKey: [...UPLOADS_KEY, 'list', query ?? null],
    queryFn: () =>
      api.get<Paginated<UploadSummary>>(buildUploadsUrl(query)).then((r) => ({
        items: r.items,
        total: r.page.total ?? r.items.length,
        hasMore: r.page.hasMore,
      })),
    staleTime: 10_000,
    enabled: !query || !!query.workspaceId, // don't fire until we know the workspace scope
  });
}

export function useUpload(id: string | null) {
  return useQuery({
    queryKey: [...UPLOADS_KEY, 'detail', id],
    queryFn: () =>
      api.get<{ upload: UploadSummary }>(`/v1/uploads/${id}`).then((r) => r.upload),
    staleTime: 5_000,
    enabled: !!id,
  });
}

export interface CreateUploadInput {
  readonly workspaceId: string;
  readonly kind?: UploadKind;
  readonly file: File;
}

export function useCreateUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, kind, file }: CreateUploadInput) => {
      const form = new FormData();
      form.append('workspaceId', workspaceId);
      if (kind) form.append('kind', kind);
      form.append('file', file, file.name);
      return api.post<{ upload: UploadSummary }>('/v1/uploads', form).then((r) => r.upload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: UPLOADS_KEY }),
  });
}

export function useRetryUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ upload: UploadSummary }>(`/v1/uploads/${id}/retry`).then((r) => r.upload),
    onSuccess: () => qc.invalidateQueries({ queryKey: UPLOADS_KEY }),
  });
}

export async function fetchUploadDownloadUrl(id: string): Promise<string> {
  const r = await api.get<{ url: string; expiresAt: string }>(`/v1/uploads/${id}/download-url`);
  return r.url;
}
