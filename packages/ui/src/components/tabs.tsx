'use client';

import { createContext, useContext, useId, useMemo, useState } from 'react';
import { cn } from '../lib/cn.js';

export interface TabItem<K extends string = string> {
  readonly key: K;
  readonly label: React.ReactNode;
  readonly disabled?: boolean;
  readonly badge?: React.ReactNode;
}

interface TabsContextValue<K extends string> {
  readonly value: K;
  readonly setValue: (k: K) => void;
  readonly tabsId: string;
}

const TabsContext = createContext<TabsContextValue<string> | null>(null);

export interface TabsProps<K extends string> {
  readonly items: ReadonlyArray<TabItem<K>>;
  readonly value?: K;
  readonly defaultValue?: K;
  readonly onChange?: (k: K) => void;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly listClassName?: string;
}

/**
 * Lightweight tablist + panels. Supports controlled (`value` + `onChange`)
 * and uncontrolled (`defaultValue`) usage. Keyboard: ← → cycles, Home/End jump.
 *
 * Usage:
 *   <Tabs items={[{ key: 'a', label: 'A' }, ...]} defaultValue="a">
 *     <TabPanel tabKey="a">…</TabPanel>
 *     …
 *   </Tabs>
 */
export function Tabs<K extends string>({
  items,
  value,
  defaultValue,
  onChange,
  children,
  className,
  listClassName,
}: TabsProps<K>) {
  const tabsId = useId();
  const [internal, setInternal] = useState<K>((defaultValue ?? items[0]?.key) as K);
  const current = (value ?? internal) as K;

  function setValue(k: K) {
    if (value === undefined) setInternal(k);
    onChange?.(k);
  }

  function onKey(e: React.KeyboardEvent, idx: number) {
    const enabled = items.filter((i) => !i.disabled);
    const flatIdx = enabled.findIndex((i) => i.key === items[idx]?.key);
    if (flatIdx < 0) return;
    let next = flatIdx;
    if (e.key === 'ArrowRight') next = (flatIdx + 1) % enabled.length;
    else if (e.key === 'ArrowLeft') next = (flatIdx - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    else return;
    e.preventDefault();
    setValue(enabled[next]!.key);
  }

  const ctx = useMemo<TabsContextValue<string>>(
    () => ({ value: current, setValue: setValue as (k: string) => void, tabsId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, tabsId],
  );

  return (
    <TabsContext.Provider value={ctx}>
      <div className={className}>
        <div
          role="tablist"
          aria-orientation="horizontal"
          className={cn(
            'flex items-stretch gap-1 border-b border-border',
            listClassName,
          )}
        >
          {items.map((item, idx) => {
            const active = item.key === current;
            return (
              <button
                key={item.key}
                role="tab"
                type="button"
                tabIndex={active ? 0 : -1}
                aria-selected={active}
                aria-controls={`${tabsId}-panel-${item.key}`}
                id={`${tabsId}-tab-${item.key}`}
                disabled={item.disabled}
                onClick={() => !item.disabled && setValue(item.key)}
                onKeyDown={(e) => onKey(e, idx)}
                className={cn(
                  'relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-navy text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                  item.disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                {item.label}
                {item.badge}
              </button>
            );
          })}
        </div>
        <div>{children}</div>
      </div>
    </TabsContext.Provider>
  );
}

export function TabPanel<K extends string>({
  tabKey,
  children,
  className,
}: {
  tabKey: K;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('<TabPanel> must be inside <Tabs>');
  if (ctx.value !== tabKey) return null;
  return (
    <div
      role="tabpanel"
      id={`${ctx.tabsId}-panel-${tabKey}`}
      aria-labelledby={`${ctx.tabsId}-tab-${tabKey}`}
      className={className}
    >
      {children}
    </div>
  );
}
