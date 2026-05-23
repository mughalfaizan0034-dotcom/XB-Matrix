import { parse } from 'csv-parse/sync';
import { ulid } from 'ulid';
import type { PoolClient } from 'pg';
import {
  MAX_ERROR_SAMPLES,
  type UploadValidator,
  type ValidationError,
  type ValidatorInput,
  type ValidatorResult,
} from './types.js';

/**
 * Inventory upload validator.
 *
 * Expected CSV columns (case-insensitive, snake/camel-tolerant):
 *   sku            , string, non-empty, ≤ 200 chars
 *   warehouse      , string, non-empty, ≤ 120 chars
 *   snapshot_date  , ISO date or anything Date.parse can read
 *   on_hand        , non-negative integer
 *   reserved       , non-negative integer (default 0)
 *   available      , non-negative integer (default: on_hand - reserved)
 *   inbound        , non-negative integer (default 0)
 *   unit_cost      , non-negative decimal (optional)
 *   currency       , 3-letter ISO code (required when unit_cost present)
 *
 * Same strict mode + bulk-insert pattern as sales:
 *   - any row error → entire upload rejected
 *   - up to 100 error samples returned in validation_summary
 *   - 1000-row insert batches
 *
 * Extra summary fields:
 *   - distinctSkus, distinctWarehouses
 *   - totalOnHand
 *   - totalValuation (sum of on_hand * unit_cost when cost present)
 *   - dateRange (min / max snapshot_date)
 */
export const inventoryValidator: UploadValidator = {
  kind: 'inventory',
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
      return failedSummary({
        rowsParsed: 0,
        columnsDetected: [],
        errors: [{ row: 0, message: `Could not parse CSV: ${msg}` }],
        errorMessage: 'CSV file could not be parsed.',
      });
    }

    const headerSet = new Set(records.length > 0 ? Object.keys(records[0]!) : []);
    const columnsDetected = [...headerSet];
    const columnsMissing = REQUIRED_COLUMNS.filter((c) => !headerSet.has(c));

    if (columnsMissing.length > 0) {
      return failedSummary({
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
          extra: {
            mode: 'strict',
            note: 'No rows were inserted because at least one row failed validation. Fix the listed errors and re-upload.',
          },
        },
        errorMessage: `Validation failed: ${rejected} of ${records.length} rows have errors.`,
      };
    }

    if (accepted.length > 0) {
      await bulkInsert(input.client, {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        uploadId: input.uploadId,
        createdByActorId: input.actor.actorId,
        rows: accepted,
      });
    }

    const distinctSkus = new Set(accepted.map((r) => r.sku)).size;
    const distinctWarehouses = new Set(accepted.map((r) => r.warehouse)).size;
    const totalOnHand = accepted.reduce((a, r) => a + r.onHand, 0);
    const totalValuation = accepted.reduce(
      (a, r) => (r.unitCost !== null ? a + r.onHand * r.unitCost : a),
      0,
    );
    const valuedRows = accepted.filter((r) => r.unitCost !== null).length;
    const dateRange =
      accepted.length > 0
        ? {
            from: accepted.reduce(
              (min, r) => (r.snapshotDate < min ? r.snapshotDate : min),
              accepted[0]!.snapshotDate,
            ),
            to: accepted.reduce(
              (max, r) => (r.snapshotDate > max ? r.snapshotDate : max),
              accepted[0]!.snapshotDate,
            ),
          }
        : null;

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
          distinctSkus,
          distinctWarehouses,
          totalOnHand,
          totalValuation: valuedRows > 0 ? totalValuation.toFixed(4) : null,
          valuedRows,
          dateRange,
        },
      },
    };
  },
};

// ---- helpers ----------------------------------------------------------------

const REQUIRED_COLUMNS = ['sku', 'warehouse', 'snapshot_date', 'on_hand'] as const;

interface ParsedRow {
  sku: string;
  warehouse: string;
  snapshotDate: string; // YYYY-MM-DD
  onHand: number;
  reserved: number;
  available: number;
  inbound: number;
  unitCost: number | null;
  currency: string | null;
}

type RowResult = { ok: true; row: ParsedRow } | { ok: false; errors: ValidationError[] };

function parseRow(raw: Record<string, string>, rowNumber: number): RowResult {
  const errors: ValidationError[] = [];

  const sku = (raw.sku ?? '').trim();
  if (!sku) errors.push({ row: rowNumber, column: 'sku', message: 'sku is required.' });
  else if (sku.length > 200)
    errors.push({ row: rowNumber, column: 'sku', message: 'sku is longer than 200 characters.' });

  const warehouse = (raw.warehouse ?? '').trim();
  if (!warehouse)
    errors.push({ row: rowNumber, column: 'warehouse', message: 'warehouse is required.' });
  else if (warehouse.length > 120)
    errors.push({
      row: rowNumber,
      column: 'warehouse',
      message: 'warehouse is longer than 120 characters.',
    });

  const dateRaw = (raw.snapshot_date ?? '').trim();
  let snapshotDate = '';
  if (!dateRaw) {
    errors.push({
      row: rowNumber,
      column: 'snapshot_date',
      message: 'snapshot_date is required.',
    });
  } else {
    const ts = Date.parse(dateRaw);
    if (Number.isNaN(ts)) {
      errors.push({
        row: rowNumber,
        column: 'snapshot_date',
        message: `snapshot_date is not a recognized date (got "${dateRaw}").`,
      });
    } else {
      snapshotDate = new Date(ts).toISOString().slice(0, 10);
    }
  }

  const onHand = parseQty(raw.on_hand, 'on_hand', rowNumber, errors, true);
  const reserved = parseOptionalQty(raw.reserved, 'reserved', rowNumber, errors) ?? 0;
  const inbound = parseOptionalQty(raw.inbound, 'inbound', rowNumber, errors) ?? 0;

  // Available defaults to on_hand - reserved when not supplied. When
  // supplied, we trust the file (some systems distinguish picked-but-
  // not-shipped from reserved-on-cart in ways we can't reconstruct).
  let available: number;
  const availRaw = (raw.available ?? '').trim();
  if (availRaw) {
    const a = parseQty(availRaw, 'available', rowNumber, errors, false);
    available = a;
  } else if (onHand !== Number.NEGATIVE_INFINITY) {
    available = Math.max(0, onHand - reserved);
  } else {
    available = 0;
  }

  // unit_cost is optional, currency required when present.
  let unitCost: number | null = null;
  let currency: string | null = null;
  const costRaw = (raw.unit_cost ?? '').trim();
  if (costRaw) {
    const c = Number(costRaw);
    if (!Number.isFinite(c) || c < 0) {
      errors.push({
        row: rowNumber,
        column: 'unit_cost',
        message: `unit_cost must be a non-negative number (got "${costRaw}").`,
      });
    } else {
      unitCost = c;
    }
    const cur = (raw.currency ?? '').trim().toUpperCase();
    if (!cur) {
      errors.push({
        row: rowNumber,
        column: 'currency',
        message: 'currency is required when unit_cost is provided.',
      });
    } else if (!/^[A-Z]{3}$/.test(cur)) {
      errors.push({
        row: rowNumber,
        column: 'currency',
        message: `currency must be a 3-letter ISO code (got "${cur}").`,
      });
    } else {
      currency = cur;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    row: {
      sku,
      warehouse,
      snapshotDate,
      onHand,
      reserved,
      available,
      inbound,
      unitCost,
      currency,
    },
  };
}

function parseQty(
  raw: string | undefined,
  column: string,
  rowNumber: number,
  errors: ValidationError[],
  required: boolean,
): number {
  const s = (raw ?? '').trim();
  if (!s) {
    if (required) {
      errors.push({ row: rowNumber, column, message: `${column} is required.` });
    }
    return Number.NEGATIVE_INFINITY;
  }
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) {
    errors.push({
      row: rowNumber,
      column,
      message: `${column} must be a non-negative integer (got "${s}").`,
    });
    return Number.NEGATIVE_INFINITY;
  }
  return n;
}

function parseOptionalQty(
  raw: string | undefined,
  column: string,
  rowNumber: number,
  errors: ValidationError[],
): number | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  return parseQty(s, column, rowNumber, errors, false);
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function normalizeColumnName(raw: string): string {
  return raw
    .trim()
    .replace(/[\s\-]+/g, '_')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

interface BulkInput {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly uploadId: string;
  readonly createdByActorId: string;
  readonly rows: ReadonlyArray<ParsedRow>;
}

const BATCH = 1000;

async function bulkInsert(client: PoolClient, input: BulkInput): Promise<void> {
  for (let start = 0; start < input.rows.length; start += BATCH) {
    const batch = input.rows.slice(start, start + BATCH);
    const values: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const row of batch) {
      values.push(
        `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`,
      );
      params.push(
        ulid(),
        input.organizationId,
        input.workspaceId,
        input.uploadId,
        row.sku,
        row.warehouse,
        row.snapshotDate,
        row.onHand,
        row.reserved,
        row.available,
        row.inbound,
        row.unitCost !== null ? row.unitCost.toFixed(4) : null,
        row.currency,
      );
    }
    await client.query(
      `INSERT INTO xb_canonical.inventory_snapshots
         (id, organization_id, workspace_id, upload_id,
          sku, warehouse_code, snapshot_date,
          quantity_on_hand, quantity_reserved, quantity_available, quantity_inbound,
          unit_cost, currency_code)
       VALUES ${values.join(', ')}`,
      params,
    );
  }
}

function failedSummary({
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
      extra: { mode: 'strict' },
    },
    errorMessage,
  };
}
