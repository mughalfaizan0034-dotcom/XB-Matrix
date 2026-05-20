'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Globe,
  Layers,
  List,
} from 'lucide-react';
import { Portal, Z_LAYER, useOverlayPosition, useToast } from '@xb/ui';
import { cn } from '@xb/ui/lib/cn';
import { describeError, useActiveWorkspace, useSession } from '@/lib/session';
import {
  useAccessibleWorkspaces,
  useSetActiveWorkspace,
  type AccessibleWorkspace,
} from '@/lib/api-workspaces-switch';

/**
 * Topbar workspace switcher with a multi-level flyout:
 *   root popover    → "All workspaces" + one row per organization
 *   org row hovered → side flyout with that org's workspaces
 *
 * The flyout opens on hover/focus (with a small leave delay) and on
 * keyboard arrow-right; arrow-left collapses back to the org list.
 * Outside-click and Escape close everything.
 *
 * Implementation note: we don't use the generic DropdownMenu because
 * its flat-items API doesn't model nesting. Two portaled panels share
 * one open state; the side flyout is anchored to whichever org row is
 * currently active.
 */
export function WorkspaceSwitcher() {
  const { data: user } = useSession();
  const { data: active } = useActiveWorkspace();
  const { data: accessible, isLoading } = useAccessibleWorkspaces();
  const setActive = useSetActiveWorkspace();
  const toast = useToast();

  const grouped = useMemo(() => groupByOrganization(accessible ?? []), [accessible]);

  const [open, setOpen] = useState(false);
  // Which org's flyout is currently visible. null = none. Drives both
  // mouse and keyboard navigation in the root panel.
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const orgRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [flyoutEl, setFlyoutEl] = useState<HTMLDivElement | null>(null);
  const closeFlyoutTimer = useRef<number | null>(null);

  const rootPos = useOverlayPosition(triggerRef, rootEl, open, {
    placement: 'bottom-start',
    offset: 4,
  });
  const flyoutTriggerRef = useMemo(
    () => ({ current: activeOrgId ? orgRowRefs.current[activeOrgId] ?? null : null }),
    [activeOrgId],
  );
  const flyoutPos = useOverlayPosition(flyoutTriggerRef, flyoutEl, open && activeOrgId !== null, {
    placement: 'right-start',
    offset: 6,
  });

  // Outside click + Escape close.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (rootEl?.contains(t)) return;
      if (flyoutEl?.contains(t)) return;
      setOpen(false);
      setActiveOrgId(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setActiveOrgId(null);
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, rootEl, flyoutEl]);

  // Hide & reset on close.
  useEffect(() => {
    if (!open) setActiveOrgId(null);
  }, [open]);

  if (!user) return null;
  // Note: we used to return null here when `accessible` was empty, but
  // that hid the entire switcher for a brand-new manager with no
  // workspaces yet — leaving them stuck in "All workspaces · cross-org
  // view" with no obvious way out. We now always render the button and
  // surface an explicit empty state + management link inside the
  // dropdown so the user always has a next step.

  // Auto-pick the active workspace's org so the flyout opens at the
  // group the user is most likely browsing first.
  function openMenu(): void {
    if (active && grouped.some((g) => g.organizationId === active.organizationId)) {
      setActiveOrgId(active.organizationId);
    } else if (grouped.length === 1) {
      setActiveOrgId(grouped[0]!.organizationId);
    }
    setOpen(true);
  }

  function scheduleCloseFlyout(): void {
    if (closeFlyoutTimer.current) window.clearTimeout(closeFlyoutTimer.current);
    closeFlyoutTimer.current = window.setTimeout(() => {
      setActiveOrgId(null);
    }, 180);
  }
  function cancelCloseFlyout(): void {
    if (closeFlyoutTimer.current) {
      window.clearTimeout(closeFlyoutTimer.current);
      closeFlyoutTimer.current = null;
    }
  }

  async function pickWorkspace(ws: AccessibleWorkspace | null, label: string): Promise<void> {
    setOpen(false);
    setActiveOrgId(null);
    try {
      await setActive.mutateAsync(ws?.id ?? null);
      toast.push('success', ws ? `Switched to ${label}.` : 'Cleared active workspace.');
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  const triggerLabel = active ? active.workspaceName : 'All workspaces';
  const triggerOrg = active?.organizationName ?? (user.isInternalManager ? 'cross-org view' : '');
  const activeGroup = grouped.find((g) => g.organizationId === activeOrgId) ?? null;

  return (
    <span className="inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? (setOpen(false), setActiveOrgId(null)) : openMenu())}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex max-w-[240px] items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-muted',
          open && 'bg-muted',
        )}
      >
        <Layers className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="min-w-0 text-left leading-tight">
          <span className="block truncate text-xs font-medium text-foreground">{triggerLabel}</span>
          {triggerOrg ? (
            <span className="block truncate text-[10px] uppercase tracking-wide text-muted-foreground">
              {triggerOrg}
            </span>
          ) : null}
        </span>
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <>
          {/* ---- Root panel: orgs ---------------------------------------
              Three-section layout (sticky header, scrollable middle,
              sticky footer) so the org list scrolls internally when
              there are many orgs but "View all" and "Clear" stay
              reachable without scrolling. Caps the panel total at
              ~480px and the org list at ~320px (≈8 rows). */}
          <Portal>
            <div
              ref={setRootEl}
              role="menu"
              style={{
                position: 'fixed',
                top: rootPos?.top ?? -9999,
                left: rootPos?.left ?? -9999,
                zIndex: Z_LAYER.popover,
                maxHeight: rootPos?.maxHeight ?? 480,
                visibility: rootPos ? 'visible' : 'hidden',
                opacity: rootPos ? 1 : 0,
              }}
              className="flex w-64 flex-col rounded-md border border-border bg-card shadow-xb-md"
              onMouseLeave={scheduleCloseFlyout}
              onMouseEnter={cancelCloseFlyout}
            >
              <div className="flex-shrink-0 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {user.isInternalManager ? 'All organizations' : 'Workspaces'}
              </div>
              <div className="h-px flex-shrink-0 bg-border" aria-hidden="true" />

              {/* Scroll region — every org row lives here so the list
                  caps at ~8 visible items with a scrollbar past that. */}
              <div className="min-h-0 flex-1 overflow-y-auto p-1">
                {active ? (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => pickWorkspace(null, '')}
                      onMouseEnter={() => {
                        cancelCloseFlyout();
                        setActiveOrgId(null);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                    >
                      <Globe className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">All workspaces</span>
                    </button>
                    <div className="my-1 h-px bg-border" aria-hidden="true" />
                  </>
                ) : null}

                {/* Empty + loading states. A fresh manager often lands
                    here before any orgs/workspaces exist — give them a
                    clear path to Settings instead of a silent void. */}
                {isLoading && grouped.length === 0 ? (
                  <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                    Loading workspaces…
                  </div>
                ) : null}
                {!isLoading && grouped.length === 0 ? (
                  <div className="flex flex-col gap-2 px-2.5 py-3 text-xs">
                    <div className="text-muted-foreground">
                      {user.isInternalManager
                        ? 'No active workspaces in any organization yet.'
                        : 'No workspaces are available to you yet.'}
                    </div>
                    {user.isInternalManager ? (
                      <Link
                        href="/settings"
                        onClick={() => {
                          setOpen(false);
                          setActiveOrgId(null);
                        }}
                        className="inline-flex items-center gap-1.5 self-start rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted"
                      >
                        Open Settings to create one
                      </Link>
                    ) : (
                      <div className="text-muted-foreground">
                        Ask your administrator to grant access.
                      </div>
                    )}
                  </div>
                ) : null}

                {grouped.map((group) => {
                  const isActiveOrg = group.organizationId === activeOrgId;
                  const hasActiveWs = group.workspaces.some((w) => w.id === active?.id);
                  return (
                    <button
                      key={group.organizationId}
                      ref={(el) => {
                        orgRowRefs.current[group.organizationId] = el;
                      }}
                      type="button"
                      role="menuitem"
                      aria-haspopup="menu"
                      aria-expanded={isActiveOrg}
                      onMouseEnter={() => {
                        cancelCloseFlyout();
                        setActiveOrgId(group.organizationId);
                      }}
                      onFocus={() => {
                        cancelCloseFlyout();
                        setActiveOrgId(group.organizationId);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowRight' || e.key === 'Enter') {
                          e.preventDefault();
                          cancelCloseFlyout();
                          setActiveOrgId(group.organizationId);
                        }
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm transition-colors',
                        isActiveOrg ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="block truncate">{group.organizationName}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {group.workspaces.length} workspace
                          {group.workspaces.length === 1 ? '' : 's'}
                          {hasActiveWs ? ' · current' : ''}
                        </span>
                      </span>
                      <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>

              {/* Sticky footer — always visible, no matter how long the
                  org list grows. "View all" routes to the dedicated
                  picker page with search + collapsible tree. */}
              <div className="h-px flex-shrink-0 bg-border" aria-hidden="true" />
              <Link
                href="/select-workspace"
                onClick={() => {
                  setOpen(false);
                  setActiveOrgId(null);
                }}
                className="flex flex-shrink-0 items-center gap-2 rounded-b-md px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <List className="h-3.5 w-3.5" />
                <span>View all workspaces</span>
              </Link>
            </div>
          </Portal>

          {/* ---- Flyout: workspaces for activeOrgId ---------------------
              Same three-section layout. Caps total at ~480px and the
              workspace list at ~360px so very long lists scroll inside
              the flyout instead of overflowing the viewport. */}
          {activeGroup ? (
            <Portal>
              <div
                ref={setFlyoutEl}
                role="menu"
                style={{
                  position: 'fixed',
                  top: flyoutPos?.top ?? -9999,
                  left: flyoutPos?.left ?? -9999,
                  zIndex: Z_LAYER.popover,
                  maxHeight: flyoutPos?.maxHeight ?? 480,
                  visibility: flyoutPos ? 'visible' : 'hidden',
                  opacity: flyoutPos ? 1 : 0,
                }}
                className="flex w-64 flex-col rounded-md border border-border bg-card shadow-xb-md"
                onMouseEnter={cancelCloseFlyout}
                onMouseLeave={scheduleCloseFlyout}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    setActiveOrgId(null);
                    orgRowRefs.current[activeGroup.organizationId]?.focus();
                  }
                }}
              >
                <div className="flex-shrink-0 truncate px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {activeGroup.organizationName}
                </div>
                <div className="h-px flex-shrink-0 bg-border" aria-hidden="true" />
                <div className="min-h-0 flex-1 overflow-y-auto p-1">
                  {activeGroup.workspaces.map((ws) => {
                    const isActive = ws.id === active?.id;
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        role="menuitem"
                        onClick={() => pickWorkspace(ws, ws.workspaceName)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm transition-colors',
                          isActive ? 'bg-navy-50/60 text-foreground' : 'text-foreground hover:bg-muted',
                        )}
                      >
                        <Layers className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="block truncate">{ws.workspaceName}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {prettyType(ws.workspaceType)}
                          </span>
                        </span>
                        {isActive ? <Check className="h-3.5 w-3.5 text-navy" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Portal>
          ) : null}
        </>
      ) : null}
    </span>
  );
}

function groupByOrganization(
  workspaces: ReadonlyArray<AccessibleWorkspace>,
): ReadonlyArray<{
  organizationId: string;
  organizationName: string;
  workspaces: AccessibleWorkspace[];
}> {
  const map = new Map<string, { organizationId: string; organizationName: string; workspaces: AccessibleWorkspace[] }>();
  for (const ws of workspaces) {
    const existing = map.get(ws.organizationId);
    if (existing) existing.workspaces.push(ws);
    else map.set(ws.organizationId, {
      organizationId: ws.organizationId,
      organizationName: ws.organizationName,
      workspaces: [ws],
    });
  }
  return [...map.values()];
}

// Workspace type is a free-text optional label.
function prettyType(t: AccessibleWorkspace['workspaceType']): string {
  return t?.trim() || 'Workspace';
}
