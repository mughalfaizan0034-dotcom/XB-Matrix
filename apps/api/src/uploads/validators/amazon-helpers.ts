/**
 * Shared parsing helpers for the spec-aligned Amazon validators
 * (amazon_sales, amazon_inventory, amazon_ads). Keeps each validator
 * file focused on its template columns instead of duplicating CSV
 * + cell parsing.
 *
 * All three templates share:
 *   - `action` column ('upsert' | 'delete') — drives the canonical
 *     transform; for now we only validate it.
 *   - `uid` column — caller-supplied unique identifier for the
 *     composite key (channel/sku/period or campaign/sku/period).
 *     We validate non-empty + reasonable length.
 *   - Date fields (start_date/end_date or date) that must parse.
 *
 * Validators don't insert canonical rows yet — they parse + validate
 * + produce a summary. Canonical inserts land when Spec 3 §10.9+
 * DDL ships and a canonicalization worker reads from the GCS file
 * + upload row.
 */

import type { ValidationError } from './types.js';

export const ACTIONS = ['upsert', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

/** Header normalization: snake_case + camelCase + spaces all collapse. */
export function normalizeColumnName(raw: string): string {
  return raw
    .trim()
    .replace(/[\s\-]+/g, '_')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

/** Strip UTF-8 BOM if present. */
export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Number that signals "this field had a parse error" without being null. */
export const INVALID = Number.NEGATIVE_INFINITY;

export interface ParseContext {
  readonly rowNumber: number;
  readonly errors: ValidationError[];
}

/**
 * Required field — adds a `<col> is required` error and returns ''.
 * Returns the trimmed value if present.
 */
export function requiredString(
  ctx: ParseContext,
  column: string,
  raw: string | undefined,
  max: number,
): string {
  const s = (raw ?? '').trim();
  if (!s) {
    ctx.errors.push({ row: ctx.rowNumber, column, message: `${column} is required.` });
    return '';
  }
  if (s.length > max) {
    ctx.errors.push({
      row: ctx.rowNumber,
      column,
      message: `${column} is longer than ${max} characters.`,
    });
  }
  return s;
}

export function optionalString(
  ctx: ParseContext,
  column: string,
  raw: string | undefined,
  max: number,
): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (s.length > max) {
    ctx.errors.push({
      row: ctx.rowNumber,
      column,
      message: `${column} is longer than ${max} characters.`,
    });
  }
  return s;
}

/** Required non-negative integer. */
export function requiredNonNegInt(
  ctx: ParseContext,
  column: string,
  raw: string | undefined,
): number {
  const s = (raw ?? '').trim();
  if (!s) {
    ctx.errors.push({ row: ctx.rowNumber, column, message: `${column} is required.` });
    return INVALID;
  }
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) {
    ctx.errors.push({
      row: ctx.rowNumber,
      column,
      message: `${column} must be a non-negative integer (got "${s}").`,
    });
    return INVALID;
  }
  return n;
}

/** Optional non-negative integer (returns 0 when blank). */
export function optionalNonNegInt(
  ctx: ParseContext,
  column: string,
  raw: string | undefined,
): number {
  const s = (raw ?? '').trim();
  if (!s) return 0;
  return requiredNonNegInt(ctx, column, s);
}

/** Required non-negative decimal (parsed as Number; precision held in caller). */
export function requiredNonNegDecimal(
  ctx: ParseContext,
  column: string,
  raw: string | undefined,
): number {
  const s = (raw ?? '').trim();
  if (!s) {
    ctx.errors.push({ row: ctx.rowNumber, column, message: `${column} is required.` });
    return INVALID;
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) {
    ctx.errors.push({
      row: ctx.rowNumber,
      column,
      message: `${column} must be a non-negative number (got "${s}").`,
    });
    return INVALID;
  }
  return n;
}

export function optionalNonNegDecimal(
  ctx: ParseContext,
  column: string,
  raw: string | undefined,
): number {
  const s = (raw ?? '').trim();
  if (!s) return 0;
  return requiredNonNegDecimal(ctx, column, s);
}

/** Required ISO date (any value Date.parse can read; normalized to YYYY-MM-DD). */
export function requiredDate(
  ctx: ParseContext,
  column: string,
  raw: string | undefined,
): string {
  const s = (raw ?? '').trim();
  if (!s) {
    ctx.errors.push({ row: ctx.rowNumber, column, message: `${column} is required.` });
    return '';
  }
  const ts = Date.parse(s);
  if (Number.isNaN(ts)) {
    ctx.errors.push({
      row: ctx.rowNumber,
      column,
      message: `${column} is not a recognized date (got "${s}").`,
    });
    return '';
  }
  return new Date(ts).toISOString().slice(0, 10);
}

/** Required 3-letter ISO currency code, uppercased. */
export function requiredCurrency(
  ctx: ParseContext,
  column: string,
  raw: string | undefined,
): string {
  const s = (raw ?? '').trim().toUpperCase();
  if (!s) {
    ctx.errors.push({ row: ctx.rowNumber, column, message: `${column} is required.` });
    return '';
  }
  if (!/^[A-Z]{3}$/.test(s)) {
    ctx.errors.push({
      row: ctx.rowNumber,
      column,
      message: `${column} must be a 3-letter ISO code (got "${s}").`,
    });
    return '';
  }
  return s;
}

/** Required action ('upsert' | 'delete'). */
export function requiredAction(ctx: ParseContext, raw: string | undefined): Action | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) {
    ctx.errors.push({ row: ctx.rowNumber, column: 'action', message: 'action is required.' });
    return null;
  }
  if (!ACTIONS.includes(s as Action)) {
    ctx.errors.push({
      row: ctx.rowNumber,
      column: 'action',
      message: `action must be one of: ${ACTIONS.join(', ')} (got "${s}").`,
    });
    return null;
  }
  return s as Action;
}
