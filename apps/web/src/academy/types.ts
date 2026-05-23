import type { ComponentType } from 'react';

/**
 * Academy article shape. Each article is a typed module: meta + a
 * React component that renders the long-form body. Storing articles
 * as components (rather than MDX or markdown) keeps the surface
 * type-safe and avoids a new build-time dependency for the first
 * slice; MDX can replace this when the article count grows beyond
 * what's pleasant to write in JSX.
 *
 * Articles are platform-level knowledge, every authenticated user
 * sees every article (per project_academy_surface visibility model).
 */
export interface AcademyArticleMeta {
  /** URL slug, must match the route segment under /academy/[slug]. */
  readonly slug: string;
  /** Short title shown in the index, sidebar, and article header. */
  readonly title: string;
  /** Section grouping in the index page. */
  readonly section: AcademySection;
  /** One-line summary for index cards + search results. */
  readonly summary: string;
  /** Search tags, supplements the title/headings in client-side search. */
  readonly tags: ReadonlyArray<string>;
  /** When `true`, the article renders as a "Coming soon" placeholder. */
  readonly stub?: boolean;
}

export interface AcademyArticle {
  readonly meta: AcademyArticleMeta;
  /** Long-form body component. Receives no props. */
  readonly Body: ComponentType;
}

export const ACADEMY_SECTIONS = [
  'Getting Started',
  'Data Pipeline',
  'Intelligence Concepts',
  'Operations',
  'Reference',
] as const;

export type AcademySection = (typeof ACADEMY_SECTIONS)[number];
