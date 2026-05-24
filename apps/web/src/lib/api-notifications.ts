'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from './session';

/**
 * Notification feed client.
 *
 * Backend canonical tables (xb_core.notifications +
 * xb_core.notification_recipients) ship in a follow-up PR. Today
 * this hook returns an honest empty feed so the frontend shell can
 * land. The shape mirrors the eventual `/v1/notifications` response
 * so swapping in the real implementation is a one-file change.
 *
 * Per project_profile_and_support: backend owns notification
 * generation; frontend renders only. Optimistic mark-read transitions
 * are allowed (mutation flips the row state locally) but backend
 * remains authoritative on the next refetch.
 */

export type NotificationKind =
  | 'ticket_replied'
  | 'ticket_assigned'
  | 'ticket_status_changed'
  | 'ticket_cc_added'
  | 'ticket_closed'
  | 'upload_completed'
  | 'upload_failed'
  | 'upload_validation_issues'
  | 'unresolved_sku_alert'
  | 'engine_recommendation'
  | 'engine_anomaly'
  | 'system_incident'
  | 'billing_alert';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface Notification {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly severity: NotificationSeverity;
  readonly title: string;
  readonly message: string;
  /** Display name of the actor that triggered this event (null = system). */
  readonly actorName: string | null;
  /** Workspace this event belongs to (null = org-wide / platform). */
  readonly workspaceName: string | null;
  /** Frontend route to navigate to when the row is clicked. */
  readonly deepLink: string | null;
  readonly createdAt: string;
  readonly readAt: string | null;
}

export interface NotificationsResult {
  readonly items: ReadonlyArray<Notification>;
  readonly unreadCount: number;
  readonly hasMore: boolean;
}

// Actor-scoped query key. The notification feed is per-actor; a flat
// key risks cross-tenant leakage if a future refactor drops the
// sign-in/out `qc.clear()` that mitigates it today. Including the
// actor id makes the cache key naturally invalidate on actor switch
// and prevents a stale feed from ever reaching the wrong session.
function notificationsKey(actorId: string | null) {
  return ['notifications', actorId] as const;
}

const EMPTY_RESULT: NotificationsResult = {
  items: [],
  unreadCount: 0,
  hasMore: false,
};

/**
 * Stub: returns an empty feed. Swap the queryFn to a real
 * `api.get<NotificationsResult>('/v1/notifications')` call when the
 * backend ships. Keep the same key + shape so consumers do not change.
 */
export function useNotifications() {
  const { data: user } = useSession();
  return useQuery({
    queryKey: notificationsKey(user?.actorId ?? null),
    queryFn: async (): Promise<NotificationsResult> => EMPTY_RESULT,
    staleTime: 30_000,
    enabled: user !== null,
  });
}

/**
 * Mark a single notification as read. Optimistically updates the
 * cache, then re-queries on settle so the backend's read_at wins.
 * Rolls back to the snapshot on error so a failed mutation does not
 * leave the UI in a falsely-read state.
 */
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const { data: user } = useSession();
  const key = notificationsKey(user?.actorId ?? null);
  return useMutation({
    mutationFn: async (_id: string) => {
      // No-op until backend ships. The cache update below still runs
      // so the UI feels immediate during local-only testing.
      return;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationsResult>(key);
      if (prev) {
        qc.setQueryData<NotificationsResult>(key, {
          ...prev,
          unreadCount: Math.max(0, prev.unreadCount - 1),
          items: prev.items.map((n) =>
            n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) qc.setQueryData<NotificationsResult>(key, context.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** Bulk mark-all-read. Same optimistic pattern with rollback. */
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  const { data: user } = useSession();
  const key = notificationsKey(user?.actorId ?? null);
  return useMutation({
    mutationFn: async () => {
      return;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationsResult>(key);
      if (prev) {
        const now = new Date().toISOString();
        qc.setQueryData<NotificationsResult>(key, {
          ...prev,
          unreadCount: 0,
          items: prev.items.map((n) => (n.readAt ? n : { ...n, readAt: now })),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData<NotificationsResult>(key, context.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

// ----- Grouping helper -----------------------------------------------

export type NotificationBucket = 'today' | 'yesterday' | 'earlier';

export interface GroupedNotifications {
  readonly today: ReadonlyArray<Notification>;
  readonly yesterday: ReadonlyArray<Notification>;
  readonly earlier: ReadonlyArray<Notification>;
}

/**
 * Group notifications by createdAt bucket. Today and yesterday are
 * computed from the local clock; earlier captures everything older.
 * Backend ordering (newest first) is preserved inside each bucket.
 */
export function groupNotifications(
  items: ReadonlyArray<Notification>,
): GroupedNotifications {
  const today: Notification[] = [];
  const yesterday: Notification[] = [];
  const earlier: Notification[] = [];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  for (const n of items) {
    const t = Date.parse(n.createdAt);
    if (t >= todayStart) today.push(n);
    else if (t >= yesterdayStart) yesterday.push(n);
    else earlier.push(n);
  }
  return { today, yesterday, earlier };
}
