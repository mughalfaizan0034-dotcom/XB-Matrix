/**
 * Standardized Academy article sections.
 *
 * Every article composes these in canonical order:
 *
 *   <Overview>          quick framing of the topic
 *   <WhyItMatters>      operator-relevance, value to know
 *   <HowItWorks>        the mechanism, end to end
 *   <ExampleWorkflow>   a concrete walked example
 *   <CommonMistakes>    pitfalls operators hit
 *   <QA>                question + answer pairs, structured
 *   <Related>           links to neighbouring articles
 *
 * Plus inline helpers: <Note>, <Warning>, <Glossary>, <CodeBlock>.
 *
 * Articles can omit sections that don't apply but must keep this
 * order when they DO appear (project_academy_surface doc-style spec).
 *
 * Style rules:
 *  - Quicksand headings, Inter body (via globals.css typography stack)
 *  - Orange accent for section indicators (left-border on the heading)
 *  - Narrower reading width (max-w-3xl), restrained spacing rhythm
 *  - No em dashes anywhere (platform-wide rule, CI guard enforces)
 */

import Link from 'next/link';
import { ArrowRight, Info, AlertTriangle, BookOpen } from 'lucide-react';
import { cn } from '@xb/ui/lib/cn';

interface SectionShellProps {
  readonly label: string;
  readonly children: React.ReactNode;
}

function SectionShell({ label, children }: SectionShellProps) {
  // Sections share the same shell: accent left-border, Quicksand label,
  // content beneath. The accent reads through the semantic token so a
  // future palette pivot only touches tailwind-preset.js.
  return (
    <section className="border-l-2 border-accent/70 pl-4">
      <h2 className="font-heading text-xs font-semibold uppercase tracking-[0.12em] text-accent">
        {label}
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-7 text-foreground">
        {children}
      </div>
    </section>
  );
}

export function Overview({ children }: { children: React.ReactNode }) {
  return <SectionShell label="Overview">{children}</SectionShell>;
}

export function WhyItMatters({ children }: { children: React.ReactNode }) {
  return <SectionShell label="Why it matters">{children}</SectionShell>;
}

export function HowItWorks({ children }: { children: React.ReactNode }) {
  return <SectionShell label="How it works">{children}</SectionShell>;
}

export function ExampleWorkflow({ children }: { children: React.ReactNode }) {
  return <SectionShell label="Example workflow">{children}</SectionShell>;
}

export function CommonMistakes({ children }: { children: React.ReactNode }) {
  return <SectionShell label="Common mistakes">{children}</SectionShell>;
}

// ---------- Q&A ----------

/**
 * Q&A section. Each entry is a question + an operational answer.
 * Renders as a flat list of `<dt>` (Quicksand bold) + `<dd>` pairs.
 * First-class per the doc-style spec; canonical for FAQs scattered
 * across operational concepts.
 */
export function QA({ children }: { children: React.ReactNode }) {
  return (
    <SectionShell label="Q&A">
      <dl className="space-y-4">{children}</dl>
    </SectionShell>
  );
}

export function QAItem({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <dt className="font-heading text-sm font-semibold text-foreground">
        {question}
      </dt>
      <dd className="mt-1.5 text-sm leading-7 text-muted-foreground">
        {children}
      </dd>
    </div>
  );
}

// ---------- Related Concepts ----------

export interface RelatedLinkSpec {
  readonly slug: string;
  readonly title: string;
  readonly summary?: string;
}

export function Related({ links }: { links: ReadonlyArray<RelatedLinkSpec> }) {
  if (links.length === 0) return null;
  return (
    <SectionShell label="Related concepts">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.slug}>
            <Link
              href={`/academy/${l.slug}`}
              className="flex items-start justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:border-accent-300"
            >
              <span>
                <span className="font-medium text-foreground">{l.title}</span>
                {l.summary ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {l.summary}
                  </span>
                ) : null}
              </span>
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

// ---------- Inline helpers ----------

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-sm leading-6 text-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" />
      <div>{children}</div>
    </div>
  );
}

export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm leading-6 text-foreground">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning-700" />
      <div>{children}</div>
    </div>
  );
}

export function Glossary({ children }: { children: React.ReactNode }) {
  return (
    <SectionShell label="Glossary">
      <dl className="space-y-2">{children}</dl>
    </SectionShell>
  );
}

export function GlossaryItem({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-mono text-xs font-semibold text-foreground">{term}</dt>
      <dd className="text-sm leading-6 text-muted-foreground">{children}</dd>
    </div>
  );
}

export function CodeBlock({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <pre
      className={cn(
        'overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs leading-6 text-foreground',
        className,
      )}
    >
      <code>{children}</code>
    </pre>
  );
}

// Helper for in-prose icon affordances on internal links.
export function ArticleLink({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/academy/${slug}`}
      className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline"
    >
      <BookOpen className="h-3 w-3" />
      {children}
    </Link>
  );
}
