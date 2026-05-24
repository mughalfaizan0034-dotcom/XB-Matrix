import { cn } from '../lib/cn.js';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

// Tone palette (project_design_system 2026-05-24 navy-only):
//   neutral  muted gray, for non-actionable status (workspace type, etc.)
//   success  green, for healthy / active states
//   warning  amber, for caution / lifecycle stages
//   danger   red, for failures / blocking errors
//   info     brand emphasis (navy). For highlighted labels and operational
//            emphasis. Reads through the semantic accent token so the
//            tone follows whatever the brand emphasis color is.
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-warning-100 text-warning-800',
  danger:  'bg-red-100 text-red-800',
  info:    'bg-accent-100 text-accent-800',
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
