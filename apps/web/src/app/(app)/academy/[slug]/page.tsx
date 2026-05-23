import { notFound } from 'next/navigation';
import { Badge } from '@xb/ui';
import { getArticle, listArticles } from '@/academy/index';

/**
 * Academy article view, SERVER component.
 *
 * Resolves the slug against the typed article registry. Stub articles
 * render with a "Coming soon" placeholder while preserving the
 * article shell. Real articles compose Section primitives in the
 * canonical order (Overview, WhyItMatters, HowItWorks,
 * ExampleWorkflow, CommonMistakes, QA, Related) inside their Body.
 *
 * SERVER-component requirement: the deploy-web workflow builds with
 * output: export (GitHub Pages static export). Dynamic routes must
 * export generateStaticParams and stay server-rendered.
 */

export function generateStaticParams(): Array<{ slug: string }> {
  // One static path per registered article (stubs included so deep
  // links land instead of 404ing).
  return listArticles().map((a) => ({ slug: a.meta.slug }));
}

interface PageProps {
  readonly params: { slug: string };
}

export default function AcademyArticlePage({ params }: PageProps) {
  const article = getArticle(params.slug);
  if (!article) notFound();

  const { meta, Body } = article;
  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-2">
          <Badge tone="info">{meta.category}</Badge>
          {meta.stub ? <Badge tone="neutral">Coming soon</Badge> : null}
        </div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
          {meta.title}
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          {meta.summary}
        </p>
      </header>

      {meta.stub ? (
        <StubPlaceholder />
      ) : (
        <div className="flex flex-col gap-8">
          <Body />
        </div>
      )}
    </article>
  );
}

function StubPlaceholder() {
  return (
    <div className="rounded-md border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
      This Academy article is on the roadmap and ships in a future
      release. The topic outline is visible in the sidebar so you can
      see what is coming.
    </div>
  );
}
