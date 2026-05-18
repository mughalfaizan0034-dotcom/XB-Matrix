import { useId } from 'react';
import { cn } from '../lib/cn.js';
import { Label } from './label.js';

export interface FormFieldProps {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly required?: boolean;
  readonly className?: string;
  readonly children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => React.ReactNode;
}

export function FormField({
  label,
  hint,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': hintId,
      })}
      {error ? (
        <p id={hintId} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
