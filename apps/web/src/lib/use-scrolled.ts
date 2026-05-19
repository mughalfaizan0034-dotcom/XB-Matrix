'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Returns true once the user has scrolled past a sentinel element placed
 * just above a sticky bar. The sentinel pattern avoids attaching a scroll
 * listener to an arbitrary ancestor — IntersectionObserver detects the
 * sticky-engaged state declaratively.
 *
 * Usage:
 *   const [sentinelRef, scrolled] = useScrolledPast();
 *   <div ref={sentinelRef} className="h-px" />
 *   <div className={cn('sticky top-0', scrolled && 'shadow-xb-md')}>...</div>
 */
export function useScrolledPast(): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry) setScrolled(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '0px 0px 0px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return [ref, scrolled];
}
