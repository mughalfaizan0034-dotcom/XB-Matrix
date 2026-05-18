'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn.js';
import { Portal, useOverlayPosition, Z_LAYER } from '../overlay/index.js';

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
 * Portal-based dropdown menu. The panel renders into the global overlay
 * root so no parent's `overflow: hidden`, `transform`, `filter`, or other
 * containing-block creator can clip it. Viewport-aware positioning flips
 * up when there is not enough room below; height is capped to avoid
 * overflowing the screen.
 *
 * Closes on:
 *   - outside click (the listener treats trigger AND menu as "inside")
 *   - Escape key
 *   - selecting an item (after `onSelect` is invoked)
 */
export function DropdownMenu({ trigger, items, align = 'end', className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pos = useOverlayPosition(triggerRef, menuRef, open, {
    placement: align === 'end' ? 'bottom-end' : 'bottom-start',
    offset: 4,
  });

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className={cn('inline-block', className)}>
      <button
        ref={triggerRef}
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
        <Portal>
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              zIndex: Z_LAYER.popover,
              maxHeight: pos?.maxHeight,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="w-56 overflow-auto rounded-md border border-border bg-card p-1 shadow-xb-md"
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
        </Portal>
      ) : null}
    </span>
  );
}
