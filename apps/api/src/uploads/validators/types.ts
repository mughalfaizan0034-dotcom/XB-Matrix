import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import type { ActorContext } from '@xb/types';
import type { UploadKind } from '../../services/upload-service.js';

/**
 * Shared interface every per-module upload validator implements. The
 * registry in `./index.ts` dispatches by `kind`; upload-service calls
 * `validate()` inside the same transaction that inserted the upload
 * row, so canonical inserts + the upload-status update are atomic.
 */
export interface UploadValidator {
  readonly kind: UploadKind;
  validate(input: ValidatorInput): Promise<ValidatorResult>;
}

export interface ValidatorInput {
  readonly app: FastifyInstance;
  readonly actor: ActorContext;
  /** Open transaction client; canonical rows + summary share this tx. */
  readonly client: PoolClient;
  readonly uploadId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly buffer: Buffer;
  readonly originalFilename: string;
}

/**
 * Per-row validation error. Row numbers are 1-based for human display
 * (matches what Excel / Google Sheets show in the gutter).
 */
export interface ValidationError {
  readonly row: number;
  readonly column?: string;
  readonly message: string;
}

/**
 * Common envelope every validator returns. `summary` is opaque (per-
 * module shape) but every implementation includes `rowsParsed`,
 * `rowsAccepted`, `rowsRejected`, `columnsDetected`, `columnsMissing`,
 * `errors` so the generic UI renderer can show the basics for any
 * kind without a typed renderer.
 */
export interface ValidatorResult {
  readonly ok: boolean;
  readonly summary: ValidationSummaryShape;
  readonly errorMessage?: string;
}

export interface ValidationSummaryShape {
  readonly rowsParsed: number;
  readonly rowsAccepted: number;
  readonly rowsRejected: number;
  readonly columnsDetected: ReadonlyArray<string>;
  readonly columnsMissing: ReadonlyArray<string>;
  /** Capped sample so the JSON blob doesn't explode for huge files. */
  readonly errors: ReadonlyArray<ValidationError>;
  /** Per-module fields go here. */
  readonly extra?: Record<string, unknown>;
}

/** Max error samples returned to the UI; full count lives in `rowsRejected`. */
export const MAX_ERROR_SAMPLES = 100;
