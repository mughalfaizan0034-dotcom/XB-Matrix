'use client';

import { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import { cn } from '../lib/cn.js';

export type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  readonly id: string;
  readonly kind: ToastKind;
  readonly message: string;
}

type Action = { type: 'push'; toast: Toast } | { type: 'dismiss'; id: string };

function reducer(state: Toast[], action: Action): Toast[] {
  if (action.type === 'push') return [...state, action.toast];
  return state.filter((t) => t.id !== action.id);
}

interface ToastContextValue {
  push(kind: ToastKind, message: string): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, dispatch] = useReducer(reducer, [] as Toast[]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Math.random().toString(36).slice(2);
    dispatch({ type: 'push', toast: { id, kind, message } });
    setTimeout(() => dispatch({ type: 'dismiss', id }), 5000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto min-w-[280px] max-w-md rounded-md border px-4 py-2.5 text-sm shadow-xb-md backdrop-blur',
              t.kind === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
              t.kind === 'error' && 'border-red-200 bg-red-50 text-red-800',
              t.kind === 'info' && 'border-border bg-card text-foreground',
            )}
            role="status"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
