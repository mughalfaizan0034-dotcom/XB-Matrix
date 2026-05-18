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
 */
export function useOverlayPosition(
  triggerRef: RefObject<HTMLElement | null>,
  overlayRef: RefObject<HTMLElement | null>,
  open: boolean,
  opts: UseOverlayPositionOptions = {},
): OverlayPosition | null {
  const { placement: requested = 'bottom-end', offset = 4, viewportPadding = 8 } = opts;
  const [pos, setPos] = useState<OverlayPosition | null>(null);

  const recompute = useCallback(() => {
    if (!open) return;
    const trig = triggerRef.current;
    const over = overlayRef.current;
    if (!trig || !over) return;

    const tRect = trig.getBoundingClientRect();
    const oRect = over.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Decide vertical placement.
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

    // Clamp horizontally.
    if (left + oRect.width > vw - viewportPadding) {
      left = vw - viewportPadding - oRect.width;
    }
    if (left < viewportPadding) left = viewportPadding;

    // Clamp vertically — if even after flipping we'd overflow, cap height.
    const maxHeight =
      placeBelow
        ? vh - top - viewportPadding
        : tRect.top - viewportPadding - offset;
    const clampedMaxHeight =
      maxHeight > 0 && maxHeight < oRect.height ? maxHeight : undefined;
    if (clampedMaxHeight !== undefined && !placeBelow) {
      top = viewportPadding;
    }

    setPos({ top, left, placement, maxHeight: clampedMaxHeight });
  }, [open, triggerRef, overlayRef, requested, offset, viewportPadding]);

  // Initial + re-measure on size changes
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    recompute();
    const over = overlayRef.current;
    if (!over) return;
    const ro = new ResizeObserver(recompute);
    ro.observe(over);
    return () => ro.disconnect();
  }, [open, recompute, overlayRef]);

  // Track scroll/resize while open
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
