import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Badge } from '@xb/ui';
import { listArticles } from '@/academy/index';

/**
 * Academy welcome page.
 *
 * The category navigation lives in the persistent sidebar (rendered
 * by the academy layout via AcademyShell). The body here is a short
 * intro plus a small set of recommended starting points, doc-style.
 */
export default function AcademyIndexPage() {
  const featured = listArticles()
    .filter((a) => !a.meta.stub)
    .slice(0, 3);

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-accent-200 bg-accent-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-700">
          <BookOpen className="h-3 w-3" />
          xB Matrix Academy
        </div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
          The operating manual for xB Matrix
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          Concepts, data-pipeline reference, and operational guidance.
          Use the category sidebar to browse, or search the full
          Academy from any article.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-xs font-semibold uppercase tracking-[0.12em] text-accent">
          Start here
        </h2>
        <ul className="flex flex-col gap-2">
          {featured.map((a) => (
            <li key={a.meta.slug}>
              <Link
                href={`/academy/${a.meta.slug}`}
                className="group flex items-start justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 transition-colors hover:border-accent-300"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-sm font-semibold text-foreground">
                      {a.meta.title}
                    </span>
                    <Badge tone="info">{a.meta.category}</Badge>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {a.meta.summary}
                  </p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground group-hover:text-accent" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="font-heading text-xs font-semibold uppercase tracking-[0.12em] text-accent">
          What lives here
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
          Every article follows the same structure: Overview, Why it
          matters, How it works, Example workflow, Common mistakes,
          Q&amp;A, and Related concepts. Use the Q&amp;A blocks for
          quick answers, and the related-concepts footer to traverse
          neighbouring topics.
        </p>
      </section>
    </article>
  );
}
