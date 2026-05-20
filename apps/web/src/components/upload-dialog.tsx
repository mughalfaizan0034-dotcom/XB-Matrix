'use client';

import { useEffect, useRef, useState } from 'react';
import { File as FileIcon, UploadCloud, X } from 'lucide-react';
import {
  Button,
  Dialog,
  FormField,
  Select,
  useToast,
} from '@xb/ui';
import { cn } from '@xb/ui/lib/cn';
import { useCreateUpload, UPLOAD_KINDS, type UploadKind } from '@/lib/api-uploads';
import { describeError, useActiveWorkspace } from '@/lib/session';
import { groupKindsByCategory, UPLOAD_KIND_META } from '@/lib/upload-kind-labels';

const MAX_BYTES = 32 * 1024 * 1024; // matches server-side cap in routes/uploads.ts

// Dropdown is grouped by operational category (Sales / Inventory /
// Advertising / Other). Per-platform formats sit as options under each
// group via <optgroup>. See lib/upload-kind-labels.ts for the source
// of truth on labels — the History column, the Templates panel, and
// this dropdown all read from it.
const KIND_GROUPS = groupKindsByCategory(UPLOAD_KINDS);

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * Drag-and-drop upload dialog. Single file per submission (server enforces
 * the same). File picker fallback for keyboard users / no-drop browsers.
 *
 * The kind selector lets the user tag the upload up front. Per-module
 * validators won't exist until each business module ships; until then
 * everything just stores cleanly tagged so a later batch validator can
 * pick by kind.
 */
export function UploadDialog({ open, onClose }: Props) {
  const { data: activeWorkspace } = useActiveWorkspace();
  const create = useCreateUpload();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<UploadKind>('generic');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setKind('generic');
      setError(null);
      setDragging(false);
    }
  }, [open]);

  function pick(f: File | null) {
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`File is too large (${humanSize(f.size)}). Max is ${humanSize(MAX_BYTES)}.`);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  }

  async function onSubmit() {
    if (!file || !activeWorkspace) return;
    try {
      const upload = await create.mutateAsync({
        workspaceId: activeWorkspace.id,
        kind,
        file,
      });
      toast.push('success', `Uploaded ${upload.originalFilename}.`);
      onClose();
    } catch (err) {
      setError(describeError(err));
    }
  }

  function close() {
    if (create.isPending) return;
    onClose();
  }

  const noActiveWorkspace = !activeWorkspace;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={
        noActiveWorkspace
          ? 'Pick a workspace first'
          : `Upload to ${activeWorkspace?.workspaceName}`
      }
      description={
        noActiveWorkspace
          ? 'Uploads are scoped to a workspace. Select one from the topbar switcher, then try again.'
          : 'Drop a CSV / XLSX / JSON file. Max 32 MB. The file is stored privately to your workspace and can be re-downloaded later.'
      }
      footer={
        <>
          <Button variant="outline" type="button" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          {!noActiveWorkspace ? (
            <Button onClick={onSubmit} disabled={!file || create.isPending}>
              {create.isPending ? 'Uploading…' : 'Upload'}
            </Button>
          ) : null}
        </>
      }
    >
      {noActiveWorkspace ? null : (
        <div className="flex flex-col gap-4">
          <FormField
            label="Operational dataset & ingestion path"
            hint="Pick the operational dataset (Sales Performance, Inventory Position, …) and then which ingestion path matches your file. Every path lands in the same centralized intelligence layer downstream — marketplace stays as a column dimension, not a separate entity."
          >
            {(p) => (
              <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as UploadKind)}>
                {KIND_GROUPS.map((g) => (
                  <optgroup key={g.category} label={g.categoryLabel}>
                    {g.kinds.map((k) => (
                      <option key={k} value={k}>
                        {UPLOAD_KIND_META[k].platformLabel}
                        {UPLOAD_KIND_META[k].legacy ? ' (legacy)' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            )}
          </FormField>

          <div
            className={cn(
              'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
              dragging
                ? 'border-navy bg-navy-50/40'
                : 'border-border bg-muted/30 hover:border-navy/40',
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0] ?? null;
              pick(f);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex w-full items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-left">
                <FileIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{file.name}</div>
                  <div className="text-xs text-muted-foreground">{humanSize(file.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => pick(null)}
                  aria-label="Remove file"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <UploadCloud className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-foreground">
                  Drop a file here, or{' '}
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="font-medium text-navy underline-offset-2 hover:underline"
                  >
                    browse
                  </button>
                </p>
                <p className="text-xs text-muted-foreground">CSV, XLSX, or JSON · up to 32 MB</p>
              </>
            )}
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
