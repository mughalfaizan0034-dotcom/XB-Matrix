import { parse } from 'csv-parse/sync';
import {
  MAX_ERROR_SAMPLES,
  type UploadValidator,
  type ValidationError,
  type ValidatorInput,
  type ValidatorResult,
} from './types.js';
import {
  normalizeColumnName,
  optionalNonNegDecimal,
  optionalNonNegInt,
  requiredAction,
  requiredDate,
  requiredNonNegDecimal,
  requiredNonNegInt,
  requiredString,
  stripBom,
  type Action,
} from './csv-helpers.js';

/**
 * Sales Performance — the omnichannel normalized template.
 *
 * One file can mix rows from Amazon US / Amazon CA / Walmart / Shopify
 * / TikTok Shop / any future marketplace. The `marketplace` column on
 * every row is what makes a row platform-aware; the canonical layer
 * downstream sees one normalized sales fact, not "Amazon sales" vs
 * "Walmart sales".
 *
 * Per-marketplace validators (amazon_sales, walmart_sales) still exist
 * as ingestion ADAPTERS — they translate platform-shaped exports into
 * this same canonical sales shape. The primary template exposed to
 * users is this one.
 *
 * Columns (Part 5 + 2026-05-20 omnichannel direction):
 *   action            — add | update | remove
 *   uid               — caller-supplied unique row id (idempotency)
 *   start_date        — period start (YYYY-MM-DD)
 *   end_date          — period end (inclusive)
 *   channel           — fulfillment / retail channel label
 *                       (e.g. fba, fbm, dtc, retail, wholesale)
 *   marketplace       — marketplace/source identity
 *                       (e.g. amazon.com, amazon.ca, walmart.com,
 *                        shopify, tiktokshop, meta.com)
 *   sku               — SKU identifier (resolved to normalized sku
 *                       via xb_master.sku_aliases downstream)
 *   sessions_total    — non-neg int
 *   sessions_b2b      — non-neg int (default 0)
 *   orders_total      — non-neg int
 *   orders_b2b        — non-neg int (default 0)
 *   units_total       — non-neg int
 *   units_b2b         — non-neg int (default 0)
 *   sales_total       — non-neg decimal
 *   sales_b2b         — non-neg decimal (default 0)
 *   refunds_total     — non-neg decimal (default 0)
 *   refunds_b2b       — non-neg decimal (default 0)
 *
 * Sanity:
 *   - b2b columns ≤ their _total counterparts
 *   - start_date ≤ end_date
 *
 * Strict mode: any row error rejects the upload; zero canonical rows
 * persist until validation is clean.
 */
export const salesPerformanceValidator: UploadValidator = {
  kind: 'sales_performance',
  async validate(input: ValidatorInput): Promise<ValidatorResult> {
    const text = stripBom(input.buffer.toString('utf8'));

    let records: ReadonlyArray<Record<string, string>>;
    try {
      records = parse(text, {
        columns: (header: string[]) => header.map(normalizeColumnName),
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        bom: true,
      }) as Record<string, string>[];
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'CSV parsing failed';
      return failed({
        rowsParsed: 0,
        columnsDetected: [],
        errors: [{ row: 0, message: `Could not parse CSV: ${msg}` }],
        errorMessage: 'CSV file could not be parsed.',
      });
    }

    const headerSet = new Set(records.length > 0 ? Object.keys(records[0]!) : []);
    const columnsDetected = [...headerSet];
    const columnsMissing = REQUIRED.filter((c) => !headerSet.has(c));

    if (columnsMissing.length > 0) {
      return failed({
        rowsParsed: records.length,
        columnsDetected,
        columnsMissing,
        errors: columnsMissing.map((c) => ({
          row: 0,
          column: c,
          message: `Required column "${c}" is missing.`,
        })),
        errorMessage: `Missing required columns: ${columnsMissing.join(', ')}.`,
      });
    }

    const accepted: ParsedRow[] = [];
    const errors: ValidationError[] = [];

    for (let i = 0; i < records.length; i++) {
      const result = parseRow(records[i]!, i + 2);
      if (result.ok) accepted.push(result.row);
      else for (const e of result.errors) if (errors.length < MAX_ERROR_SAMPLES) errors.push(e);
    }

    if (errors.length > 0) {
      const rejected = records.length - accepted.length;
      return {
        ok: false,
        summary: {
          rowsParsed: records.length,
          rowsAccepted: 0,
          rowsRejected: rejected,
          columnsDetected,
          columnsMissing,
          errors,
          extra: { mode: 'strict', kind: 'sales_performance' },
        },
        errorMessage: `Validation failed: ${rejected} of ${records.length} rows have errors.`,
      };
    }

    const distinctSkus = new Set(accepted.map((r) => r.sku)).size;
    const distinctMarketplaces = new Set(accepted.map((r) => r.marketplace)).size;
    const distinctChannels = new Set(accepted.map((r) => r.channel)).size;
    const totals = accepted.reduce(
      (a, r) => {
        a.sessions += r.sessionsTotal;
        a.orders += r.ordersTotal;
        a.units += r.unitsTotal;
        a.sales += r.salesTotal;
        a.refunds += r.refundsTotal;
        return a;
      },
      { sessions: 0, orders: 0, units: 0, sales: 0, refunds: 0 },
    );
    const dateRange = accepted.length > 0 ? rangeOf(accepted) : null;
    const actionCounts = accepted.reduce(
      (a, r) => {
        a[r.action] = (a[r.action] ?? 0) + 1;
        return a;
      },
      {} as Record<Action, number>,
    );

    return {
      ok: true,
      summary: {
        rowsParsed: records.length,
        rowsAccepted: accepted.length,
        rowsRejected: 0,
        columnsDetected,
        columnsMissing: [],
        errors: [],
        extra: {
          mode: 'strict',
          kind: 'sales_performance',
          distinctSkus,
          distinctMarketplaces,
          distinctChannels,
          totalSessions: totals.sessions,
          totalOrders: totals.orders,
          totalUnits: totals.units,
          totalSales: totals.sales.toFixed(4),
          totalRefunds: totals.refunds.toFixed(4),
          actionCounts,
          dateRange,
          note: 'Validated; canonical insertion into channel_sales lands when Spec 3 §10.9+ DDL ships.',
        },
      },
    };
  },
};

const REQUIRED = [
  'action', 'uid', 'start_date', 'end_date', 'channel', 'marketplace', 'sku',
  'sessions_total', 'orders_total', 'units_total', 'sales_total',
] as const;

interface ParsedRow {
  action: Action;
  uid: string;
  startDate: string;
  endDate: string;
  channel: string;
  marketplace: string;
  sku: string;
  sessionsTotal: number;
  sessionsB2b: number;
  ordersTotal: number;
  ordersB2b: number;
  unitsTotal: number;
  unitsB2b: number;
  salesTotal: number;
  salesB2b: number;
  refundsTotal: number;
  refundsB2b: number;
}

type RowResult = { ok: true; row: ParsedRow } | { ok: false; errors: ValidationError[] };

function parseRow(raw: Record<string, string>, rowNumber: number): RowResult {
  const errors: ValidationError[] = [];
  const ctx = { rowNumber, errors };

  const action = requiredAction(ctx, raw.action);
  const uid = requiredString(ctx, 'uid', raw.uid, 200);
  const startDate = requiredDate(ctx, 'start_date', raw.start_date);
  const endDate = requiredDate(ctx, 'end_date', raw.end_date);
  const channel = requiredString(ctx, 'channel', raw.channel, 80);
  const marketplace = requiredString(ctx, 'marketplace', raw.marketplace, 120);
  const sku = requiredString(ctx, 'sku', raw.sku, 200);

  const sessionsTotal = requiredNonNegInt(ctx, 'sessions_total', raw.sessions_total);
  const sessionsB2b = optionalNonNegInt(ctx, 'sessions_b2b', raw.sessions_b2b);
  const ordersTotal = requiredNonNegInt(ctx, 'orders_total', raw.orders_total);
  const ordersB2b = optionalNonNegInt(ctx, 'orders_b2b', raw.orders_b2b);
  const unitsTotal = requiredNonNegInt(ctx, 'units_total', raw.units_total);
  const unitsB2b = optionalNonNegInt(ctx, 'units_b2b', raw.units_b2b);
  const salesTotal = requiredNonNegDecimal(ctx, 'sales_total', raw.sales_total);
  const salesB2b = optionalNonNegDecimal(ctx, 'sales_b2b', raw.sales_b2b);
  const refundsTotal = optionalNonNegDecimal(ctx, 'refunds_total', raw.refunds_total);
  const refundsB2b = optionalNonNegDecimal(ctx, 'refunds_b2b', raw.refunds_b2b);

  checkLte(ctx, 'sessions_b2b', sessionsB2b, 'sessions_total', sessionsTotal);
  checkLte(ctx, 'orders_b2b', ordersB2b, 'orders_total', ordersTotal);
  checkLte(ctx, 'units_b2b', unitsB2b, 'units_total', unitsTotal);
  checkLte(ctx, 'sales_b2b', salesB2b, 'sales_total', salesTotal);
  checkLte(ctx, 'refunds_b2b', refundsB2b, 'refunds_total', refundsTotal);

  if (startDate && endDate && startDate > endDate) {
    errors.push({
      row: rowNumber,
      column: 'end_date',
      message: `end_date (${endDate}) must be on or after start_date (${startDate}).`,
    });
  }

  if (errors.length > 0 || !action) return { ok: false, errors };

  return {
    ok: true,
    row: {
      action, uid, startDate, endDate, channel, marketplace, sku,
      sessionsTotal, sessionsB2b, ordersTotal, ordersB2b,
      unitsTotal, unitsB2b, salesTotal, salesB2b,
      refundsTotal, refundsB2b,
    },
  };
}

function checkLte(
  ctx: { rowNumber: number; errors: ValidationError[] },
  lhsCol: string, lhs: number, rhsCol: string, rhs: number,
): void {
  if (lhs > rhs) {
    ctx.errors.push({
      row: ctx.rowNumber,
      column: lhsCol,
      message: `${lhsCol} (${lhs}) cannot exceed ${rhsCol} (${rhs}).`,
    });
  }
}

function rangeOf(rows: ReadonlyArray<ParsedRow>): { from: string; to: string } {
  return rows.reduce(
    (acc, r) => ({
      from: r.startDate < acc.from ? r.startDate : acc.from,
      to: r.endDate > acc.to ? r.endDate : acc.to,
    }),
    { from: rows[0]!.startDate, to: rows[0]!.endDate },
  );
}

function failed({
  rowsParsed, columnsDetected, columnsMissing, errors, errorMessage,
}: {
  rowsParsed: number;
  columnsDetected: ReadonlyArray<string>;
  columnsMissing?: ReadonlyArray<string>;
  errors: ReadonlyArray<ValidationError>;
  errorMessage: string;
}): ValidatorResult {
  return {
    ok: false,
    summary: {
      rowsParsed,
      rowsAccepted: 0,
      rowsRejected: rowsParsed,
      columnsDetected,
      columnsMissing: columnsMissing ?? [],
      errors,
      extra: { mode: 'strict', kind: 'sales_performance' },
    },
    errorMessage,
  };
}
