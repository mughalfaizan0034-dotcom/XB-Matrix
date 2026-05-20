import type { UploadKind } from '../../services/upload-service.js';
// Legacy validators — write into temporary canonical tables
// (sales_orders, inventory_snapshots). Bridged to Spec 3 shapes when
// the canonical DDL ships, then dropped.
import { salesValidator } from './sales.js';
import { inventoryValidator } from './inventory.js';
// Spec-aligned validators — Part 1 §Uploads templates. Parse + validate +
// produce summary. Canonical insertion lands when Spec 3 §10.9+ DDL ships.
// PRIMARY operational templates — omnichannel normalized shape, one
// per operational dataset. Marketplace/platform lives as a column on
// each row. See CLAUDE.md "uploads are operational categories".
import { salesPerformanceValidator } from './sales-performance.js';
import { inventoryPositionValidator } from './inventory-position.js';
import { advertisingPerformanceValidator } from './advertising-performance.js';

// SECONDARY per-marketplace ADAPTERS — preserve native field names at
// the edge for operators exporting straight from the platform. Translate
// to the same Normalized* contract downstream. Demoted in the UI.
import { amazonSalesValidator } from './amazon-sales.js';
import { amazonInventoryValidator } from './amazon-inventory.js';
import { amazonAdsValidator } from './amazon-ads.js';
import { walmartSalesValidator } from './walmart-sales.js';
import type { UploadValidator } from './types.js';

/**
 * Registry of per-module upload validators. Adding a new one is two
 * steps: write the validator (parse, validate, insert canonical rows)
 * and add it here. upload-service dispatches by kind automatically.
 */
const VALIDATORS: Map<UploadKind, UploadValidator> = new Map([
  [salesPerformanceValidator.kind, salesPerformanceValidator],
  [inventoryPositionValidator.kind, inventoryPositionValidator],
  [advertisingPerformanceValidator.kind, advertisingPerformanceValidator],
  [amazonSalesValidator.kind, amazonSalesValidator],
  [amazonInventoryValidator.kind, amazonInventoryValidator],
  [amazonAdsValidator.kind, amazonAdsValidator],
  [walmartSalesValidator.kind, walmartSalesValidator],
  [salesValidator.kind, salesValidator],
  [inventoryValidator.kind, inventoryValidator],
]);

export function getValidator(kind: UploadKind): UploadValidator | null {
  return VALIDATORS.get(kind) ?? null;
}

export type { UploadValidator, ValidatorInput, ValidatorResult, ValidationError, ValidationSummaryShape } from './types.js';
