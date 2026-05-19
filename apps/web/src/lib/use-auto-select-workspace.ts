'use client';

import { useEffect, useRef } from 'react';
import {
  useAccessibleWorkspaces,
  useSetActiveWorkspace,
} from './api-workspaces-switch';
import { useActiveWorkspace, useSession } from './session';

/**
 * If the signed-in actor has exactly one accessible workspace and no
 * active workspace selected on the session yet, pick it automatically.
 *
 * This is the common case for organization users (one org, one workspace)
 * and skips a step the user would otherwise have to do manually on every
 * fresh session. Internal managers across many orgs are left alone.
 *
 * Runs at most once per page load — the ref guards against the mutation's
 * onSuccess invalidating the query and re-firing this effect.
 */
export function useAutoSelectWorkspace(): void {
  const { data: user } = useSession();
  const { data: active, isLoading: activeLoading } = useActiveWorkspace();
  const { data: accessible, isLoading: accessibleLoading } = useAccessibleWorkspaces();
  const setActive = useSetActiveWorkspace();
  const triggered = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (activeLoading || accessibleLoading) return;
    if (active) return;
    if (!accessible || accessible.length !== 1) return;
    if (triggered.current) return;
    if (setActive.isPending) return;
    triggered.current = true;
    setActive.mutate(accessible[0]!.id);
  }, [user, active, accessible, activeLoading, accessibleLoading, setActive]);
}
