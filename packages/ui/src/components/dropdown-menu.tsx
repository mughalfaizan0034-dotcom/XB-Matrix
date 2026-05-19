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
  readonly divider?: boolean;
  /** Optional second line shown beneath the label (e.g., org name on a workspace). */
  readonly description?: string;
  /** Optional right-aligned indicator (e.g., a check on the active row). */
  readonly trailing?: React.ReactNode;
}

export interface DropdownMenuProps {
  readonly trigger: React.ReactNode;
  readonly items: ReadonlyArray<DropdownMenuItem>;
  readonly align?: 'start' | 'end';
  readonly className?: string;
  /** Optional content rendered above the items, separated by a divider. */
  readonly header?: React.ReactNode;
  /** Optional content rendered below the items, separated by a divider. */
  readonly footer?: React.ReactNode;
  /** Optional override for the panel width. Defaults to w-56. */
  readonly width?: string;
}

/**
 * Portal-mounted dropdown menu with viewport-aware positioning. The menu
 * panel renders into the global overlay root so no parent's `overflow:
 * hidden`, `transform`, `filter`, or other containing-block creator can
 * clip it.
 *
 * Closes on:
 *   - outside click (the listener treats trigger AND menu as "inside")
 *   - Escape key
 *   - selecting an item
 */
export function DropdownMenu({
  trigger,
  items,
  align = 'end',
  className,
  header,
  footer,
  width,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The menu element must live in state, not a ref — Portal mounts it on a
  // subsequent render, and a ref `.current` mutation does not re-fire the
  // position-computing effect. Tracking it in state guarantees re-measure.
  const [menuEl, setMenuEl] = useState<HTMLDivElement | null>(null);
  const pos = useOverlayPosition(triggerRef, menuEl, open, {
    placement: align === 'end' ? 'bottom-end' : 'bottom-start',
    offset: 4,
  });

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (menuEl?.contains(t)) return;
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
  }, [open, menuEl]);

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
            ref={setMenuEl}
            role="menu"
            style={{
              position: 'fixed',
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              zIndex: Z_LAYER.popover,
              maxHeight: pos?.maxHeight,
              // Hide until first measurement so we never show a 1-frame
              // flash at -9999. As soon as pos is set, become visible.
              visibility: pos ? 'visible' : 'hidden',
              opacity: pos ? 1 : 0,
            }}
            className={cn(
              'overflow-auto rounded-md border border-border bg-card p-1 shadow-xb-md',
              width ?? 'w-56',
            )}
          >
            {header ? (
              <>
                <div className="px-2.5 py-2">{header}</div>
                <div className="my-1 h-px bg-border" aria-hidden="true" />
              </>
            ) : null}
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
                    <span className="min-w-0 flex-1 truncate">
                      <span className="block truncate">{item.label}</span>
                      {item.description ? (
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                    {item.trailing ? (
                      <span className="ml-1 flex-shrink-0 text-muted-foreground">{item.trailing}</span>
                    ) : null}
                  </button>
                </div>
              );
            })}
            {footer ? (
              <>
                <div className="my-1 h-px bg-border" aria-hidden="true" />
                <div className="px-2.5 py-2">{footer}</div>
              </>
            ) : null}
          </div>
        </Portal>
      ) : null}
    </span>
  );
}
