'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useState<string> backed by localStorage. SSR-safe — reads from
 * localStorage on mount; never throws if storage is unavailable.
 */
export function usePersistedString(
  storageKey: string,
  initial: string = '',
): [string, (next: string) => void] {
  const [value, setValue] = useState<string>(initial);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) setValue(raw);
    } catch {
      // ignore malformed/unavailable storage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(
    (next: string) => {
      setValue(next);
      try {
        if (typeof window !== 'undefined') {
          if (next === '') window.localStorage.removeItem(storageKey);
          else window.localStorage.setItem(storageKey, next);
        }
      } catch {
        // ignore quota/access issues
      }
    },
    [storageKey],
  );

  return [value, update];
}
