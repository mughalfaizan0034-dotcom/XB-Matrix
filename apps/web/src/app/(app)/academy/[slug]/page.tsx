'use client';

import { notFound, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge, Card, CardContent, PageHeader } from '@xb/ui';
import { getArticle, listArticles } from '@/academy/index';

/**
 * Academy article view. Resolves the slug against the typed article
 * registry; stub articles render with a "Coming soon" placeholder while
 * preserving the article shell so future content slots in cleanly.
 *
 * Marked as a client component so the slug routing + tagless body
 * component render together without a server round-trip. Articles are
 * static React modules — no network fetch needed.
 */
export default function AcademyArticlePage() {
  const params = useParams<{ slug: string }>();
  const article = getArticle(params.slug);
  if (!article) notFound();

  const { meta, Body } = article;
  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/academy"
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Academy
        </Link>
        <PageHeader
          title={meta.title}
          description={meta.summary}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="info">{meta.section}</Badge>
          {meta.stub ? <Badge tone="neutral">Coming soon</Badge> : null}
        </div>
      </div>

      {meta.stub ? (
        <StubPlaceholder />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Body />
          </CardContent>
        </Card>
      )}

      <RelatedArticles currentSlug={meta.slug} />
    </div>
  );
}

function StubPlaceholder() {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        This Academy article is on the roadmap and ships in a future
        release. Until then, the topic outline is visible from the
        Academy index so you can see what's coming.
      </CardContent>
    </Card>
  );
}

function RelatedArticles({ currentSlug }: { currentSlug: string }) {
  const others = listArticles().filter((a) => a.meta.slug !== currentSlug).slice(0, 4);
  if (others.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Continue reading
      </h2>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {others.map((a) => (
          <Link
            key={a.meta.slug}
            href={`/academy/${a.meta.slug}`}
            className="flex items-start justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:shadow-xb-sm"
          >
            <span>
              <span className="font-medium text-foreground">{a.meta.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">{a.meta.section}</span>
            </span>
            {a.meta.stub ? (
              <Badge tone="neutral">Coming soon</Badge>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
