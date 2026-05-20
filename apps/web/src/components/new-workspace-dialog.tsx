'use client';

import { useEffect, useState } from 'react';
import { Button, Dialog, FormField, Input, Select, useToast } from '@xb/ui';
import { DEFAULT_TIMEZONE } from '@xb/types/timezones';
import type { Organization } from '@/lib/api-orgs';
import { useCreateWorkspace } from '@/lib/api-workspaces';
import { describeError } from '@/lib/session';
import { ApiError } from '@/lib/api-client';
import { TimezoneSelect } from '@/components/timezone-select';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'PKR', 'INR'];

const DOS_MIN = 1;
const DOS_MAX = 365;

function validateDos(value: string): string | null {
  if (value === '') return 'DOS target is required.';
  if (!/^\d+$/.test(value)) return 'DOS target must be a whole number.';
  const n = Number(value);
  if (n < DOS_MIN || n > DOS_MAX) {
    return `DOS target must be a whole number between ${DOS_MIN} and ${DOS_MAX}.`;
  }
  return null;
}

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
  const [workspaceType, setType] = useState('');
  const [defaultCurrencyCode, setCurrency] = useState('USD');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [dosTargetDays, setDos] = useState('30');
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const parentId = defaultOrganizationId ?? organizations[0]?.id ?? '';
      const parent = organizations.find((o) => o.id === parentId);
      setOrgId(parentId);
      setCurrency(parent?.defaultCurrencyCode ?? 'USD');
      setTimezone(parent?.defaultTimezone || DEFAULT_TIMEZONE);
      setName('');
      setType('');
      setDos('30');
      setNameError(null);
    }
  }, [open, organizations, defaultOrganizationId]);

  function close() {
    if (create.isPending) return;
    onClose();
  }

  const dosError = validateDos(dosTargetDays);
  const canSubmit =
    !create.isPending &&
    workspaceName.trim().length > 0 &&
    organizationId.length === 26 &&
    !!defaultCurrencyCode &&
    dosError === null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    if (dosError) return;
    try {
      await create.mutateAsync({
        organizationId,
        workspaceName,
        workspaceType: workspaceType.trim() || null,
        defaultCurrencyCode,
        timezone,
        dosTargetDays: Number(dosTargetDays),
      });
      toast.push('success', `Workspace "${workspaceName}" created.`);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setNameError(err.message);
        return;
      }
      toast.push('error', describeError(err));
    }
  }

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
          <Button type="submit" form="new-ws-form" disabled={!canSubmit}>
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

        <FormField label="Workspace name" required error={nameError}>
          {(p) => (
            <Input
              {...p}
              value={workspaceName}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="Amazon US"
              required
              autoFocus
              maxLength={200}
              autoComplete="off"
            />
          )}
        </FormField>

        <FormField label="Workspace type" hint="Optional free-text label, e.g. Amazon, DTC, Warehouse.">
          {(p) => (
            <Input
              {...p}
              value={workspaceType}
              onChange={(e) => setType(e.target.value)}
              placeholder="Optional"
              maxLength={80}
              autoComplete="off"
            />
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

          <FormField label="Timezone" required>
            {(p) => <TimezoneSelect {...p} value={timezone} onChange={setTimezone} required />}
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="DOS target (days)"
            hint={dosError ? undefined : `Whole days, ${DOS_MIN}–${DOS_MAX}. Default 30.`}
            error={dosError}
            required
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                min={DOS_MIN}
                max={DOS_MAX}
                step={1}
                value={dosTargetDays}
                onChange={(e) => setDos(e.target.value.replace(/[^\d]/g, ''))}
                required
              />
            )}
          </FormField>
        </div>
      </form>
    </Dialog>
  );
}
