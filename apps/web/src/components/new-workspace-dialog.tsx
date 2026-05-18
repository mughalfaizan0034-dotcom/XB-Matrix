'use client';

import { useState, useEffect } from 'react';
import { Button, Dialog, FormField, Input, Select, useToast } from '@xb/ui';
import type { Organization } from '@/lib/api-orgs';
import { useCreateWorkspace } from '@/lib/api-workspaces';
import { describeError } from '@/lib/session';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'PKR', 'INR'];
const TYPES = [
  { value: 'marketplace',  label: 'Marketplace (Amazon, Walmart, etc.)' },
  { value: 'dtc',          label: 'DTC (your own store)' },
  { value: 'warehouse',    label: 'Warehouse (3PL / fulfillment)' },
  { value: 'omni_channel', label: 'Omni-channel (mixed)' },
] as const;

export function NewWorkspaceDialog({
  open,
  onClose,
  organizations,
  defaultOrganizationId,
}: {
  open: boolean;
  onClose: () => void;
  organizations: ReadonlyArray<Organization>;
  defaultOrganizationId?: string | null;
}) {
  const toast = useToast();
  const create = useCreateWorkspace();
  const [organizationId, setOrgId] = useState<string>(defaultOrganizationId ?? organizations[0]?.id ?? '');
  const [workspaceName, setName] = useState('');
  const [workspaceType, setType] = useState<(typeof TYPES)[number]['value']>('marketplace');
  const [defaultCurrencyCode, setCurrency] = useState('USD');
  const [dosTargetDays, setDos] = useState('30');

  useEffect(() => {
    if (open) {
      setOrgId(defaultOrganizationId ?? organizations[0]?.id ?? '');
      setCurrency(
        organizations.find((o) => o.id === (defaultOrganizationId ?? organizations[0]?.id))?.defaultCurrencyCode ?? 'USD',
      );
    }
  }, [open, organizations, defaultOrganizationId]);

  function close() {
    if (create.isPending) return;
    setName('');
    setDos('30');
    onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        organizationId,
        workspaceName,
        workspaceType,
        defaultCurrencyCode,
        dosTargetDays: Number(dosTargetDays),
      });
      toast.push('success', `Workspace "${workspaceName}" created.`);
      close();
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  const disabled =
    create.isPending || !workspaceName || !organizationId || !defaultCurrencyCode;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New workspace"
      description="Workspaces partition data within an organization (e.g. one per marketplace)."
      footer={
        <>
          <Button variant="outline" type="button" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="new-ws-form" disabled={disabled}>
            {create.isPending ? 'Creating…' : 'Create workspace'}
          </Button>
        </>
      }
    >
      <form id="new-ws-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        {organizations.length > 1 ? (
          <FormField label="Organization" required>
            {(p) => (
              <Select {...p} value={organizationId} onChange={(e) => setOrgId(e.target.value)} required>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.displayName}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        ) : null}

        <FormField label="Workspace name" required>
          {(p) => (
            <Input
              {...p}
              value={workspaceName}
              onChange={(e) => setName(e.target.value)}
              placeholder="Amazon US"
              required
              autoFocus
            />
          )}
        </FormField>

        <FormField label="Workspace type" required>
          {(p) => (
            <Select
              {...p}
              value={workspaceType}
              onChange={(e) => setType(e.target.value as (typeof TYPES)[number]['value'])}
              required
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Default currency" required>
            {(p) => (
              <Select
                {...p}
                value={defaultCurrencyCode}
                onChange={(e) => setCurrency(e.target.value)}
                required
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField
            label="DOS target (days)"
            hint="Days of stock target for forecasting; default 30"
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                max={9999}
                step="0.01"
                value={dosTargetDays}
                onChange={(e) => setDos(e.target.value)}
              />
            )}
          </FormField>
        </div>
      </form>
    </Dialog>
  );
}
