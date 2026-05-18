'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useState<Set<string>> backed by localStorage. Used for expand/collapse
 * state that should survive refresh + cross-tab navigation within the SPA.
 *
 * Safe under Next.js SSR — reads from localStorage only on mount.
 */
export function usePersistedStringSet(
  storageKey: string,
  initial: ReadonlyArray<string> = [],
): [ReadonlySet<string>, (mutator: (cur: Set<string>) => Set<string>) => void] {
  const [set, setSet] = useState<Set<string>>(() => new Set(initial));

  // Hydrate from localStorage once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setSet(new Set(parsed.filter((x): x is string => typeof x === 'string')));
        }
      }
    } catch {
      // ignore malformed storage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(
    (mutator: (cur: Set<string>) => Set<string>) => {
      setSet((cur) => {
        const next = mutator(new Set(cur));
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(storageKey, JSON.stringify([...next]));
          }
        } catch {
          // ignore quota/access issues
        }
        return next;
      });
    },
    [storageKey],
  );

  return [set, update];
}
