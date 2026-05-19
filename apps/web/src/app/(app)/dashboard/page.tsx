'use client';

import Link from 'next/link';
import { Building2, Layers, ArrowRight } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Metric,
  useToast,
} from '@xb/ui';
import {
  describeError,
  useActiveWorkspace,
  useSession,
  type ActiveWorkspaceSummary,
} from '@/lib/session';
import {
  useAccessibleWorkspaces,
  useSetActiveWorkspace,
  type AccessibleWorkspace,
} from '@/lib/api-workspaces-switch';

export default function DashboardPage() {
  const { data: user } = useSession();
  const { data: activeWorkspace, isLoading: activeLoading } = useActiveWorkspace();
  const { data: accessible } = useAccessibleWorkspaces();

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Dashboard</h1>
        {activeWorkspace ? (
          <p className="text-sm text-muted-foreground">
            Operational overview for{' '}
            <span className="font-medium text-foreground">{activeWorkspace.workspaceName}</span>
            <span className="mx-1.5 text-muted-foreground">·</span>
            <span>{activeWorkspace.organizationName}</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {user?.isInternalManager
              ? 'Pick a workspace from the topbar to scope the view.'
              : 'Pick a workspace to begin.'}
          </p>
        )}
      </div>

      {activeLoading ? null : activeWorkspace ? (
        <ActiveDashboard workspace={activeWorkspace} />
      ) : (
        <NoWorkspaceState
          accessible={accessible ?? []}
          isManager={user?.isInternalManager ?? false}
        />
      )}
    </div>
  );
}

function ActiveDashboard({ workspace }: { workspace: ActiveWorkspaceSummary }) {
  return (
    <>
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-navy-100 text-navy">
                <Layers className="h-4 w-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{workspace.workspaceName}</span>
                  <Badge tone="info">{prettyType(workspace.workspaceType)}</Badge>
                  <Badge tone={workspace.workspaceStatus === 'active' ? 'success' : 'neutral'}>
                    {workspace.workspaceStatus}
                  </Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  <span>{workspace.organizationName}</span>
                </div>
              </div>
            </div>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Manage workspace <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <Metric label="Revenue (30d)" value="—" hint="awaiting engine output" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric label="Ad spend (30d)" value="—" hint="awaiting engine output" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric label="Units sold" value="—" hint="awaiting engine output" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric label="Stock cover" value="—" hint="awaiting engine output" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foundation phase</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Business logic engines are intentionally not implemented yet. Metric tiles render the
            shell scoped to the active workspace; values populate once the uploads + calculations
            pipeline lands.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function NoWorkspaceState({
  accessible,
  isManager,
}: {
  accessible: ReadonlyArray<AccessibleWorkspace>;
  isManager: boolean;
}) {
  const toast = useToast();
  const setActive = useSetActiveWorkspace();

  async function pick(ws: AccessibleWorkspace) {
    try {
      await setActive.mutateAsync(ws.id);
      toast.push('success', `Switched to ${ws.workspaceName}.`);
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  if (accessible.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {isManager
              ? 'No active workspaces exist yet. Create one from Settings to get started.'
              : 'You do not have access to any workspaces yet. Ask your organization admin to invite you to one.'}
          </p>
          <div className="mt-4">
            <Link href="/settings">
              <Button size="sm" variant="outline">
                Open Settings
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Up to 6 quick-pick cards so users can land on a workspace in one click
  // without having to hunt down the topbar switcher.
  const quickPicks = accessible.slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick a workspace</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickPicks.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => pick(ws)}
              disabled={setActive.isPending}
              className="flex flex-col items-start gap-1 rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors hover:border-navy/40 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">{ws.workspaceName}</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />
                <span>{ws.organizationName}</span>
                <span aria-hidden="true">·</span>
                <span>{prettyType(ws.workspaceType)}</span>
              </span>
            </button>
          ))}
        </div>
        {accessible.length > quickPicks.length ? (
          <p className="mt-3 text-xs text-muted-foreground">
            +{accessible.length - quickPicks.length} more — use the workspace switcher in the topbar
            to find them.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function prettyType(t: AccessibleWorkspace['workspaceType']): string {
  switch (t) {
    case 'marketplace':  return 'Marketplace';
    case 'dtc':          return 'DTC';
    case 'warehouse':    return 'Warehouse';
    case 'omni_channel': return 'Omni-channel';
  }
}
