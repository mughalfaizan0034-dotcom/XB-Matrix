import type { UploadKind } from './api-uploads';

/**
 * Operational-category labels for upload kinds.
 *
 * The platform's business entity is the operational category (Sales
 * Performance, Inventory Position, Advertising Performance, …), not
 * the marketplace. Per-platform kinds are "source formats" feeding
 * each category. This module is the single source of truth for how
 * the UI labels each kind — the dropdown, the history column, the
 * detail drawer, the validation-errors panel all read from here.
 *
 * See CLAUDE.md "uploads are operational categories" + the matching
 * memory under feedback_uploads_are_operational_categories.
 */

export type UploadCategory =
  | 'sales'
  | 'inventory'
  | 'advertising'
  | 'warehouse'
  | 'settlement'
  | 'forecast'
  | 'other';

export interface KindMeta {
  readonly category: UploadCategory;
  readonly categoryLabel: string;     // "Sales Performance"
  readonly platformLabel: string;     // "Amazon" / "Walmart" / null for non-platform kinds
  readonly compactLabel: string;       // "Sales · Amazon" — for table cells
  readonly fullLabel: string;          // "Sales Performance — Amazon" — for dropdowns
  readonly legacy?: boolean;
}

export const UPLOAD_KIND_META: Record<UploadKind, KindMeta> = {
  amazon_sales: {
    category: 'sales',
    categoryLabel: 'Sales Performance',
    platformLabel: 'Amazon',
    compactLabel: 'Sales · Amazon',
    fullLabel: 'Sales Performance — Amazon',
  },
  walmart_sales: {
    category: 'sales',
    categoryLabel: 'Sales Performance',
    platformLabel: 'Walmart',
    compactLabel: 'Sales · Walmart',
    fullLabel: 'Sales Performance — Walmart',
  },
  amazon_inventory: {
    category: 'inventory',
    categoryLabel: 'Inventory Position',
    platformLabel: 'Amazon (FBA)',
    compactLabel: 'Inventory · Amazon (FBA)',
    fullLabel: 'Inventory Position — Amazon (FBA)',
  },
  amazon_ads: {
    category: 'advertising',
    categoryLabel: 'Advertising Performance',
    platformLabel: 'Amazon Ads',
    compactLabel: 'Ads · Amazon',
    fullLabel: 'Advertising Performance — Amazon Ads',
  },
  generic: {
    category: 'other',
    categoryLabel: 'Other',
    platformLabel: 'Generic file',
    compactLabel: 'Generic file',
    fullLabel: 'Generic file (no validator)',
  },
  // Legacy kinds — keep them displayable so existing rows render, but
  // mark explicitly so the UI can de-emphasize them.
  sales: {
    category: 'sales',
    categoryLabel: 'Sales Performance',
    platformLabel: 'Legacy',
    compactLabel: 'Sales · Legacy',
    fullLabel: 'Sales (legacy)',
    legacy: true,
  },
  inventory: {
    category: 'inventory',
    categoryLabel: 'Inventory Position',
    platformLabel: 'Legacy',
    compactLabel: 'Inventory · Legacy',
    fullLabel: 'Inventory (legacy)',
    legacy: true,
  },
  ad_spend: {
    category: 'advertising',
    categoryLabel: 'Advertising Performance',
    platformLabel: 'Legacy',
    compactLabel: 'Ads · Legacy',
    fullLabel: 'Ad spend (legacy)',
    legacy: true,
  },
  shipments: {
    category: 'other',
    categoryLabel: 'Other',
    platformLabel: 'Shipments',
    compactLabel: 'Shipments',
    fullLabel: 'Shipments',
  },
  returns: {
    category: 'other',
    categoryLabel: 'Other',
    platformLabel: 'Returns',
    compactLabel: 'Returns',
    fullLabel: 'Returns',
  },
};

/**
 * Group upload kinds by operational category for grouped dropdowns.
 * Order matches the Templates panel: sales → inventory → advertising →
 * other → legacy at the end.
 */
export function groupKindsByCategory(
  kinds: ReadonlyArray<UploadKind>,
): ReadonlyArray<{ category: UploadCategory; categoryLabel: string; kinds: ReadonlyArray<UploadKind> }> {
  const order: ReadonlyArray<UploadCategory> = [
    'sales',
    'inventory',
    'advertising',
    'warehouse',
    'settlement',
    'forecast',
    'other',
  ];
  const map = new Map<UploadCategory, { categoryLabel: string; current: UploadKind[]; legacy: UploadKind[] }>();
  for (const k of kinds) {
    const meta = UPLOAD_KIND_META[k];
    const bucket = map.get(meta.category) ?? {
      categoryLabel: meta.categoryLabel,
      current: [],
      legacy: [],
    };
    (meta.legacy ? bucket.legacy : bucket.current).push(k);
    map.set(meta.category, bucket);
  }
  type Group = { category: UploadCategory; categoryLabel: string; kinds: ReadonlyArray<UploadKind> };
  const out: Group[] = [];
  for (const cat of order) {
    const b = map.get(cat);
    if (!b) continue;
    // Current formats first; legacy kinds tucked at the end of the
    // group so they don't visually compete with the spec-aligned ones.
    out.push({ category: cat, categoryLabel: b.categoryLabel, kinds: [...b.current, ...b.legacy] });
  }
  return out;
}
