import type { UploadKind } from '../../services/upload-service.js';
import { salesValidator } from './sales.js';
import { inventoryValidator } from './inventory.js';
import type { UploadValidator } from './types.js';

/**
 * Registry of per-module upload validators. Adding a new one is two
 * steps: write the validator (parse, validate, insert canonical rows)
 * and add it here. upload-service dispatches by kind automatically.
 */
const VALIDATORS: Map<UploadKind, UploadValidator> = new Map([
  [salesValidator.kind, salesValidator],
  [inventoryValidator.kind, inventoryValidator],
]);

export function getValidator(kind: UploadKind): UploadValidator | null {
  return VALIDATORS.get(kind) ?? null;
}

export type { UploadValidator, ValidatorInput, ValidatorResult, ValidationError, ValidationSummaryShape } from './types.js';
