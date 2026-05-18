import { forwardRef } from 'react';
import { cn } from '../lib/cn.js';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  readonly invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type ?? 'text'}
      className={cn(
        'h-9 w-full rounded-md border bg-background px-3 text-sm transition-colors',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-destructive ring-1 ring-destructive/30' : 'border-border',
        // numeric inputs use tabular figures
        (type === 'number' || type === 'tel') && 'tabular-nums',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
