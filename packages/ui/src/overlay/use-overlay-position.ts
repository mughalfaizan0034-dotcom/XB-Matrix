'use client';

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';

export type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

export interface OverlayPosition {
  readonly top: number;
  readonly left: number;
  readonly placement: Placement;
  readonly maxHeight: number | undefined;
}

export interface UseOverlayPositionOptions {
  readonly placement?: Placement;
  /** px gap between trigger and overlay edge */
  readonly offset?: number;
  /** px margin from viewport edge before we flip */
  readonly viewportPadding?: number;
}

/**
 * Computes a fixed-position { top, left } for an overlay relative to a
 * trigger element, accounting for viewport edges. Auto-flips vertically
 * when there's not enough room, and clamps horizontally. Re-measures on
 * scroll + resize and when the overlay's own size changes (ResizeObserver).
 *
 * `overlayEl` must be **state**, not a ref. Portaled content mounts a frame
 * after the parent renders, and a ref's `.current` change does not trigger
 * effects. Holding the element in state guarantees the effect re-runs
 * when the portal finishes mounting.
 */
export function useOverlayPosition(
  triggerRef: RefObject<HTMLElement | null>,
  overlayEl: HTMLElement | null,
  open: boolean,
  opts: UseOverlayPositionOptions = {},
): OverlayPosition | null {
  const { placement: requested = 'bottom-end', offset = 4, viewportPadding = 8 } = opts;
  const [pos, setPos] = useState<OverlayPosition | null>(null);

  const recompute = useCallback(() => {
    if (!open) return;
    const trig = triggerRef.current;
    if (!trig || !overlayEl) return;

    const tRect = trig.getBoundingClientRect();
    const oRect = overlayEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - tRect.bottom - viewportPadding;
    const spaceAbove = tRect.top - viewportPadding;
    let placement: Placement = requested;
    const wantTop = requested.startsWith('top');
    const needsHeight = oRect.height + offset;
    if (wantTop && spaceAbove < needsHeight && spaceBelow > spaceAbove) {
      placement = requested === 'top-start' ? 'bottom-start' : 'bottom-end';
    } else if (!wantTop && spaceBelow < needsHeight && spaceAbove > spaceBelow) {
      placement = requested === 'bottom-start' ? 'top-start' : 'top-end';
    }

    const placeBelow = placement.startsWith('bottom');
    const placeAtEnd = placement.endsWith('end');

    let top = placeBelow ? tRect.bottom + offset : tRect.top - oRect.height - offset;
    let left = placeAtEnd ? tRect.right - oRect.width : tRect.left;

    if (left + oRect.width > vw - viewportPadding) {
      left = vw - viewportPadding - oRect.width;
    }
    if (left < viewportPadding) left = viewportPadding;

    const maxHeight = placeBelow
      ? vh - top - viewportPadding
      : tRect.top - viewportPadding - offset;
    const clampedMaxHeight =
      maxHeight > 0 && maxHeight < oRect.height ? maxHeight : undefined;
    if (clampedMaxHeight !== undefined && !placeBelow) {
      top = viewportPadding;
    }

    setPos({ top, left, placement, maxHeight: clampedMaxHeight });
  }, [open, triggerRef, overlayEl, requested, offset, viewportPadding]);

  // Re-fires when overlayEl changes from null → element after Portal mounts.
  useLayoutEffect(() => {
    if (!open || !overlayEl) {
      setPos(null);
      return;
    }
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(overlayEl);
    return () => ro.disconnect();
  }, [open, overlayEl, recompute]);

  // Track scroll / resize while open.
  useEffect(() => {
    if (!open) return;
    const onScroll = () => recompute();
    const onResize = () => recompute();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, recompute]);

  return pos;
}
