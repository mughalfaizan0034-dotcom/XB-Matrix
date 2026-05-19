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
 * Sales upload validator.
 *
 * Expected CSV columns (case-insensitive, snake_case_or_camelCase tolerated):
 *   order_id        — string, non-empty, ≤ 200 chars
 *   sku             — string, non-empty, ≤ 200 chars
 *   quantity        — positive integer
 *   unit_price      — non-negative decimal (parsed at 4-decimal precision)
 *   currency        — 3-letter uppercase code
 *   order_date      — ISO date (YYYY-MM-DD) or any value Date.parse can read
 *   marketplace     — optional string
 *   channel         — optional string
 *
 * Strict mode: if any row has any error, the whole upload is rejected
 * (status='failed', no canonical rows inserted). The user fixes the
 * errors locally and re-uploads. Partial-success mode is deferred until
 * the UX for resolving rejected rows in-place exists.
 *
 * Bulk insert: rows are batched (1000 per query) so we don't blow out
 * statement size on 100k-row files. Single transaction shared with the
 * upload-service so the rows + the status update are atomic.
 */
export const salesValidator: UploadValidator = {
  kind: 'sales',
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

    const headerSet = new Set(
      records.length > 0 ? Object.keys(records[0]!) : [],
    );
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

    const accepted: ParsedSalesRow[] = [];
    const errors: ValidationError[] = [];

    for (let i = 0; i < records.length; i++) {
      const raw = records[i]!;
      const rowNumber = i + 2; // header is row 1; data starts at row 2
      const result = parseSalesRow(raw, rowNumber);
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
          rowsAccepted: 0, // strict mode: nothing persisted if any errors
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

    // All rows valid — bulk insert.
    if (accepted.length > 0) {
      await bulkInsertSales(input.client, {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        uploadId: input.uploadId,
        createdByActorId: input.actor.actorId,
        rows: accepted,
      });
    }

    const totalAmount = accepted.reduce((acc, r) => acc + r.unitPrice * r.quantity, 0);
    const distinctSkus = new Set(accepted.map((r) => r.sku)).size;
    const dateRange =
      accepted.length > 0
        ? {
            from: accepted.reduce(
              (min, r) => (r.orderDate < min ? r.orderDate : min),
              accepted[0]!.orderDate,
            ),
            to: accepted.reduce(
              (max, r) => (r.orderDate > max ? r.orderDate : max),
              accepted[0]!.orderDate,
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
          totalGrossAmount: totalAmount.toFixed(4),
          dateRange,
        },
      },
    };
  },
};

// ---- helpers ----------------------------------------------------------------

const REQUIRED_COLUMNS = [
  'order_id',
  'sku',
  'quantity',
  'unit_price',
  'currency',
  'order_date',
] as const;

interface ParsedSalesRow {
  orderId: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  orderDate: string; // ISO YYYY-MM-DD
  marketplace: string | null;
  channel: string | null;
}

type RowParseResult =
  | { ok: true; row: ParsedSalesRow }
  | { ok: false; errors: ValidationError[] };

function parseSalesRow(raw: Record<string, string>, rowNumber: number): RowParseResult {
  const errors: ValidationError[] = [];

  const orderId = (raw.order_id ?? '').trim();
  if (!orderId) errors.push({ row: rowNumber, column: 'order_id', message: 'order_id is required.' });
  else if (orderId.length > 200)
    errors.push({ row: rowNumber, column: 'order_id', message: 'order_id is longer than 200 characters.' });

  const sku = (raw.sku ?? '').trim();
  if (!sku) errors.push({ row: rowNumber, column: 'sku', message: 'sku is required.' });
  else if (sku.length > 200)
    errors.push({ row: rowNumber, column: 'sku', message: 'sku is longer than 200 characters.' });

  const qtyRaw = (raw.quantity ?? '').trim();
  const quantity = Number(qtyRaw);
  if (!qtyRaw) errors.push({ row: rowNumber, column: 'quantity', message: 'quantity is required.' });
  else if (!Number.isInteger(quantity) || quantity <= 0)
    errors.push({
      row: rowNumber,
      column: 'quantity',
      message: `quantity must be a positive integer (got "${qtyRaw}").`,
    });

  const priceRaw = (raw.unit_price ?? '').trim();
  const unitPrice = Number(priceRaw);
  if (!priceRaw)
    errors.push({ row: rowNumber, column: 'unit_price', message: 'unit_price is required.' });
  else if (!Number.isFinite(unitPrice) || unitPrice < 0)
    errors.push({
      row: rowNumber,
      column: 'unit_price',
      message: `unit_price must be a non-negative number (got "${priceRaw}").`,
    });

  const currencyRaw = (raw.currency ?? '').trim().toUpperCase();
  if (!currencyRaw)
    errors.push({ row: rowNumber, column: 'currency', message: 'currency is required.' });
  else if (!/^[A-Z]{3}$/.test(currencyRaw))
    errors.push({
      row: rowNumber,
      column: 'currency',
      message: `currency must be a 3-letter ISO code (got "${currencyRaw}").`,
    });

  const dateRaw = (raw.order_date ?? '').trim();
  let orderDate = '';
  if (!dateRaw) {
    errors.push({ row: rowNumber, column: 'order_date', message: 'order_date is required.' });
  } else {
    // Accept YYYY-MM-DD, ISO timestamps, MM/DD/YYYY, etc — anything Date.parse handles.
    const ts = Date.parse(dateRaw);
    if (Number.isNaN(ts)) {
      errors.push({
        row: rowNumber,
        column: 'order_date',
        message: `order_date is not a recognized date (got "${dateRaw}").`,
      });
    } else {
      orderDate = new Date(ts).toISOString().slice(0, 10);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    row: {
      orderId,
      sku,
      quantity,
      unitPrice,
      currency: currencyRaw,
      orderDate,
      marketplace: emptyToNull(raw.marketplace),
      channel: emptyToNull(raw.channel),
    },
  };
}

function emptyToNull(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  return s ? s : null;
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * Normalize header strings so case + whitespace + camelCase vs snake_case
 * don't break the required-column check. "Order ID", "orderId", "ORDER_ID"
 * all collapse to "order_id".
 */
function normalizeColumnName(raw: string): string {
  return raw
    .trim()
    .replace(/[\s\-]+/g, '_')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

interface BulkInsertInput {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly uploadId: string;
  readonly createdByActorId: string;
  readonly rows: ReadonlyArray<ParsedSalesRow>;
}

const INSERT_BATCH_SIZE = 1000;

async function bulkInsertSales(client: PoolClient, input: BulkInsertInput): Promise<void> {
  for (let start = 0; start < input.rows.length; start += INSERT_BATCH_SIZE) {
    const batch = input.rows.slice(start, start + INSERT_BATCH_SIZE);
    const values: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const row of batch) {
      const total = (row.unitPrice * row.quantity).toFixed(4);
      values.push(
        `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`,
      );
      params.push(
        ulid(),                       // id
        input.organizationId,         // organization_id
        input.workspaceId,            // workspace_id
        input.uploadId,               // upload_id
        row.orderId,                  // order_id
        row.sku,                      // sku
        row.quantity,                 // quantity
        row.unitPrice.toFixed(4),     // unit_price
        total,                        // total_price
        row.currency,                 // currency_code
        row.orderDate,                // order_date
        row.marketplace,              // marketplace
        row.channel,                  // channel
      );
    }
    await client.query(
      `INSERT INTO xb_canonical.sales_orders
         (id, organization_id, workspace_id, upload_id,
          order_id, sku, quantity, unit_price, total_price,
          currency_code, order_date, marketplace, channel)
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
