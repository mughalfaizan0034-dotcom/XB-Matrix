'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Layers,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  Dialog,
  FormField,
  Input,
  Metric,
  PageHeader,
  Select,
  useDataTableState,
  useToast,
  type ColumnDef,
} from '@xb/ui';
import { useActiveWorkspace, useSession, describeError } from '@/lib/session';
import {
  ALIAS_TYPES,
  type AliasType,
  useCreateSkuAlias,
} from '@/lib/api-sku-aliases';
import {
  useDismissUnresolved,
  useReplayUnresolved,
  useRestoreUnresolved,
  useUnresolvedGroups,
  type UnresolvedGroup,
} from '@/lib/api-unresolved-sku';

const PAGE_STORAGE = 'unresolved-sku-table';

const ALIAS_TYPE_LABEL: Record<AliasType, string> = {
  platform_sku:  'Platform SKU',
  asin:          'ASIN',
  upc:           'UPC',
  ean:           'EAN',
  gtin:          'GTIN',
  isbn:          'ISBN',
  fnsku:         'FNSKU',
  supplier_sku:  'Supplier SKU',
  internal_sku:  'Internal SKU',
  warehouse_sku: 'Warehouse SKU',
};

export default function UnresolvedSkuPage() {
  const { data: user } = useSession();
  const { data: activeWorkspace } = useActiveWorkspace();
  const [tableState, tableActions] = useDataTableState({
    storageKey: PAGE_STORAGE,
    urlKey: 'unresolved',
    defaultPageSize: 50,
  });

  const typeFilter = tableState.filters.aliasType as AliasType | undefined;
  const platformFilter = tableState.filters.sourcePlatform as string | undefined;

  const groupsQ = useUnresolvedGroups(
    activeWorkspace
      ? {
          workspaceId: activeWorkspace.id,
          q: tableState.search.trim() || undefined,
          aliasType: typeFilter,
          sourcePlatform: platformFilter,
          page: tableState.page,
          pageSize: tableState.pageSize,
        }
      : null,
  );

  const [mapTarget, setMapTarget] = useState<UnresolvedGroup | null>(null);
  const [dismissTarget, setDismissTarget] = useState<UnresolvedGroup | null>(null);
  const replay = useReplayUnresolved();
  const dismiss = useDismissUnresolved();
  const restore = useRestoreUnresolved();
  const toast = useToast();

  const COLUMNS: ReadonlyArray<ColumnDef<UnresolvedGroup>> = useMemo(
    () => [
      {
        key: 'aliasValue',
        header: 'Unresolved alias',
        hideable: false,
        accessor: (g) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-xs font-medium text-foreground">{g.aliasValue}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {ALIAS_TYPE_LABEL[g.aliasType]}
            </span>
          </div>
        ),
      },
      {
        key: 'source',
        header: 'Source context',
        accessor: (g) => {
          const parts = [g.sourcePlatform, g.sourceMarketplace, g.sourceAccount].filter(Boolean);
          return parts.length ? (
            <span className="text-sm text-foreground">{parts.join(' · ')}</span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          );
        },
      },
      {
        key: 'reason',
        header: 'Reason',
        accessor: (g) => (
          <Badge tone={g.reason === 'ambiguous' ? 'warning' : 'neutral'}>
            {g.reason.replace('_', ' ')}
          </Badge>
        ),
      },
      {
        key: 'affectedRows',
        header: 'Affected rows',
        align: 'right',
        accessor: (g) => (
          <span className="tabular-nums text-sm font-medium text-foreground">
            {g.affectedRows.toLocaleString()}
          </span>
        ),
      },
      {
        key: 'lastSeenAt',
        header: 'Last seen',
        accessor: (g) => (
          <span className="text-xs text-muted-foreground">
            {new Date(g.lastSeenAt).toLocaleString()}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '',
        width: '220px',
        hideable: false,
        accessor: (g) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const r = await replay.mutateAsync({
                    workspaceId: activeWorkspace!.id,
                    aliasType: g.aliasType,
                    aliasValue: g.aliasValue,
                    sourcePlatform: g.sourcePlatform,
                    sourceMarketplace: g.sourceMarketplace,
                    sourceAccount: g.sourceAccount,
                  });
                  if (r.stillUnresolved) {
                    toast.push(
                      'info',
                      'No alias matches yet, add one and replay again.',
                    );
                  } else {
                    toast.push(
                      'success',
                      `Resolved ${r.markedMapped.toLocaleString()} rows to ${r.resolvedSkuNormalized}.`,
                    );
                  }
                } catch (err) {
                  toast.push('error', describeError(err));
                }
              }}
            >
              <Sparkles className="mr-1 h-3 w-3" /> Replay
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMapTarget(g)}
            >
              <Plus className="mr-1 h-3 w-3" /> Map
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDismissTarget(g)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeWorkspace?.id],
  );

  if (!activeWorkspace) {
    return (
      <div className="flex flex-col gap-6 p-6 lg:p-8">
        <PageHeader
          title="Unresolved SKUs"
          description="Rows the mapping layer couldn't translate. Add an alias for each one, then replay."
        />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {user?.isInternalManager
              ? 'Pick a workspace from the topbar switcher to view unresolved rows.'
              : 'Pick a workspace to begin.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = groupsQ.data?.items ?? [];
  const agg = groupsQ.data?.aggregates;

  const chips = [
    tableState.search
      ? { key: 'q', label: `Search: ${tableState.search}`, onRemove: () => tableActions.setSearch('') }
      : null,
    typeFilter
      ? {
          key: 'type',
          label: `Type: ${ALIAS_TYPE_LABEL[typeFilter]}`,
          onRemove: () => tableActions.clearFilter('aliasType'),
        }
      : null,
    platformFilter
      ? {
          key: 'platform',
          label: `Platform: ${platformFilter}`,
          onRemove: () => tableActions.clearFilter('sourcePlatform'),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>;

  return (
    <div className="flex flex-col gap-5 p-6 lg:p-8">
      <PageHeader
        title="Unresolved SKUs"
        description={
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            <span>{activeWorkspace.organizationName}</span>
            <span aria-hidden="true">·</span>
            <Layers className="h-3.5 w-3.5" />
            <span>{activeWorkspace.workspaceName}</span>
          </span>
        }
        actions={
          <Link
            href="/sku-aliases"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Aliases
          </Link>
        }
      />

      <Card>
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">
            When an upload row references a platform code with no matching alias, the mapping layer parks it here instead of dropping it.
            Add an alias for the platform code, then <span className="font-medium text-foreground">replay</span> to clear every affected row in one shot.
            Dismiss only when the code is genuine noise (deleted vendor SKUs, junk rows).
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Pending rows"
              value={agg ? agg.pendingRows.toLocaleString() : '-'}
              hint="rows blocked behind unresolved aliases"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Unique aliases"
              value={agg ? agg.distinctAliases.toLocaleString() : '-'}
              hint="distinct codes needing a mapping"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Affected uploads"
              value={agg ? agg.distinctUploads.toLocaleString() : '-'}
              hint="uploads with at least one parked row"
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <DataTableToolbar<UnresolvedGroup>
          columns={COLUMNS}
          columnVisibility={tableState.columnVisibility}
          onColumnVisibilityChange={tableActions.setColumnVisibility}
          search={tableState.search}
          onSearchChange={tableActions.setSearch}
          searchPlaceholder="Search alias value"
          density={tableState.density}
          onDensityChange={tableActions.setDensity}
          chips={chips}
          onClearAllFilters={chips.length > 0 ? tableActions.clearAllFilters : undefined}
        />

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <DataTable
            columns={COLUMNS}
            rows={rows}
            rowKey={(g) => `${g.aliasType}-${g.aliasValue}-${g.sourcePlatform ?? ''}-${g.sourceMarketplace ?? ''}-${g.sourceAccount ?? ''}`}
            loading={groupsQ.isLoading}
            density={tableState.density}
            columnVisibility={tableState.columnVisibility}
            onColumnVisibilityChange={tableActions.setColumnVisibility}
            className="rounded-none border-0"
            emptyState={
              <div className="flex flex-col items-center gap-2 py-6">
                <AlertTriangle className="h-5 w-5 text-emerald-600" />
                <span className="text-sm">
                  {chips.length > 0
                    ? 'No unresolved aliases match the current filters.'
                    : "Nothing parked here. Every uploaded row's SKU resolved cleanly."}
                </span>
              </div>
            }
          />
          {groupsQ.data && groupsQ.data.total > tableState.pageSize ? (
            <DataTablePagination
              page={tableState.page}
              pageSize={tableState.pageSize}
              total={groupsQ.data.total}
              onPageChange={tableActions.setPage}
              onPageSizeChange={tableActions.setPageSize}
            />
          ) : null}
        </div>
      </div>

      {mapTarget ? (
        <MapAliasDialog
          group={mapTarget}
          workspaceId={activeWorkspace.id}
          onClose={() => setMapTarget(null)}
          onDone={async () => {
            // After the alias is created, replay the group so the
            // operator sees the queue clear immediately.
            try {
              const r = await replay.mutateAsync({
                workspaceId: activeWorkspace.id,
                aliasType: mapTarget.aliasType,
                aliasValue: mapTarget.aliasValue,
                sourcePlatform: mapTarget.sourcePlatform,
                sourceMarketplace: mapTarget.sourceMarketplace,
                sourceAccount: mapTarget.sourceAccount,
              });
              if (!r.stillUnresolved) {
                toast.push(
                  'success',
                  `Alias added · ${r.markedMapped.toLocaleString()} rows resolved.`,
                );
              } else {
                toast.push('success', 'Alias added.');
              }
            } catch (err) {
              toast.push('error', describeError(err));
            }
            setMapTarget(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={dismissTarget !== null}
        onClose={() => setDismissTarget(null)}
        variant="danger"
        title={
          dismissTarget
            ? `Dismiss "${dismissTarget.aliasValue}" (${dismissTarget.affectedRows.toLocaleString()} rows)?`
            : ''
        }
        description="Dismissed rows stop appearing in the queue. They won't be canonicalized. Use Restore if you change your mind."
        confirmLabel="Dismiss"
        busy={dismiss.isPending}
        onConfirm={async () => {
          if (!dismissTarget) return;
          try {
            await dismiss.mutateAsync({
              workspaceId: activeWorkspace.id,
              aliasType: dismissTarget.aliasType,
              aliasValue: dismissTarget.aliasValue,
              sourcePlatform: dismissTarget.sourcePlatform,
              sourceMarketplace: dismissTarget.sourceMarketplace,
              sourceAccount: dismissTarget.sourceAccount,
            });
            toast.push('success', `Dismissed ${dismissTarget.affectedRows.toLocaleString()} rows.`);
            setDismissTarget(null);
          } catch (err) {
            toast.push('error', describeError(err));
          }
        }}
      />

      {/*
        Restore mutation isn't wired to a button here yet, the page only
        shows pending rows. A future enhancement adds a "Dismissed" view
        with a per-row Restore action that calls useRestoreUnresolved().
      */}
      {restore.isPending ? null : null}
    </div>
  );
}

function MapAliasDialog({
  group,
  workspaceId,
  onClose,
  onDone,
}: {
  group: UnresolvedGroup;
  workspaceId: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const create = useCreateSkuAlias();
  const [skuNormalized, setSkuNormalized] = useState('');
  const [aliasType, setAliasType] = useState<AliasType>(group.aliasType);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    try {
      await create.mutateAsync({
        workspaceId,
        skuNormalized: skuNormalized.trim(),
        aliasValue: group.aliasValue,
        aliasType,
        sourcePlatform: group.sourcePlatform,
        sourceMarketplace: group.sourceMarketplace,
        sourceAccount: group.sourceAccount,
        sourceMethod: 'manual',
      });
      await onDone();
    } catch (err) {
      setSubmitError(describeError(err));
    }
  }

  const canSubmit = !create.isPending && skuNormalized.trim().length > 0;

  return (
    <Dialog
      open
      onClose={() => (create.isPending ? undefined : onClose())}
      title="Map unresolved alias"
      description={`Resolves ${group.affectedRows.toLocaleString()} parked rows to your normalized SKU.`}
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="map-alias-form" disabled={!canSubmit}>
            {create.isPending ? 'Saving…' : 'Add alias & replay'}
          </Button>
        </>
      }
    >
      <form id="map-alias-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-medium text-foreground">{group.aliasValue}</span>
            <Badge tone="neutral">{ALIAS_TYPE_LABEL[group.aliasType]}</Badge>
          </div>
          <div className="mt-1 text-muted-foreground">
            {[group.sourcePlatform, group.sourceMarketplace, group.sourceAccount].filter(Boolean).join(' · ') || 'no source context'}
          </div>
        </div>

        <FormField label="Normalized SKU" required hint="The canonical operational identity to resolve to.">
          {(p) => (
            <Input
              {...p}
              value={skuNormalized}
              onChange={(e) => setSkuNormalized(e.target.value)}
              placeholder="WIDGET-A"
              required
              autoFocus
              maxLength={200}
            />
          )}
        </FormField>

        <FormField label="Alias type" required>
          {(p) => (
            <Select {...p} value={aliasType} onChange={(e) => setAliasType(e.target.value as AliasType)}>
              {ALIAS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ALIAS_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        {submitError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {submitError}
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}
