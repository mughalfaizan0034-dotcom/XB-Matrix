'use client';

import { cn } from '../lib/cn.js';

/**
 * Transitional state primitives.
 *
 * Every data-fetching surface needs to distinguish five render
 * states: loading, awaiting data, processing, error, populated.
 * Skipping any of these makes the platform feel broken while
 * requests resolve. Per project_design_system, these primitives are
 * the single source of truth for loading / empty UX. No per-page
 * skeleton ever; lift any new pattern into this file.
 *
 * Hard rules (PR #32 spec):
 *  - Skeleton dimensions mirror the final layout exactly. Zero CLS.
 *  - AwaitingData copy is operational, never onboarding tone.
 *  - No deep-links to Uploads from operational empty states.
 *  - Motion is subtle shimmer only. No spinners as primary signal.
 *  - Dark-future compatible via semantic tokens
 *    (bg-muted, text-foreground, border-border).
 *  - Renderer-only. Backend explicit status flags drive transitions.
 *  - z-index conscious. Sticky table headers (z-10) and chart
 *    tooltips (z-9040) stay layered correctly through every state.
 */

// ---------------------------------------------------------------------
// LoadingCard, KPI tile skeleton
// ---------------------------------------------------------------------
// Exact dimensions of a populated MetricCard (label + value + hint
// inside a Card with pt-6 padding). Used in dashboard and module KPI
// grids while engines compute.

export interface LoadingCardProps {
  readonly className?: string;
}

export function LoadingCard({ className }: LoadingCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card px-4 pt-6 pb-4',
        className,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <Shimmer className="mb-3 h-3 w-20" />
      <Shimmer className="mb-3 h-8 w-28" />
      <Shimmer className="h-3 w-32" />
    </div>
  );
}

// ---------------------------------------------------------------------
// LoadingTable, body skeleton for surfaces NOT using @xb/ui DataTable
// ---------------------------------------------------------------------
// DataTable has its own skeleton path. This primitive is for ad-hoc
// tabular surfaces (audit, detail drawers). N placeholder rows at
// fixed height so the layout reserves space without jumping.

export interface LoadingTableProps {
  readonly rows?: number;
  readonly columns?: number;
  readonly className?: string;
}

export function LoadingTable({ rows = 6, columns = 4, className }: LoadingTableProps) {
  return (
    <div
      className={cn(
        'overflow-clip rounded-lg border border-border bg-card',
        className,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <table className="w-full text-sm">
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-2.5 text-left">
                <Shimmer className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: columns }).map((__, j) => (
                <td key={j} className="px-4 py-3">
                  <Shimmer className="h-3 w-full max-w-[12rem]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------
// LoadingChart, chart-shaped skeleton with axis stubs
// ---------------------------------------------------------------------
// Reserves dimensions before the real Recharts canvas mounts. Includes
// axis stubs so the placeholder reads as "this is a chart" rather than
// "this is a generic box". Future TrendChart / BreakdownChart will use
// matching dimensions.

export interface LoadingChartProps {
  readonly height?: number;
  readonly className?: string;
}

export function LoadingChart({ height = 240, className }: LoadingChartProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-4',
        className,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-3 flex items-center justify-between">
        <Shimmer className="h-3 w-32" />
        <Shimmer className="h-3 w-16" />
      </div>
      <div className="relative w-full" style={{ height: `${height}px` }}>
        {/* y-axis ticks */}
        <div className="absolute inset-y-0 left-0 flex w-8 flex-col justify-between pr-2">
          <Shimmer className="h-2 w-6" />
          <Shimmer className="h-2 w-5" />
          <Shimmer className="h-2 w-4" />
          <Shimmer className="h-2 w-6" />
          <Shimmer className="h-2 w-5" />
        </div>
        {/* plot area */}
        <div className="absolute inset-y-0 left-10 right-0 rounded-md bg-muted/30">
          <Shimmer className="absolute inset-2 rounded" />
        </div>
      </div>
      {/* x-axis ticks */}
      <div className="mt-2 ml-10 flex justify-between">
        {Array.from({ length: 7 }).map((_, i) => (
          <Shimmer key={i} className="h-2 w-8" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// AwaitingDataState, operational empty
// ---------------------------------------------------------------------
// Neutral placeholder when the engine reports readiness=false. Uses
// "Awaiting <noun-phrase>" voice. NO upload deep-links, NO tutorial
// language. Academy owns education.

export interface AwaitingDataStateProps {
  /** Operational headline. Use "Awaiting <noun-phrase>" template. */
  readonly headline: string;
  /** Optional one-line operational context. Stays neutral. */
  readonly hint?: string;
  /**
   * Optional supplementary detail (preview of expected metrics,
   * brief bullet list). Migrates to Academy over time; existing
   * surfaces can keep passing content here until cleaned up.
   */
  readonly children?: React.ReactNode;
  readonly className?: string;
}

export function AwaitingDataState({ headline, hint, children, className }: AwaitingDataStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center',
        className,
      )}
      role="status"
    >
      <p className="text-sm font-medium text-foreground">{headline}</p>
      {hint ? <p className="max-w-md text-xs text-muted-foreground">{hint}</p> : null}
      {children ? (
        <div className="mt-3 w-full max-w-xl text-left text-xs text-muted-foreground">
          {children}
        </div>
      ) : null}
    </div>
  );
}

// EmptyOperationalState, alias for drilldown / sub-surface empties.
// Same primitive, separate name so call sites read intent clearly.
export const EmptyOperationalState = AwaitingDataState;

// ---------------------------------------------------------------------
// ProcessingState, ingestion / recompute lifecycle pill
// ---------------------------------------------------------------------
// Inline pill that shows the current backend phase during ingestion or
// engine recomputation. Renders next to a tile or table header. The
// surface stays interactive elsewhere on the page.
//
// Phases come from the backend explicitly (no client heuristics):
//   validating       , CSV parsing + schema-shape checks
//   normalizing      , mapper layer producing canonical entities
//   reconciling      , unresolved SKU / brand / window resolution
//   canonicalizing   , writing into canonical tables
//   computing        , engine recompute over the new canonical rows

export type ProcessingPhase =
  | 'validating'
  | 'normalizing'
  | 'reconciling'
  | 'canonicalizing'
  | 'computing';

const PHASE_LABEL: Record<ProcessingPhase, string> = {
  validating: 'Validating',
  normalizing: 'Normalizing',
  reconciling: 'Reconciling',
  canonicalizing: 'Canonicalizing',
  computing: 'Computing insights',
};

export interface ProcessingStateProps {
  readonly phase: ProcessingPhase;
  readonly className?: string;
}

export function ProcessingState({ phase, className }: ProcessingStateProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-active"
        aria-hidden="true"
      />
      {PHASE_LABEL[phase]}
    </span>
  );
}

// ---------------------------------------------------------------------
// Shimmer, internal building block
// ---------------------------------------------------------------------
// Soft gradient sweep over a placeholder shape. Used by every loading
// primitive above. Animation token kept subtle, no flashy effects.

function Shimmer({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'block rounded bg-muted',
        'relative overflow-hidden',
        'before:absolute before:inset-0 before:-translate-x-full',
        'before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent',
        'before:animate-[shimmer_1.6s_ease-in-out_infinite]',
        className,
      )}
      aria-hidden="true"
    />
  );
}
