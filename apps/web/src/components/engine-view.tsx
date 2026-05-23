'use client';

import { AwaitingDataState, LoadingCard, PageHeader } from '@xb/ui';
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
        <AwaitingDataState
          headline="No workspace selected"
          hint={`Pick a workspace from the topbar switcher to scope ${title.toLowerCase()}.`}
        />
      ) : loading ? (
        // Engine pending. Pixel-exact KPI tile grid so the layout
        // does not jump when populated data swaps in.
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <LoadingCard />
          <LoadingCard />
          <LoadingCard />
          <LoadingCard />
        </div>
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
  // Per the no-onboarding-clutter rule: operational empty states do
  // NOT pivot users into Uploads. The `readiness.action` payload
  // (legacy from earlier slices) is intentionally ignored here.
  // Academy owns education.
  return (
    <AwaitingDataState headline={readiness.reason ?? 'Awaiting data.'}>
      {children ? <>{children}</> : null}
    </AwaitingDataState>
  );
}
