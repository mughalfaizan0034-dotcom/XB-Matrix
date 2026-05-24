'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Layers, AlertTriangle, Plus, Trash2, MoreHorizontal, Inbox } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  Dialog,
  DropdownMenu,
  FormField,
  Input,
  Metric,
  PageHeader,
  Select,
  useDataTableState,
  useToast,
  type ColumnDef,
  type DropdownMenuItem,
} from '@xb/ui';
import { useActiveWorkspace, useSession, describeError } from '@/lib/session';
import {
  ALIAS_TYPES,
  useAliasConflicts,
  useCreateSkuAlias,
  useDeleteSkuAlias,
  usePatchSkuAlias,
  useSkuAliases,
  type AliasType,
  type SkuAlias,
} from '@/lib/api-sku-aliases';

const PAGE_STORAGE = 'sku-aliases-table';

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

export default function SkuAliasesPage() {
  const { data: user } = useSession();
  const { data: activeWorkspace } = useActiveWorkspace();
  const [tableState, tableActions] = useDataTableState({
    storageKey: PAGE_STORAGE,
    urlKey: 'aliases',
    defaultPageSize: 50,
    defaultSort: { column: 'updatedAt', direction: 'desc' },
  });

  const typeFilter = tableState.filters.aliasType as AliasType | undefined;
  const platformFilter = tableState.filters.sourcePlatform as string | undefined;

  const aliasesQ = useSkuAliases(
    activeWorkspace
      ? {
          workspaceId: activeWorkspace.id,
          q: tableState.search.trim() || undefined,
          aliasType: typeFilter,
          sourcePlatform: platformFilter,
          sort: tableState.sort
            ? `${tableState.sort.direction === 'desc' ? '-' : ''}${tableState.sort.column}`
            : '-updatedAt',
          page: tableState.page,
          pageSize: tableState.pageSize,
        }
      : null,
  );
  const conflictsQ = useAliasConflicts(activeWorkspace?.id ?? null);

  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SkuAlias | null>(null);
  const deleteAlias = useDeleteSkuAlias();
  const patchAlias = usePatchSkuAlias();
  const toast = useToast();

  function buildRowMenu(a: SkuAlias): DropdownMenuItem[] {
    return [
      {
        key: 'toggle',
        label: a.isActive ? 'Deactivate' : 'Activate',
        onSelect: async () => {
          try {
            await patchAlias.mutateAsync({
              id: a.id,
              expectedRowVersion: a.rowVersion,
              isActive: !a.isActive,
            });
            toast.push('success', a.isActive ? 'Alias deactivated.' : 'Alias activated.');
          } catch (err) {
            toast.push('error', describeError(err));
          }
        },
      },
      {
        key: 'delete',
        label: 'Soft delete',
        icon: Trash2,
        variant: 'danger',
        divider: true,
        onSelect: () => setConfirmDelete(a),
      },
    ];
  }

  const COLUMNS: ReadonlyArray<ColumnDef<SkuAlias>> = useMemo(
    () => [
      {
        key: 'skuNormalized',
        header: 'Normalized SKU',
        sortKey: 'skuNormalized',
        hideable: false,
        accessor: (a) => (
          <span className="font-mono text-xs font-medium text-foreground">{a.skuNormalized}</span>
        ),
      },
      {
        key: 'aliasValue',
        header: 'Alias',
        sortKey: 'aliasValue',
        accessor: (a) => <span className="font-mono text-xs text-foreground">{a.aliasValue}</span>,
      },
      {
        key: 'aliasType',
        header: 'Type',
        sortKey: 'aliasType',
        accessor: (a) => <Badge tone="neutral">{ALIAS_TYPE_LABEL[a.aliasType]}</Badge>,
      },
      {
        key: 'sourcePlatform',
        header: 'Platform',
        sortKey: 'sourcePlatform',
        accessor: (a) =>
          a.sourcePlatform ? (
            <span className="text-sm text-foreground">{a.sourcePlatform}</span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          ),
      },
      {
        key: 'sourceMarketplace',
        header: 'Marketplace',
        sortKey: 'sourceMarketplace',
        accessor: (a) =>
          a.sourceMarketplace ? (
            <span className="text-sm text-foreground">{a.sourceMarketplace}</span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          ),
      },
      {
        key: 'status',
        header: 'Status',
        accessor: (a) => (
          <Badge tone={a.isActive ? 'success' : 'neutral'}>
            {a.isActive ? 'active' : 'inactive'}
          </Badge>
        ),
      },
      {
        key: 'sourceMethod',
        header: 'Source',
        accessor: (a) => (
          <span className="text-xs text-muted-foreground">{a.sourceMethod.replace('_', ' ')}</span>
        ),
      },
      {
        key: 'actions',
        header: '',
        width: '48px',
        hideable: false,
        accessor: (a) => (
          <DropdownMenu
            align="end"
            trigger={
              <span className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </span>
            }
            items={buildRowMenu(a)}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!activeWorkspace) {
    return (
      <div className="flex flex-col gap-6 p-6 lg:p-8">
        <PageHeader
          title="SKU Aliases"
          description="Cross-platform SKU identity. Maps platform-specific codes (Amazon SKU, ASIN, UPC, Walmart item ID, …) to one normalized operational SKU."
        />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {user?.isInternalManager
              ? 'Pick a workspace from the topbar switcher to manage SKU aliases.'
              : 'Pick a workspace to begin.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = aliasesQ.data?.items ?? [];
  const agg = aliasesQ.data?.aggregates;
  const conflicts = conflictsQ.data ?? [];

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
        title="SKU Aliases"
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
          <div className="flex items-center gap-2">
            <Link
              href="/sku-aliases/unresolved"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Inbox className="h-3.5 w-3.5" /> Unresolved queue
            </Link>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New alias
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">
            Every commerce metric in XB Matrix aggregates on the <span className="font-medium text-foreground">normalized SKU</span>.
            Aliases let one product carry many platform-specific codes (Amazon SKU, ASIN, Walmart item ID, UPC, supplier code, …) and resolve
            to a single operational identity. Engines never see the platform-shaped value, they read <code className="font-mono">sku_normalized</code>.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Aliases"
              value={agg ? agg.totalAliases.toLocaleString() : '-'}
              hint="active + inactive in scope"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Distinct SKUs"
              value={agg ? agg.distinctSkus.toLocaleString() : '-'}
              hint="normalized identities covered"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Platforms"
              value={agg ? agg.distinctPlatforms.toLocaleString() : '-'}
              hint="distinct source_platform values"
            />
          </CardContent>
        </Card>
      </div>

      {conflicts.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning-600" />
            <CardTitle>Conflicts ({conflicts.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden p-0">
            <div className="max-h-72 overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Alias</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Platform / market</th>
                    <th className="px-3 py-2">Resolves to (ambiguous)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {conflicts.map((c, i) => (
                    <tr key={`${c.aliasType}-${c.aliasValue}-${i}`}>
                      <td className="px-3 py-2 font-mono text-foreground">{c.aliasValue}</td>
                      <td className="px-3 py-2">{ALIAS_TYPE_LABEL[c.aliasType]}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {[c.sourcePlatform, c.sourceMarketplace].filter(Boolean).join(' · ') || '-'}
                      </td>
                      <td className="px-3 py-2 font-mono text-foreground">{c.resolvedSkus.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              Conflicts occur when the same alias points to multiple normalized SKUs. Deactivate or soft-delete the wrong row to
              restore unambiguous resolution. The unique index prevents new conflicts on active rows.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        <DataTableToolbar<SkuAlias>
          columns={COLUMNS}
          columnVisibility={tableState.columnVisibility}
          onColumnVisibilityChange={tableActions.setColumnVisibility}
          search={tableState.search}
          onSearchChange={tableActions.setSearch}
          searchPlaceholder="Search alias or normalized SKU"
          density={tableState.density}
          onDensityChange={tableActions.setDensity}
          chips={chips}
          onClearAllFilters={chips.length > 0 ? tableActions.clearAllFilters : undefined}
          trailing={
            <DropdownMenu
              align="end"
              width="w-56"
              header={
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Filter by alias type
                </div>
              }
              trigger={
                <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                  {typeFilter ? `Type: ${ALIAS_TYPE_LABEL[typeFilter]}` : 'Alias type'}
                </span>
              }
              items={[
                {
                  key: '__all__',
                  label: 'All types',
                  trailing: typeFilter ? null : <span aria-hidden="true">✓</span>,
                  onSelect: () => tableActions.clearFilter('aliasType'),
                },
                ...ALIAS_TYPES.map((t) => ({
                  key: t,
                  label: ALIAS_TYPE_LABEL[t],
                  trailing: typeFilter === t ? <span aria-hidden="true">✓</span> : null,
                  onSelect: () => tableActions.setFilter('aliasType', t),
                })),
              ]}
            />
          }
        />

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <DataTable
            columns={COLUMNS}
            rows={rows}
            rowKey={(a) => a.id}
            loading={aliasesQ.isLoading}
            density={tableState.density}
            sort={tableState.sort}
            onSortChange={tableActions.setSort}
            columnVisibility={tableState.columnVisibility}
            onColumnVisibilityChange={tableActions.setColumnVisibility}
            className="rounded-none border-0"
            emptyState={
              <div className="flex flex-col items-center gap-3 py-6">
                <span className="text-sm">
                  {chips.length > 0
                    ? 'No aliases match the current filters.'
                    : 'No SKU aliases yet. Add the first one to start normalizing identity across platforms.'}
                </span>
                {chips.length === 0 ? (
                  <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add the first alias
                  </Button>
                ) : null}
              </div>
            }
          />
          {aliasesQ.data && aliasesQ.data.total > tableState.pageSize ? (
            <DataTablePagination
              page={tableState.page}
              pageSize={tableState.pageSize}
              total={aliasesQ.data.total}
              onPageChange={tableActions.setPage}
              onPageSizeChange={tableActions.setPageSize}
            />
          ) : null}
        </div>
      </div>

      <CreateAliasDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        workspaceId={activeWorkspace.id}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        variant="danger"
        title={confirmDelete ? `Soft delete alias "${confirmDelete.aliasValue}"?` : ''}
        description="The alias stops resolving and engines will no longer normalize on it. You can undo by restoring; canonical rows already attributed keep their normalized SKU."
        confirmLabel="Soft delete"
        busy={deleteAlias.isPending}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await deleteAlias.mutateAsync({
              id: confirmDelete.id,
              expectedRowVersion: confirmDelete.rowVersion,
            });
            toast.push('success', 'Alias deleted.');
            setConfirmDelete(null);
          } catch (err) {
            toast.push('error', describeError(err));
          }
        }}
      />
    </div>
  );
}

function CreateAliasDialog({
  open,
  onClose,
  workspaceId,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
}) {
  const create = useCreateSkuAlias();
  const toast = useToast();
  const [skuNormalized, setSkuNormalized] = useState('');
  const [aliasValue, setAliasValue] = useState('');
  const [aliasType, setAliasType] = useState<AliasType>('platform_sku');
  const [sourcePlatform, setSourcePlatform] = useState('');
  const [sourceMarketplace, setSourceMarketplace] = useState('');
  const [sourceAccount, setSourceAccount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset on open.
  useMemo(() => {
    if (open) {
      setSkuNormalized('');
      setAliasValue('');
      setAliasType('platform_sku');
      setSourcePlatform('');
      setSourceMarketplace('');
      setSourceAccount('');
      setNotes('');
      setSubmitError(null);
    }
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    try {
      await create.mutateAsync({
        workspaceId,
        skuNormalized,
        aliasValue,
        aliasType,
        sourcePlatform: sourcePlatform.trim() || null,
        sourceMarketplace: sourceMarketplace.trim() || null,
        sourceAccount: sourceAccount.trim() || null,
        notes: notes.trim() || null,
      });
      toast.push('success', `Alias "${aliasValue}" added.`);
      onClose();
    } catch (err) {
      setSubmitError(describeError(err));
    }
  }

  const canSubmit =
    !create.isPending && skuNormalized.trim().length > 0 && aliasValue.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={() => (create.isPending ? undefined : onClose())}
      title="New SKU alias"
      description="Map a platform-specific code to your normalized SKU. The hot-path resolver matches on (alias type + value + optional source context)."
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="new-alias-form" disabled={!canSubmit}>
            {create.isPending ? 'Saving…' : 'Add alias'}
          </Button>
        </>
      }
    >
      <form id="new-alias-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label="Normalized SKU" required hint="Your canonical operational identity for this product.">
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Alias value" required>
            {(p) => (
              <Input
                {...p}
                value={aliasValue}
                onChange={(e) => setAliasValue(e.target.value)}
                placeholder="B0C123XYZ"
                required
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
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Source platform" hint="amazon / walmart / shopify / …">
            {(p) => (
              <Input
                {...p}
                value={sourcePlatform}
                onChange={(e) => setSourcePlatform(e.target.value)}
                placeholder="amazon"
                maxLength={80}
              />
            )}
          </FormField>
          <FormField label="Marketplace" hint="amazon_us / amazon_uk / …">
            {(p) => (
              <Input
                {...p}
                value={sourceMarketplace}
                onChange={(e) => setSourceMarketplace(e.target.value)}
                placeholder="amazon_us"
                maxLength={80}
              />
            )}
          </FormField>
          <FormField label="Seller / merchant account">
            {(p) => (
              <Input
                {...p}
                value={sourceAccount}
                onChange={(e) => setSourceAccount(e.target.value)}
                placeholder="optional"
                maxLength={200}
              />
            )}
          </FormField>
        </div>

        <FormField label="Notes" hint="Optional context: why this mapping, who proposed it, etc.">
          {(p) => (
            <Input
              {...p}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              placeholder="optional"
            />
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
