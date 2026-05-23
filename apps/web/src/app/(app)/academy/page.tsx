'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Search } from 'lucide-react';
import { Badge, Card, CardContent, PageHeader } from '@xb/ui';
import {
  ACADEMY_SECTIONS,
  listArticles,
  searchArticles,
  type AcademyArticle,
  type AcademySection,
} from '@/academy/index';

/**
 * Academy index — searchable topic catalogue. Every authenticated user
 * sees every article (platform-level knowledge). Stubs render with a
 * "Coming soon" badge but stay listed so the topic outline is visible
 * end-to-end.
 */
export default function AcademyIndexPage() {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchArticles(query), [query]);
  const grouped = useMemo(() => groupBySection(matches), [matches]);

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <PageHeader
        title="Academy"
        description="Concepts, data-pipeline reference, and operational guidance for XB Matrix."
      />

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Academy — topics, terms, concepts"
          className="h-10 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        />
      </div>

      {matches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No articles match “{query}”.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {ACADEMY_SECTIONS.filter((s) => grouped[s].length > 0).map((section) => (
            <section key={section} className="flex flex-col gap-3">
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {section}
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {grouped[section].map((article) => (
                  <ArticleCard key={article.meta.slug} article={article} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ArticleCard({ article }: { article: AcademyArticle }) {
  const { meta } = article;
  return (
    <Link
      href={`/academy/${meta.slug}`}
      className="group block rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-xb-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-orange" aria-hidden="true" />
          <h3 className="font-heading text-sm font-semibold text-foreground">
            {meta.title}
          </h3>
        </div>
        {meta.stub ? <Badge tone="neutral">Coming soon</Badge> : null}
      </div>
      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{meta.summary}</p>
      <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
        Read <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );
}

function groupBySection(
  articles: ReadonlyArray<AcademyArticle>,
): Record<AcademySection, ReadonlyArray<AcademyArticle>> {
  const out = ACADEMY_SECTIONS.reduce(
    (acc, section) => {
      acc[section] = [];
      return acc;
    },
    {} as Record<AcademySection, AcademyArticle[]>,
  );
  for (const a of articles) out[a.meta.section].push(a);
  return out;
}

