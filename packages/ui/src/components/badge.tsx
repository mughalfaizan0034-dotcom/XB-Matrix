import { cn } from '../lib/cn.js';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

// Tone palette (project_design_system orange-emphasis):
//   neutral  muted gray, for non-actionable status (workspace type, etc.)
//   success  green, for healthy / active states
//   warning  amber, for caution / coming soon
//   danger   red, for failures / blocking errors
//   info     brand orange tint. Use for highlighted labels and operational
//            emphasis. Replaces the prior navy-tinted shade so the
//            interaction palette stays consistent with primary CTAs.
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger:  'bg-red-100 text-red-800',
  info:    'bg-orange-100 text-orange-800',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
