import type { UploadKind } from '../../services/upload-service.js';
// PRIMARY all-channel mappers
import { salesPerformanceMapper, type SalesPerformanceRow } from './sales-performance.js';
import { inventoryPositionMapper, type InventoryPositionRow } from './inventory-position.js';
import { advertisingPerformanceMapper, type AdvertisingPerformanceRow } from './advertising-performance.js';
// SECONDARY per-marketplace adapters
import { amazonSalesMapper, type AmazonSalesRow } from './amazon-sales.js';
import { amazonInventoryMapper, type AmazonInventoryRow } from './amazon-inventory.js';
import { amazonAdsMapper, type AmazonAdsRow } from './amazon-ads.js';
import { walmartSalesMapper, type WalmartSalesRow } from './walmart-sales.js';
import type {
  NormalizedAdPerformance,
  NormalizedInventoryPosition,
  NormalizedSale,
  UploadMapper,
} from './types.js';

/**
 * Registry of per-kind upload mappers. Adding a new connector is two
 * steps: write the validator (under ./validators), write the mapper
 * (here), then register both. Downstream code (canonical writers,
 * engines, dashboards) never names the connector.
 *
 * The map is typed loosely (`unknown` row and entity types) because
 * each kind owns its TRow/TEntity pair. Callers that know the kind
 * statically should import the mapper directly to keep type safety.
 */
type AnyMapper = UploadMapper<unknown, unknown>;

const MAPPERS: Map<UploadKind, AnyMapper> = new Map([
  [salesPerformanceMapper.kind, salesPerformanceMapper as unknown as AnyMapper],
  [inventoryPositionMapper.kind, inventoryPositionMapper as unknown as AnyMapper],
  [advertisingPerformanceMapper.kind, advertisingPerformanceMapper as unknown as AnyMapper],
  [amazonSalesMapper.kind, amazonSalesMapper as unknown as AnyMapper],
  [amazonInventoryMapper.kind, amazonInventoryMapper as unknown as AnyMapper],
  [amazonAdsMapper.kind, amazonAdsMapper as unknown as AnyMapper],
  [walmartSalesMapper.kind, walmartSalesMapper as unknown as AnyMapper],
]);

export function getMapper(kind: UploadKind): AnyMapper | null {
  return MAPPERS.get(kind) ?? null;
}

export {
  salesPerformanceMapper,
  inventoryPositionMapper,
  advertisingPerformanceMapper,
  amazonSalesMapper,
  amazonInventoryMapper,
  amazonAdsMapper,
  walmartSalesMapper,
};
export type {
  SalesPerformanceRow,
  InventoryPositionRow,
  AdvertisingPerformanceRow,
  AmazonSalesRow,
  AmazonInventoryRow,
  AmazonAdsRow,
  WalmartSalesRow,
  NormalizedSale,
  NormalizedInventoryPosition,
  NormalizedAdPerformance,
  UploadMapper,
};
export * from './types.js';
