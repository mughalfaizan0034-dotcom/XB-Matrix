import { forwardRef } from 'react';
import { cn } from '../lib/cn.js';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  readonly invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-9 w-full rounded-md border bg-background px-3 text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-destructive ring-1 ring-destructive/30' : 'border-border',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
