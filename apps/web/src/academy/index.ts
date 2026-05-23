import type { AcademyArticle, AcademyArticleMeta } from './types.js';
import { uploadTemplatesArticle } from './articles/upload-templates.js';

/**
 * Academy article registry.
 *
 * One real article today (Upload Templates) plus 14 typed stubs that
 * render as "Coming soon" placeholders. Stubs ship now so the topic
 * outline is visible end-to-end and operators can see what's planned;
 * each stub gets fleshed out in subsequent atomic PRs.
 *
 * Visibility: every authenticated user sees every article (platform-
 * level knowledge; see project_academy_surface memory).
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

  // -- Stubs (alphabetized inside each section) -----------------------
  stub({
    slug: 'getting-started',
    title: 'Getting Started',
    section: 'Getting Started',
    summary: 'Orientation tour of XB Matrix, workspace setup, your first upload, and the operational dashboard.',
    tags: ['onboarding', 'workspace', 'first steps'],
  }),
  stub({
    slug: 'permissions-and-organization-setup',
    title: 'Permissions & Organization Setup',
    section: 'Getting Started',
    summary: 'Roles, workspace access levels, and how organizations + users + workspaces fit together.',
    tags: ['permissions', 'roles', 'workspace', 'organization'],
  }),

  stub({
    slug: 'sku-normalization',
    title: 'SKU Normalization',
    section: 'Data Pipeline',
    summary: 'How platform-specific SKU codes resolve to one canonical sku_normalized, alias maps, the unresolved queue, and resolution rules.',
    tags: ['sku', 'alias', 'normalization', 'unresolved'],
  }),
  stub({
    slug: 'marketplace-and-platform-mapping',
    title: 'Marketplace & Platform Mapping',
    section: 'Data Pipeline',
    summary: 'Marketplace, platform, target_marketplace, ad_platform_code, what each dimension means and when to use which.',
    tags: ['marketplace', 'platform', 'channel', 'dimension'],
  }),
  stub({
    slug: 'canonical-data-model',
    title: 'Canonical Data Model',
    section: 'Data Pipeline',
    summary: 'channel_sales, channel_ads, channel_inventory, the canonical period-aggregated layer engines read from.',
    tags: ['canonical', 'channel_sales', 'channel_ads', 'schema'],
  }),
  stub({
    slug: 'upload-examples',
    title: 'Upload Examples',
    section: 'Data Pipeline',
    summary: 'Sample rows for every template, including B2B splits, attribution windows, and remove-action lifecycle.',
    tags: ['example', 'sample', 'csv'],
  }),
  stub({
    slug: 'cogs-template',
    title: 'COGs Template',
    section: 'Data Pipeline',
    summary: 'Minimal sku + cogs feed for the future profitability engine, numeric-only formatting, backend handles normalization + currency.',
    tags: ['cogs', 'cost', 'profitability', 'unit economics', 'template'],
  }),
  stub({
    slug: 'case-pack-template',
    title: 'Case Pack Template',
    section: 'Data Pipeline',
    summary: 'Box / pallet packaging constraints that let the replenishment engine round recommendations to operational units.',
    tags: ['case pack', 'pallet', 'box', 'replenishment', 'template'],
  }),
  stub({
    slug: 'sku-status-template',
    title: 'SKU Status Template',
    section: 'Data Pipeline',
    summary: 'Active / discontinued flag per SKU, preserves analytics history while excluding discontinued SKUs from replenishment, restock alerts, and forecasting paths.',
    tags: ['sku', 'status', 'discontinued', 'lifecycle', 'replenishment', 'template'],
  }),

  stub({
    slug: 'advertising-intelligence',
    title: 'Advertising Intelligence',
    section: 'Intelligence Concepts',
    summary: 'How spend, attributed sales, attribution windows, and channel_sales combine into ACOS / TACOS / ROAS / CTR / CPC / CVR.',
    tags: ['advertising', 'ppc', 'acos', 'tacos', 'roas'],
  }),
  stub({
    slug: 'inventory-intelligence',
    title: 'Inventory Intelligence',
    section: 'Intelligence Concepts',
    summary: 'Stock cover, stockout risk, dead stock, engine derivations over latest-snapshot inventory + sales velocity.',
    tags: ['inventory', 'stock cover', 'replenishment', 'dos'],
  }),
  stub({
    slug: 'tacos-acos-roas',
    title: 'TACOS / ACOS / ROAS Concepts',
    section: 'Intelligence Concepts',
    summary: 'What each metric measures, which denominator the engine uses, and how the attribution window pivots them.',
    tags: ['tacos', 'acos', 'roas', 'metric definition'],
  }),
  stub({
    slug: 'brand-management',
    title: 'Brand Management',
    section: 'Intelligence Concepts',
    summary: 'Brand as a canonical dimension, normalization, cross-marketplace rollups, brand-level intelligence.',
    tags: ['brand', 'aggregation', 'portfolio'],
  }),
  stub({
    slug: 'omnichannel-reporting',
    title: 'Omnichannel Reporting',
    section: 'Intelligence Concepts',
    summary: 'Cross-marketplace, cross-platform views, blended TACOS, channel comparison, marketplace drilldowns.',
    tags: ['omnichannel', 'cross-channel', 'blended'],
  }),
  stub({
    slug: 'ai-intelligence-concepts',
    title: 'AI Intelligence Concepts',
    section: 'Intelligence Concepts',
    summary: 'How AI insights and recommendations layer on top of engine outputs (never raw uploads).',
    tags: ['ai', 'insight', 'recommendation'],
  }),

  stub({
    slug: 'troubleshooting',
    title: 'Troubleshooting',
    section: 'Operations',
    summary: 'Validation failures, unresolved SKUs, missing engine readiness, diagnostic steps for common issues.',
    tags: ['troubleshooting', 'validation', 'error'],
  }),
  stub({
    slug: 'best-practices',
    title: 'Best Practices',
    section: 'Operations',
    summary: 'Upload cadence, alias hygiene, brand normalization, and reconciliation habits that keep intelligence trustworthy.',
    tags: ['best practice', 'operations', 'hygiene'],
  }),

  stub({
    slug: 'faq',
    title: 'FAQ',
    section: 'Reference',
    summary: 'Quick answers to the questions operators ask most often.',
    tags: ['faq'],
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
      a.meta.section,
      ...a.meta.tags,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export { ACADEMY_SECTIONS } from './types.js';
export type { AcademyArticle, AcademyArticleMeta, AcademySection } from './types.js';
