import type { UploadKind } from '../../services/upload-service.js';
import { amazonSalesMapper, type AmazonSalesRow } from './amazon-sales.js';
import { amazonInventoryMapper, type AmazonInventoryRow } from './amazon-inventory.js';
import { amazonAdsMapper, type AmazonAdsRow } from './amazon-ads.js';
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
  [amazonSalesMapper.kind, amazonSalesMapper as unknown as AnyMapper],
  [amazonInventoryMapper.kind, amazonInventoryMapper as unknown as AnyMapper],
  [amazonAdsMapper.kind, amazonAdsMapper as unknown as AnyMapper],
]);

export function getMapper(kind: UploadKind): AnyMapper | null {
  return MAPPERS.get(kind) ?? null;
}

export {
  amazonSalesMapper,
  amazonInventoryMapper,
  amazonAdsMapper,
};
export type {
  AmazonSalesRow,
  AmazonInventoryRow,
  AmazonAdsRow,
  NormalizedSale,
  NormalizedInventoryPosition,
  NormalizedAdPerformance,
  UploadMapper,
};
export * from './types.js';
