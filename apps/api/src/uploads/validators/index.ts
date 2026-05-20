import type { UploadKind } from '../../services/upload-service.js';
// Legacy validators — write into temporary canonical tables
// (sales_orders, inventory_snapshots). Bridged to Spec 3 shapes when
// the canonical DDL ships, then dropped.
import { salesValidator } from './sales.js';
import { inventoryValidator } from './inventory.js';
// Spec-aligned validators — Part 1 §Uploads templates. Parse + validate +
// produce summary. Canonical insertion lands when Spec 3 §10.9+ DDL ships.
import { amazonSalesValidator } from './amazon-sales.js';
import { amazonInventoryValidator } from './amazon-inventory.js';
import { amazonAdsValidator } from './amazon-ads.js';
// Second-marketplace connector — proves the validator + mapper
// abstraction is marketplace-agnostic. See CLAUDE.md Part 4.
import { walmartSalesValidator } from './walmart-sales.js';
import type { UploadValidator } from './types.js';

/**
 * Registry of per-module upload validators. Adding a new one is two
 * steps: write the validator (parse, validate, insert canonical rows)
 * and add it here. upload-service dispatches by kind automatically.
 */
const VALIDATORS: Map<UploadKind, UploadValidator> = new Map([
  [salesValidator.kind, salesValidator],
  [inventoryValidator.kind, inventoryValidator],
  [amazonSalesValidator.kind, amazonSalesValidator],
  [amazonInventoryValidator.kind, amazonInventoryValidator],
  [amazonAdsValidator.kind, amazonAdsValidator],
  [walmartSalesValidator.kind, walmartSalesValidator],
]);

export function getValidator(kind: UploadKind): UploadValidator | null {
  return VALIDATORS.get(kind) ?? null;
}

export type { UploadValidator, ValidatorInput, ValidatorResult, ValidationError, ValidationSummaryShape } from './types.js';
