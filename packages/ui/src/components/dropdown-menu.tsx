'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn.js';

export interface DropdownMenuItem {
  readonly key: string;
  readonly label: string;
  readonly icon?: React.ComponentType<{ className?: string }>;
  readonly onSelect: () => void;
  readonly variant?: 'default' | 'danger';
  readonly disabled?: boolean;
  readonly divider?: boolean; // render a separator above this item
}

export interface DropdownMenuProps {
  readonly trigger: React.ReactNode;
  readonly items: ReadonlyArray<DropdownMenuItem>;
  readonly align?: 'start' | 'end';
  readonly className?: string;
}

/**
 * Lightweight dropdown menu — no Radix dep, no portal. Closes on outside
 * click, on Escape, and after an item activates.
 */
export function DropdownMenu({ trigger, items, align = 'end', className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex"
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute z-20 mt-1 w-56 rounded-md border border-border bg-card p-1 shadow-xb-md',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={item.key}>
                {item.divider && idx > 0 ? (
                  <div className="my-1 h-px bg-border" aria-hidden="true" />
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.disabled) return;
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    item.variant === 'danger'
                      ? 'text-destructive hover:bg-red-50'
                      : 'text-foreground hover:bg-muted',
                  )}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5 flex-shrink-0" /> : null}
                  {item.label}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
