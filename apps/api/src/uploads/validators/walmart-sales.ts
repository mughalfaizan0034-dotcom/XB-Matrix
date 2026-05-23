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
  optionalString,
  requiredAction,
  requiredCurrency,
  requiredDate,
  requiredNonNegDecimal,
  requiredNonNegInt,
  requiredString,
  stripBom,
  type Action,
} from './csv-helpers.js';

/**
 * Walmart sales validator, architectural-validation slice.
 *
 * The point of this validator is NOT to be feature-complete with
 * Walmart's actual seller reports. It exists to prove the connector
 * abstraction holds: a non-Amazon ingestion source uses the same
 * Validator → Mapper → resolveSku → NormalizedSale pipeline as Amazon,
 * with no Amazon-specific behavior leaking into the downstream layers.
 *
 * Required columns (Walmart-native field names where they differ from
 * Amazon, the validator captures them as-is; the mapper translates
 * to the marketplace-agnostic NormalizedSale shape):
 *   action         , 'upsert' | 'delete'
 *   uid            , caller-managed unique row id (idempotency)
 *   start_date     , period start
 *   end_date       , inclusive period end
 *   marketplace    , walmart_us (only US for now; Walmart MX/CA later)
 *   item_id        , Walmart item identifier (resolves to platform_sku alias)
 *   gtin           , optional secondary identifier (UPC/EAN/GTIN)
 *   page_views     , Walmart's term for sessions (non-neg int)
 *   orders         , non-neg int
 *   units          , non-neg int
 *   gmv            , Walmart's term for sales/revenue (non-neg decimal)
 *   refunds        , non-neg decimal (default 0)
 *   currency       , 3-letter ISO
 *
 * Sanity:
 *   - start_date ≤ end_date
 *   - orders ≤ page_views (lightweight smoke check; not all reports
 *     guarantee this, so this is a warning-shaped error, not a hard
 *     rule, kept as strict-mode for the validation slice)
 *
 * Note: Walmart does NOT have an Amazon-style B2B/total split, so the
 * mapper will land NormalizedSale.*B2b columns as 0. That divergence
 * is captured at the mapper edge, not in the canonical shape, engines
 * read sessions_total / orders_total uniformly and aggregate.
 */
export const walmartSalesValidator: UploadValidator = {
  kind: 'walmart_sales',
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
      if (result.ok) {
        accepted.push(result.row);
      } else {
        for (const e of result.errors) {
          if (errors.length < MAX_ERROR_SAMPLES) errors.push(e);
        }
      }
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
          extra: { mode: 'strict', kind: 'walmart_sales' },
        },
        errorMessage: `Validation failed: ${rejected} of ${records.length} rows have errors.`,
      };
    }

    const distinctItems = new Set(accepted.map((r) => r.itemId)).size;
    const distinctMarketplaces = new Set(accepted.map((r) => r.marketplace)).size;
    const totals = accepted.reduce(
      (a, r) => {
        a.pageViews += r.pageViews;
        a.orders += r.orders;
        a.units += r.units;
        a.gmv += r.gmv;
        a.refunds += r.refunds;
        return a;
      },
      { pageViews: 0, orders: 0, units: 0, gmv: 0, refunds: 0 },
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
          kind: 'walmart_sales',
          distinctItems,
          distinctMarketplaces,
          totalPageViews: totals.pageViews,
          totalOrders: totals.orders,
          totalUnits: totals.units,
          totalGmv: totals.gmv.toFixed(4),
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
  'action',
  'uid',
  'start_date',
  'end_date',
  'marketplace',
  'item_id',
  'page_views',
  'orders',
  'units',
  'gmv',
  'currency',
] as const;

interface ParsedRow {
  action: Action;
  uid: string;
  startDate: string;
  endDate: string;
  marketplace: string;
  itemId: string;
  gtin: string | null;
  pageViews: number;
  orders: number;
  units: number;
  gmv: number;
  refunds: number;
  currency: string;
}

type RowResult = { ok: true; row: ParsedRow } | { ok: false; errors: ValidationError[] };

function parseRow(raw: Record<string, string>, rowNumber: number): RowResult {
  const errors: ValidationError[] = [];
  const ctx = { rowNumber, errors };

  const action = requiredAction(ctx, raw.action);
  const uid = requiredString(ctx, 'uid', raw.uid, 200);
  const startDate = requiredDate(ctx, 'start_date', raw.start_date);
  const endDate = requiredDate(ctx, 'end_date', raw.end_date);
  const marketplace = requiredString(ctx, 'marketplace', raw.marketplace, 80);
  const itemId = requiredString(ctx, 'item_id', raw.item_id, 200);
  const gtin = optionalString(ctx, 'gtin', raw.gtin, 40);

  const pageViews = requiredNonNegInt(ctx, 'page_views', raw.page_views);
  const orders = requiredNonNegInt(ctx, 'orders', raw.orders);
  const units = requiredNonNegInt(ctx, 'units', raw.units);
  const gmv = requiredNonNegDecimal(ctx, 'gmv', raw.gmv);
  const refunds = optionalNonNegDecimal(ctx, 'refunds', raw.refunds);
  const currency = requiredCurrency(ctx, 'currency', raw.currency);

  // Sanity: orders shouldn't exceed page_views. Walmart reports
  // occasionally violate this (sessions sampling), kept strict for
  // the architectural-validation slice; loosen if real-world data
  // shows it's too aggressive.
  if (pageViews >= 0 && orders >= 0 && orders > pageViews) {
    errors.push({
      row: rowNumber,
      column: 'orders',
      message: `orders (${orders}) cannot exceed page_views (${pageViews}).`,
    });
  }
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
      action,
      uid,
      startDate,
      endDate,
      marketplace,
      itemId,
      gtin,
      pageViews,
      orders,
      units,
      gmv,
      refunds,
      currency,
    },
  };
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
  rowsParsed,
  columnsDetected,
  columnsMissing,
  errors,
  errorMessage,
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
      extra: { mode: 'strict', kind: 'walmart_sales' },
    },
    errorMessage,
  };
}
