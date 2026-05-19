'use client';

/**
 * In-memory CSV export. The caller owns row collection; this just does the
 * serialization + download. For large or scoped exports we'll layer a
 * Cloud Tasks job + storage URL on top later — that lives outside @xb/ui
 * since it requires API + worker coordination.
 */

export interface CsvColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly value: (row: T) => string | number | boolean | null | undefined;
}

/**
 * Build a CSV string from rows + column descriptors. RFC-4180-ish:
 *   - fields containing comma / quote / newline are wrapped in quotes
 *   - embedded quotes are doubled
 *   - line ending is CRLF (the spec's nominal choice; Excel handles it)
 */
export function rowsToCsv<T>(rows: ReadonlyArray<T>, columns: ReadonlyArray<CsvColumn<T>>): string {
  const headers = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escapeCell(formatValue(c.value(row)))).join(','))
    .join('\r\n');
  return body ? `${headers}\r\n${body}\r\n` : `${headers}\r\n`;
}

/**
 * Trigger a browser download of `csv` as `filename`. Uses Blob + object URL
 * so it works without a server round trip.
 */
export function downloadCsv(csv: string, filename: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // Release the object URL on the next tick so the click has time to use it.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Convenience: build CSV + trigger download in one call. */
export function exportRowsToCsv<T>(
  rows: ReadonlyArray<T>,
  columns: ReadonlyArray<CsvColumn<T>>,
  filename: string,
): void {
  downloadCsv(rowsToCsv(rows, columns), filename);
}

function formatValue(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function escapeCell(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
