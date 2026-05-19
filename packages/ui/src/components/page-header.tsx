import { cn } from '../lib/cn.js';

export interface PageHeaderProps {
  readonly title: string;
  /** Plain string OR a React node (e.g., contextual chips/icons). */
  readonly description?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          typeof description === 'string' ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : (
            <div className="mt-1 text-sm text-muted-foreground">{description}</div>
          )
        ) : null}
      </div>
      {actions ? <div className="flex flex-shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
