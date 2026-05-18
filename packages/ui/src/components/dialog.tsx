'use client';

import { useEffect, useRef } from 'react';
import { cn } from '../lib/cn.js';
import { Portal, Z_LAYER } from '../overlay/index.js';

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
 * Portal-mounted modal dialog. Renders into the overlay root so transformed
 * or overflow-bounded ancestors don't clip it. ESC closes; backdrop click
 * closes; body scroll locked while open.
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
    <Portal>
      <div
        style={{ zIndex: Z_LAYER.dialog }}
        className="fixed inset-0 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm"
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
    </Portal>
  );
}
