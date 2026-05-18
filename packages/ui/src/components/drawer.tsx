'use client';

import { useEffect } from 'react';
import { cn } from '../lib/cn.js';

export interface DrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
  readonly side?: 'right';
  readonly widthClass?: string;
}

/**
 * Right-side sliding drawer for read-mostly side content (audit history,
 * detail panels). ESC closes; backdrop click closes; locks body scroll.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  widthClass = 'w-[min(560px,92vw)]',
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          'absolute right-0 top-0 flex h-full flex-col border-l border-border bg-card shadow-xb-lg',
          widthClass,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-semibold text-foreground">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4">{children}</div>
      </aside>
    </div>
  );
}
