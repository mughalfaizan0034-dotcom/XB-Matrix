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
} from './amazon-helpers.js';

/**
 * Amazon ads validator — spec template (Part 1 §Uploads).
 *
 * Required columns:
 *   action          — 'upsert' | 'delete'
 *   uid             — unique row identifier
 *   start_date      — period start
 *   end_date        — period end (inclusive)
 *   campaign_name   — campaign display name
 *   campaign_type   — e.g., sponsored_products, sponsored_brands
 *   sku_name        — SKU display name (string; not necessarily the SKU id)
 *   impressions     — non-negative int
 *   clicks          — non-negative int, ≤ impressions
 *   orders          — non-negative int (attributed orders), default 0
 *   total_cost      — non-negative decimal (ad spend)
 *   sales           — non-negative decimal (attributed sales), default 0
 *   currency        — 3-letter ISO
 *   platform        — e.g., amazon
 *   target_platform — channel/marketplace targeted (e.g., amazon_us)
 *
 * Sanity:
 *   - clicks ≤ impressions
 *   - start_date ≤ end_date
 *
 * Canonical insertion into `ppc_performance_period` lands when
 * Spec 3 §10.9+ DDL ships.
 */
export const amazonAdsValidator: UploadValidator = {
  kind: 'amazon_ads',
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
          extra: { mode: 'strict', kind: 'amazon_ads' },
        },
        errorMessage: `Validation failed: ${rejected} of ${records.length} rows have errors.`,
      };
    }

    const distinctCampaigns = new Set(accepted.map((r) => r.campaignName)).size;
    const distinctPlatforms = new Set(accepted.map((r) => r.platform)).size;
    const totals = accepted.reduce(
      (a, r) => {
        a.impressions += r.impressions;
        a.clicks += r.clicks;
        a.orders += r.orders;
        a.cost += r.totalCost;
        a.sales += r.sales;
        return a;
      },
      { impressions: 0, clicks: 0, orders: 0, cost: 0, sales: 0 },
    );
    const derivedAcos =
      totals.sales > 0 ? (totals.cost / totals.sales).toFixed(4) : null;
    const derivedRoas =
      totals.cost > 0 ? (totals.sales / totals.cost).toFixed(4) : null;
    const dateRange =
      accepted.length > 0
        ? {
            from: accepted.reduce(
              (m, r) => (r.startDate < m ? r.startDate : m),
              accepted[0]!.startDate,
            ),
            to: accepted.reduce(
              (m, r) => (r.endDate > m ? r.endDate : m),
              accepted[0]!.endDate,
            ),
          }
        : null;
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
          kind: 'amazon_ads',
          distinctCampaigns,
          distinctPlatforms,
          totalImpressions: totals.impressions,
          totalClicks: totals.clicks,
          totalAttributedOrders: totals.orders,
          totalCost: totals.cost.toFixed(4),
          totalAttributedSales: totals.sales.toFixed(4),
          derivedAcos,
          derivedRoas,
          actionCounts,
          dateRange,
          note: 'Validated; canonical insertion into ppc_performance_period lands when Spec 3 §10.9+ DDL ships.',
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
  'campaign_name',
  'campaign_type',
  'sku_name',
  'impressions',
  'clicks',
  'total_cost',
  'currency',
  'platform',
  'target_platform',
] as const;

interface ParsedRow {
  action: Action;
  uid: string;
  startDate: string;
  endDate: string;
  campaignName: string;
  campaignType: string;
  skuName: string;
  impressions: number;
  clicks: number;
  orders: number;
  totalCost: number;
  sales: number;
  currency: string;
  platform: string;
  targetPlatform: string;
}

type RowResult = { ok: true; row: ParsedRow } | { ok: false; errors: ValidationError[] };

function parseRow(raw: Record<string, string>, rowNumber: number): RowResult {
  const errors: ValidationError[] = [];
  const ctx = { rowNumber, errors };

  const action = requiredAction(ctx, raw.action);
  const uid = requiredString(ctx, 'uid', raw.uid, 200);
  const startDate = requiredDate(ctx, 'start_date', raw.start_date);
  const endDate = requiredDate(ctx, 'end_date', raw.end_date);
  const campaignName = requiredString(ctx, 'campaign_name', raw.campaign_name, 300);
  const campaignType = requiredString(ctx, 'campaign_type', raw.campaign_type, 80);
  const skuName = requiredString(ctx, 'sku_name', raw.sku_name, 200);

  const impressions = requiredNonNegInt(ctx, 'impressions', raw.impressions);
  const clicks = requiredNonNegInt(ctx, 'clicks', raw.clicks);
  const orders = optionalNonNegInt(ctx, 'orders', raw.orders);
  const totalCost = requiredNonNegDecimal(ctx, 'total_cost', raw.total_cost);
  const sales = optionalNonNegDecimal(ctx, 'sales', raw.sales);
  const currency = requiredCurrency(ctx, 'currency', raw.currency);
  const platform = requiredString(ctx, 'platform', raw.platform, 80);
  const targetPlatform = requiredString(ctx, 'target_platform', raw.target_platform, 80);

  if (impressions >= 0 && clicks >= 0 && clicks > impressions) {
    errors.push({
      row: rowNumber,
      column: 'clicks',
      message: `clicks (${clicks}) cannot exceed impressions (${impressions}).`,
    });
  }
  if (startDate && endDate && startDate > endDate) {
    errors.push({
      row: rowNumber,
      column: 'end_date',
      message: `end_date (${endDate}) must be on or after start_date (${startDate}).`,
    });
  }

  // Length-check the optional-but-defined fields by passing through
  // the optional helper for its length cap behavior.
  optionalString(ctx, 'campaign_type', campaignType, 80);

  if (errors.length > 0 || !action) return { ok: false, errors };

  return {
    ok: true,
    row: {
      action,
      uid,
      startDate,
      endDate,
      campaignName,
      campaignType,
      skuName,
      impressions,
      clicks,
      orders,
      totalCost,
      sales,
      currency,
      platform,
      targetPlatform,
    },
  };
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
      extra: { mode: 'strict', kind: 'amazon_ads' },
    },
    errorMessage,
  };
}
