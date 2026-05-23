'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button, Card, CardContent, PageHeader } from '@xb/ui';
import { useActiveWorkspace } from '@/lib/session';
import type { EngineReadiness } from '@/lib/api-intelligence';

/**
 * Shared shell for module pages backed by the intelligence engine.
 *
 * The page header stays compact: title plus an optional actions slot
 * (passed via children that the page renders, not here). Workspace
 * context is intentionally NOT repeated in the header, the topbar
 * switcher is the single source of truth (feedback_no_onboarding_clutter
 * header-chrome rule). When no workspace is pinned the body slot
 * renders the "pick a workspace" nudge.
 *
 * The engine itself decides readiness, pass the readiness block here
 * and the shell will render the empty-state if `ready === false`.
 */
interface Props {
  readonly title: string;
  readonly loading?: boolean;
  readonly readiness?: EngineReadiness;
  readonly emptyStateBody?: React.ReactNode;
  readonly children?: React.ReactNode;
}

export function EngineView({
  title,
  loading,
  readiness,
  emptyStateBody,
  children,
}: Props) {
  const { data: workspace } = useActiveWorkspace();

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <PageHeader title={title} />

      {!workspace ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Pick a workspace from the topbar switcher to scope {title.toLowerCase()}.
            </p>
            <Link href="/select-workspace">
              <Button size="sm" variant="outline">
                Open workspace picker <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
          </CardContent>
        </Card>
      ) : readiness && !readiness.ready ? (
        <EngineEmptyState readiness={readiness}>{emptyStateBody}</EngineEmptyState>
      ) : (
        children
      )}
    </div>
  );
}

export function EngineEmptyState({
  readiness,
  children,
}: {
  readiness: EngineReadiness;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="max-w-xl text-sm text-foreground">{readiness.reason ?? 'No data yet.'}</p>
        {children ? (
          <div className="mt-2 w-full max-w-xl text-left text-sm text-muted-foreground">
            {children}
          </div>
        ) : null}
        {readiness.action ? (
          <Link href={readiness.action.href}>
            <Button size="sm" variant="outline">
              {readiness.action.label} <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
