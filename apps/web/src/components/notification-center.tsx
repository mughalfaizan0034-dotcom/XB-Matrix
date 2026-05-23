'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { AwaitingDataState, Portal, useOverlayPosition, Z_LAYER } from '@xb/ui';
import { cn } from '@xb/ui/lib/cn';
import {
  groupNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type Notification,
} from '@/lib/api-notifications';

/**
 * Notification Center.
 *
 * Bell trigger that opens a portal-mounted panel with the user's
 * notification feed grouped by Today / Yesterday / Earlier. Empty,
 * loading, and populated states all degrade gracefully so the shell
 * can ship before the backend lands (stub hook returns `[]`).
 *
 * Architecture (project_profile_and_support):
 *  - Backend owns notification generation. Frontend renders only.
 *  - Mark-read is optimistic on the client; backend authoritative on
 *    the next refetch.
 *  - Panel sits at the popover z-layer (9040+) so it overlays the
 *    page chrome cleanly. Sticky thead (z-10) and topbar (z-30)
 *    stay under it.
 *  - Click-through routes to the deep-link target and marks the row
 *    read in the same gesture.
 *
 * Future enhancements (queued, not in scope this PR):
 *  - infinite scroll / pagination as the feed grows
 *  - virtualization once row counts go past ~200
 *  - per-channel delivery (email, webhook, push)
 *  - filter chips (kind, severity, workspace)
 */
export function NotificationCenter() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const q = useNotifications();
  const data = q.data;
  const unreadCount = data?.unreadCount ?? 0;

  const position = useOverlayPosition(triggerRef, overlayEl, open, {
    placement: 'bottom-end',
    offset: 6,
  });

  // Click-outside + Escape to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (overlayEl?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, overlayEl]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
          'hover:bg-muted hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        )}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-orange px-1 text-[10px] font-semibold text-white tabular-nums ring-2 ring-white"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <Portal>
          <div
            ref={setOverlayEl}
            style={{
              zIndex: Z_LAYER.popover,
              top: position?.top,
              left: position?.left,
              maxHeight: position?.maxHeight,
              visibility: position ? 'visible' : 'hidden',
            }}
            className="fixed flex w-[22rem] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xb-lg"
            role="dialog"
            aria-label="Notifications"
          >
            <NotificationPanel
              isLoading={q.isLoading}
              items={data?.items ?? []}
              unreadCount={unreadCount}
              onClose={() => setOpen(false)}
            />
          </div>
        </Portal>
      ) : null}
    </>
  );
}

// ----- Panel ---------------------------------------------------------

function NotificationPanel({
  isLoading,
  items,
  unreadCount,
  onClose,
}: {
  isLoading: boolean;
  items: ReadonlyArray<Notification>;
  unreadCount: number;
  onClose: () => void;
}) {
  const markAll = useMarkAllNotificationsRead();
  const grouped = useMemo(() => groupNotifications(items), [items]);

  return (
    <>
      {/* Sticky header inside the panel. Stays visible while the list scrolls. */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-heading text-sm font-semibold text-foreground">
            Notifications
          </span>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-orange/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange tabular-nums">
              {unreadCount}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => markAll.mutate()}
          disabled={unreadCount === 0 || markAll.isPending}
          className="text-xs text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-50"
        >
          Mark all as read
        </button>
      </div>

      <div className="max-h-[28rem] overflow-y-auto">
        {isLoading ? (
          <SkeletonRows />
        ) : items.length === 0 ? (
          <div className="p-3">
            <AwaitingDataState
              headline="No notifications"
              hint="Ticket updates, upload events, and engine alerts will appear here."
            />
          </div>
        ) : (
          <NotificationList grouped={grouped} onClose={onClose} />
        )}
      </div>
    </>
  );
}

function NotificationList({
  grouped,
  onClose,
}: {
  grouped: ReturnType<typeof groupNotifications>;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col">
      <GroupSection label="Today" items={grouped.today} onClose={onClose} />
      <GroupSection label="Yesterday" items={grouped.yesterday} onClose={onClose} />
      <GroupSection label="Earlier" items={grouped.earlier} onClose={onClose} />
    </div>
  );
}

function GroupSection({
  label,
  items,
  onClose,
}: {
  label: string;
  items: ReadonlyArray<Notification>;
  onClose: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="sticky top-0 bg-muted/60 px-4 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <ul>
        {items.map((n) => (
          <NotificationRow key={n.id} notification={n} onClose={onClose} />
        ))}
      </ul>
    </section>
  );
}

function NotificationRow({
  notification,
  onClose,
}: {
  notification: Notification;
  onClose: () => void;
}) {
  const router = useRouter();
  const markOne = useMarkNotificationRead();
  const unread = notification.readAt === null;

  function activate() {
    if (unread) markOne.mutate(notification.id);
    if (notification.deepLink) router.push(notification.deepLink);
    onClose();
  }

  return (
    <li>
      <button
        type="button"
        onClick={activate}
        className={cn(
          'flex w-full items-start gap-2.5 border-b border-border px-4 py-2.5 text-left transition-colors hover:bg-muted/40',
          unread && 'bg-orange/[0.03]',
        )}
      >
        <span
          className={cn(
            'mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full',
            unread ? 'bg-orange' : 'bg-transparent',
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium text-sm text-foreground">
              {notification.title}
            </span>
            <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {formatTimeAgo(notification.createdAt)}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {notification.message}
          </p>
          {(notification.actorName || notification.workspaceName) ? (
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {notification.actorName ? <span>{notification.actorName}</span> : null}
              {notification.actorName && notification.workspaceName ? (
                <span aria-hidden="true">·</span>
              ) : null}
              {notification.workspaceName ? (
                <span>{notification.workspaceName}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </button>
    </li>
  );
}

// ----- Loading skeleton ----------------------------------------------

function SkeletonRows() {
  return (
    <ul className="divide-y divide-border" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-start gap-2.5 px-4 py-2.5">
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted" />
          <div className="flex-1">
            <div className="h-3 w-3/4 animate-shimmer rounded bg-muted" />
            <div className="mt-2 h-2 w-1/2 animate-shimmer rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ----- helpers -------------------------------------------------------

function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Date(iso).toLocaleDateString();
}
