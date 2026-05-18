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
      setDos(workspace.dosTargetDays);
      setSubmitError(null);
    }
  }, [open, workspace]);

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
          <Button type="submit" form="edit-ws-form" disabled={patch.isPending || !workspaceName.trim()}>
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

        <FormField label="DOS target (days)" hint="Days of stock target for forecasting">
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
      </form>
    </Dialog>
  );
}
