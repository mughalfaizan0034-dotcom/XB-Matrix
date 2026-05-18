'use client';

import { useEffect, useState } from 'react';
import { Button, Dialog, FormField, Input, Select, useToast } from '@xb/ui';
import { type Workspace, usePatchWorkspace } from '@/lib/api-workspaces';
import { describeError } from '@/lib/session';
import { ApiError } from '@/lib/api-client';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'PKR', 'INR'];
const TYPES = [
  { value: 'marketplace',  label: 'Marketplace' },
  { value: 'dtc',          label: 'DTC' },
  { value: 'warehouse',    label: 'Warehouse' },
  { value: 'omni_channel', label: 'Omni-channel' },
] as const;

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

export function EditWorkspaceDialog({
  open,
  onClose,
  workspace,
}: {
  open: boolean;
  onClose: () => void;
  workspace: Workspace | null;
}) {
  const toast = useToast();
  const patch = usePatchWorkspace();
  const [workspaceName, setName] = useState('');
  const [workspaceType, setType] = useState<Workspace['workspaceType']>('marketplace');
  const [defaultCurrencyCode, setCurrency] = useState('USD');
  const [timezone, setTimezone] = useState('UTC');
  const [dosTargetDays, setDos] = useState('30');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open && workspace) {
      setName(workspace.workspaceName);
      setType(workspace.workspaceType);
      setCurrency(workspace.defaultCurrencyCode);
      setTimezone(workspace.timezone);
      // dos_target_days comes from PG as "30.00"; the new tighter UX wants
      // an integer for display + edit, so round on load.
      setDos(String(Math.round(Number(workspace.dosTargetDays))));
      setSubmitError(null);
    }
  }, [open, workspace]);

  const dosError = validateDos(dosTargetDays);

  function close() {
    if (patch.isPending) return;
    onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setSubmitError(null);
    try {
      await patch.mutateAsync({
        id: workspace.id,
        input: {
          workspaceName,
          workspaceType,
          defaultCurrencyCode,
          timezone,
          dosTargetDays: Number(dosTargetDays),
          expectedRowVersion: workspace.rowVersion,
        },
      });
      toast.push('success', `Updated "${workspaceName}".`);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.status === 422)) {
        setSubmitError(err.message);
        return;
      }
      toast.push('error', describeError(err));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={workspace ? `Edit ${workspace.workspaceName}` : 'Edit workspace'}
      footer={
        <>
          <Button variant="outline" type="button" onClick={close} disabled={patch.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-ws-form"
            disabled={patch.isPending || !workspaceName.trim() || dosError !== null}
          >
            {patch.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="edit-ws-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label="Workspace name" required error={submitError}>
          {(p) => (
            <Input
              {...p}
              value={workspaceName}
              onChange={(e) => {
                setName(e.target.value);
                if (submitError) setSubmitError(null);
              }}
              required
              maxLength={200}
              autoComplete="off"
            />
          )}
        </FormField>

        <FormField label="Workspace type" required>
          {(p) => (
            <Select
              {...p}
              value={workspaceType}
              onChange={(e) => setType(e.target.value as Workspace['workspaceType'])}
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
          <FormField label="Timezone">
            {(p) => (
              <Input
                {...p}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                maxLength={64}
                autoComplete="off"
              />
            )}
          </FormField>
        </div>

        <FormField
          label="DOS target (days)"
          hint={dosError ? undefined : 'Whole days, 1–365.'}
          error={dosError}
          required
        >
          {(p) => (
            <Input
              {...p}
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              step={1}
              value={dosTargetDays}
              onChange={(e) => setDos(e.target.value.replace(/[^\d]/g, ''))}
              required
            />
          )}
        </FormField>
      </form>
    </Dialog>
  );
}
