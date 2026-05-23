import type { ComponentType } from 'react';

/**
 * Academy article shape.
 *
 * Each article is a typed module: meta + a React component that renders
 * the long-form body. Section primitives (Overview, WhyItMatters,
 * HowItWorks, ExampleWorkflow, CommonMistakes, QA, Related) compose
 * into the standardized article skeleton.
 *
 * Visibility: every authenticated user sees every article
 * (project_academy_surface universal-access rule).
 *
 * Categories below are the doc-style restructure (PR #34). They
 * replace the prior 5-section grouping. Order is the canonical
 * sidebar order.
 */
export interface AcademyArticleMeta {
  /** URL slug. Must match the route segment under /academy/[slug]. */
  readonly slug: string;
  /** Short title shown in the sidebar and article header. */
  readonly title: string;
  /** Top-level category grouping in the sidebar. */
  readonly category: AcademyCategory;
  /** One-line summary for search results + article header. */
  readonly summary: string;
  /** Search tags. Supplement the title / category in client-side search. */
  readonly tags: ReadonlyArray<string>;
  /** When `true`, the article renders as a "Coming soon" placeholder. */
  readonly stub?: boolean;
}

export interface AcademyArticle {
  readonly meta: AcademyArticleMeta;
  /** Long-form body component. Receives no props. */
  readonly Body: ComponentType;
}

export const ACADEMY_CATEGORIES = [
  'Getting Started',
  'Upload Templates',
  'Intelligence Concepts',
  'Inventory & Replenishment',
  'Advertising Intelligence',
  'SKU Normalization',
  'Forecasting',
  'Support & Operations',
  'Permissions & Roles',
  'WMS & Logistics',
] as const;

export type AcademyCategory = (typeof ACADEMY_CATEGORIES)[number];
