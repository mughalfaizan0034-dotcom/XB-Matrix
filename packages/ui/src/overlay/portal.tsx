'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const ROOT_ID = 'xb-overlay-root';

function ensureOverlayRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById(ROOT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ROOT_ID;
    // The root itself contains no styling; each portaled overlay sets its own
    // z-index. position:absolute keeps it out of normal flow.
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = '0';
    el.style.height = '0';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Renders children into a top-level portal so they escape every overflow,
 * transform, filter, or stacking context their React parent might create.
 *
 * SSR-safe: returns null on first render; mounts on `useEffect`. This means
 * overlays are client-only — fine because they all open in response to user
 * interaction.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMountNode(ensureOverlayRoot());
  }, []);
  if (!mountNode) return null;
  return createPortal(children, mountNode);
}
