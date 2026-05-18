import { cn } from '../lib/cn.js';

export interface MetricProps {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly trend?: 'up' | 'down' | 'flat';
  readonly className?: string;
}

/**
 * Metric — always renders numeric value with tabular-nums.
 * Pre-formatted strings only (formatting happens at the call site against backend-provided
 * canonical strings). Per architectural rule: no frontend business calculations.
 */
export function Metric({ label, value, hint, trend, className }: MetricProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span data-numeric="true" className="font-sans text-2xl font-semibold text-foreground">
        {value}
      </span>
      {hint ? (
        <span
          data-numeric={trend ? 'true' : undefined}
          className={cn(
            'text-xs',
            trend === 'up' && 'text-emerald-600',
            trend === 'down' && 'text-red-600',
            !trend && 'text-muted-foreground',
          )}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}
