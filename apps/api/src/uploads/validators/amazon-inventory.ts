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
  optionalNonNegInt,
  requiredAction,
  requiredDate,
  requiredNonNegInt,
  requiredString,
  stripBom,
  type Action,
} from './amazon-helpers.js';

/**
 * Amazon inventory validator — spec template (Part 1 §Uploads).
 *
 * Required columns:
 *   action      — 'upsert' | 'delete'
 *   uid         — unique row identifier (caller-managed)
 *   date        — snapshot date (YYYY-MM-DD or parseable)
 *   channel     — marketplace / channel name
 *   sku         — SKU identifier
 *   total       — total units (non-negative int)
 *   receiving   — units inbound to FC (non-negative int, default 0)
 *   fc_transfer — units in FC-to-FC transfer (non-negative int, default 0)
 *   reserved    — units reserved (non-negative int, default 0)
 *   damaged     — damaged units (non-negative int, default 0)
 *
 * Sanity: receiving + fc_transfer + reserved + damaged ≤ total. (Total
 * is the position; the rest are partitions of it.)
 *
 * Canonical insertion into `inventory_position` lands when Spec 3
 * §10.9+ DDL ships. Until then this validator just confirms the
 * upload is well-formed + produces a summary.
 */
export const amazonInventoryValidator: UploadValidator = {
  kind: 'amazon_inventory',
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
          extra: { mode: 'strict', kind: 'amazon_inventory' },
        },
        errorMessage: `Validation failed: ${rejected} of ${records.length} rows have errors.`,
      };
    }

    const distinctSkus = new Set(accepted.map((r) => r.sku)).size;
    const distinctChannels = new Set(accepted.map((r) => r.channel)).size;
    const totals = accepted.reduce(
      (a, r) => {
        a.total += r.total;
        a.receiving += r.receiving;
        a.fcTransfer += r.fcTransfer;
        a.reserved += r.reserved;
        a.damaged += r.damaged;
        return a;
      },
      { total: 0, receiving: 0, fcTransfer: 0, reserved: 0, damaged: 0 },
    );
    const dateRange =
      accepted.length > 0
        ? {
            from: accepted.reduce(
              (m, r) => (r.date < m ? r.date : m),
              accepted[0]!.date,
            ),
            to: accepted.reduce(
              (m, r) => (r.date > m ? r.date : m),
              accepted[0]!.date,
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
          kind: 'amazon_inventory',
          distinctSkus,
          distinctChannels,
          totalUnits: totals.total,
          totalReceiving: totals.receiving,
          totalFcTransfer: totals.fcTransfer,
          totalReserved: totals.reserved,
          totalDamaged: totals.damaged,
          actionCounts,
          dateRange,
          note: 'Validated; canonical insertion into inventory_position lands when Spec 3 §10.9+ DDL ships.',
        },
      },
    };
  },
};

const REQUIRED = ['action', 'uid', 'date', 'channel', 'sku', 'total'] as const;

interface ParsedRow {
  action: Action;
  uid: string;
  date: string;
  channel: string;
  sku: string;
  total: number;
  receiving: number;
  fcTransfer: number;
  reserved: number;
  damaged: number;
}

type RowResult = { ok: true; row: ParsedRow } | { ok: false; errors: ValidationError[] };

function parseRow(raw: Record<string, string>, rowNumber: number): RowResult {
  const errors: ValidationError[] = [];
  const ctx = { rowNumber, errors };

  const action = requiredAction(ctx, raw.action);
  const uid = requiredString(ctx, 'uid', raw.uid, 200);
  const date = requiredDate(ctx, 'date', raw.date);
  const channel = requiredString(ctx, 'channel', raw.channel, 120);
  const sku = requiredString(ctx, 'sku', raw.sku, 200);

  const total = requiredNonNegInt(ctx, 'total', raw.total);
  const receiving = optionalNonNegInt(ctx, 'receiving', raw.receiving);
  const fcTransfer = optionalNonNegInt(ctx, 'fc_transfer', raw.fc_transfer);
  const reserved = optionalNonNegInt(ctx, 'reserved', raw.reserved);
  const damaged = optionalNonNegInt(ctx, 'damaged', raw.damaged);

  // Sanity: components ≤ total. We treat total as the source-of-truth
  // physical position; the rest are partitions of it (or sub-totals
  // already included in it).
  const components = receiving + fcTransfer + reserved + damaged;
  if (total >= 0 && components > total) {
    errors.push({
      row: rowNumber,
      column: 'total',
      message: `receiving + fc_transfer + reserved + damaged (${components}) exceeds total (${total}).`,
    });
  }

  if (errors.length > 0 || !action) return { ok: false, errors };

  return {
    ok: true,
    row: { action, uid, date, channel, sku, total, receiving, fcTransfer, reserved, damaged },
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
      extra: { mode: 'strict', kind: 'amazon_inventory' },
    },
    errorMessage,
  };
}
