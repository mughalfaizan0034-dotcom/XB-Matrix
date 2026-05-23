import type { AcademyArticle, AcademyArticleMeta, AcademyCategory } from './types.js';
import { uploadTemplatesArticle } from './articles/upload-templates.js';

/**
 * Academy article registry.
 *
 * One real article today (Upload Templates) plus typed stubs covering
 * every category in the doc-style outline. Stubs render with a
 * "Coming soon" placeholder so the topic structure is visible end-
 * to-end; each gets fleshed out in subsequent atomic PRs.
 *
 * Visibility: every authenticated user sees every article (platform-
 * level knowledge; see project_academy_surface universal-access rule).
 */

function stub(meta: Omit<AcademyArticleMeta, 'stub'>): AcademyArticle {
  return {
    meta: { ...meta, stub: true },
    Body: () => null, // shell renders the placeholder for stubs
  };
}

const ARTICLES: ReadonlyArray<AcademyArticle> = [
  // -- Real content ---------------------------------------------------
  uploadTemplatesArticle,

  // -- Getting Started ------------------------------------------------
  stub({
    slug: 'getting-started',
    title: 'Getting Started',
    category: 'Getting Started',
    summary: 'Orientation tour of XB Matrix: workspaces, your first upload, the operational dashboard.',
    tags: ['onboarding', 'workspace', 'first steps'],
  }),

  // -- Upload Templates -----------------------------------------------
  stub({
    slug: 'upload-examples',
    title: 'Upload Examples',
    category: 'Upload Templates',
    summary: 'Sample rows for every template, including B2B splits, attribution windows, and remove-action lifecycle.',
    tags: ['example', 'sample', 'csv'],
  }),
  stub({
    slug: 'cogs-template',
    title: 'COGs Template',
    category: 'Upload Templates',
    summary: 'Minimal sku + cogs feed for the future profitability engine.',
    tags: ['cogs', 'cost', 'profitability', 'template'],
  }),
  stub({
    slug: 'case-pack-template',
    title: 'Case Pack Template',
    category: 'Upload Templates',
    summary: 'Box / pallet packaging constraints for replenishment rounding.',
    tags: ['case pack', 'pallet', 'box', 'replenishment', 'template'],
  }),
  stub({
    slug: 'sku-status-template',
    title: 'SKU Status Template',
    category: 'Upload Templates',
    summary: 'Active / discontinued flag per SKU. Preserves analytics history while excluding discontinued SKUs from replenishment paths.',
    tags: ['sku', 'status', 'discontinued', 'lifecycle', 'template'],
  }),

  // -- Intelligence Concepts ------------------------------------------
  stub({
    slug: 'canonical-data-model',
    title: 'Canonical Data Model',
    category: 'Intelligence Concepts',
    summary: 'channel_sales, channel_ads, channel_inventory: the canonical period-aggregated layer the engine reads from.',
    tags: ['canonical', 'channel_sales', 'channel_ads', 'schema'],
  }),
  stub({
    slug: 'ai-intelligence-concepts',
    title: 'AI Intelligence Concepts',
    category: 'Intelligence Concepts',
    summary: 'How AI insights and recommendations layer on top of engine outputs.',
    tags: ['ai', 'insight', 'recommendation'],
  }),
  stub({
    slug: 'omnichannel-reporting',
    title: 'Omnichannel Reporting',
    category: 'Intelligence Concepts',
    summary: 'Cross-marketplace, cross-platform views: blended TACOS, channel comparison, marketplace drilldowns.',
    tags: ['omnichannel', 'cross-channel', 'blended'],
  }),
  stub({
    slug: 'brand-management',
    title: 'Brand Management',
    category: 'Intelligence Concepts',
    summary: 'Brand as a canonical dimension: normalization, rollups, brand-level intelligence.',
    tags: ['brand', 'aggregation', 'portfolio'],
  }),

  // -- Inventory & Replenishment --------------------------------------
  stub({
    slug: 'inventory-intelligence',
    title: 'Inventory Intelligence',
    category: 'Inventory & Replenishment',
    summary: 'Stock cover, stockout risk, dead stock: engine derivations over latest-snapshot inventory and sales velocity.',
    tags: ['inventory', 'stock cover', 'replenishment', 'dos'],
  }),

  // -- Advertising Intelligence ---------------------------------------
  stub({
    slug: 'advertising-intelligence',
    title: 'Advertising Intelligence',
    category: 'Advertising Intelligence',
    summary: 'Spend, attributed sales, attribution windows, and how they combine into ACOS / TACOS / ROAS / CTR / CPC / CVR.',
    tags: ['advertising', 'ppc', 'acos', 'tacos', 'roas'],
  }),
  stub({
    slug: 'tacos-acos-roas',
    title: 'TACOS / ACOS / ROAS Concepts',
    category: 'Advertising Intelligence',
    summary: 'What each metric measures, which denominator the engine uses, and how attribution windows pivot them.',
    tags: ['tacos', 'acos', 'roas', 'metric definition'],
  }),

  // -- SKU Normalization ----------------------------------------------
  stub({
    slug: 'sku-normalization',
    title: 'SKU Normalization',
    category: 'SKU Normalization',
    summary: 'How platform-specific SKU codes resolve to one canonical sku_normalized, including the unresolved queue.',
    tags: ['sku', 'alias', 'normalization', 'unresolved'],
  }),
  stub({
    slug: 'marketplace-and-platform-mapping',
    title: 'Marketplace & Platform Mapping',
    category: 'SKU Normalization',
    summary: 'Marketplace, platform, target_marketplace, ad_platform_code: what each dimension means.',
    tags: ['marketplace', 'platform', 'channel', 'dimension'],
  }),

  // -- Support & Operations -------------------------------------------
  stub({
    slug: 'troubleshooting',
    title: 'Troubleshooting',
    category: 'Support & Operations',
    summary: 'Validation failures, unresolved SKUs, missing engine readiness: diagnostic steps.',
    tags: ['troubleshooting', 'validation', 'error'],
  }),
  stub({
    slug: 'best-practices',
    title: 'Best Practices',
    category: 'Support & Operations',
    summary: 'Upload cadence, alias hygiene, brand normalization, reconciliation habits.',
    tags: ['best practice', 'operations', 'hygiene'],
  }),
  stub({
    slug: 'faq',
    title: 'FAQ',
    category: 'Support & Operations',
    summary: 'Quick answers to the questions operators ask most often.',
    tags: ['faq'],
  }),

  // -- Permissions & Roles --------------------------------------------
  stub({
    slug: 'permissions-and-organization-setup',
    title: 'Permissions & Organization Setup',
    category: 'Permissions & Roles',
    summary: 'Roles, workspace access levels, and how organizations + users + workspaces fit together.',
    tags: ['permissions', 'roles', 'workspace', 'organization'],
  }),
];

// ----- Lookup helpers ------------------------------------------------

export function listArticles(): ReadonlyArray<AcademyArticle> {
  return ARTICLES;
}

export function getArticle(slug: string): AcademyArticle | null {
  return ARTICLES.find((a) => a.meta.slug === slug) ?? null;
}

export function searchArticles(query: string): ReadonlyArray<AcademyArticle> {
  const q = query.trim().toLowerCase();
  if (!q) return ARTICLES;
  return ARTICLES.filter((a) => {
    const haystack = [
      a.meta.title,
      a.meta.summary,
      a.meta.category,
      ...a.meta.tags,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** Articles grouped by category, preserving canonical sidebar order. */
export function articlesByCategory(): ReadonlyArray<{
  category: AcademyCategory;
  articles: ReadonlyArray<AcademyArticle>;
}> {
  const map = new Map<AcademyCategory, AcademyArticle[]>();
  for (const a of ARTICLES) {
    const cat = a.meta.category;
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(a);
  }
  return [...map.entries()].map(([category, articles]) => ({ category, articles }));
}

export { ACADEMY_CATEGORIES } from './types.js';
export type { AcademyArticle, AcademyArticleMeta, AcademyCategory } from './types.js';
