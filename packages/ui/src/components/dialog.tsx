'use client';

import { useEffect, useRef } from 'react';
import { cn } from '../lib/cn.js';

export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly className?: string;
}

/**
 * Lightweight modal. Native <dialog> would be ideal but Next.js SSR + focus
 * trapping cleanliness pushes us to a portal-less overlay. ESC closes;
 * backdrop click closes.
 */
export function Dialog({ open, onClose, title, description, children, footer, className }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={cn(
          'relative w-full max-w-lg rounded-lg border border-border bg-card shadow-xb-lg',
          className,
        )}
      >
        <div className="border-b border-border px-6 py-4">
          <h2 id="dialog-title" className="font-heading text-lg font-semibold leading-none text-foreground">
            {title}
          </h2>
          {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="px-6 py-4">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
