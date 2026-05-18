'use client';

import { useEffect, useState } from 'react';
import { Button, Dialog, FormField, Input, Select, useToast } from '@xb/ui';
import { type Organization, usePatchOrganization } from '@/lib/api-orgs';
import { describeError } from '@/lib/session';
import { ApiError } from '@/lib/api-client';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'PKR', 'INR'];

export function EditOrganizationDialog({
  open,
  onClose,
  organization,
}: {
  open: boolean;
  onClose: () => void;
  organization: Organization | null;
}) {
  const toast = useToast();
  const patch = usePatchOrganization();
  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [defaultCurrencyCode, setCurrency] = useState('USD');
  const [defaultTimezone, setTimezone] = useState('UTC');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open && organization) {
      setDisplayName(organization.displayName);
      setLegalName(organization.legalName ?? '');
      setCurrency(organization.defaultCurrencyCode);
      setTimezone(organization.defaultTimezone);
      setSubmitError(null);
    }
  }, [open, organization]);

  function close() {
    if (patch.isPending) return;
    onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!organization) return;
    setSubmitError(null);
    try {
      await patch.mutateAsync({
        id: organization.id,
        input: {
          displayName,
          legalName: legalName.trim() ? legalName : null,
          defaultCurrencyCode,
          defaultTimezone,
          expectedRowVersion: organization.rowVersion,
        },
      });
      toast.push('success', `Updated "${displayName}".`);
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
      title={organization ? `Edit ${organization.displayName}` : 'Edit organization'}
      description="Slug and id are immutable. Updating display name does not affect the URL identifier."
      footer={
        <>
          <Button variant="outline" type="button" onClick={close} disabled={patch.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="edit-org-form" disabled={patch.isPending || !displayName.trim()}>
            {patch.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="edit-org-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label="URL identifier (immutable)">
          {(p) => (
            <Input
              {...p}
              value={organization?.slug ?? ''}
              readOnly
              tabIndex={-1}
              className="bg-muted/40 font-mono text-xs text-muted-foreground"
            />
          )}
        </FormField>

        <FormField label="Organization name" required error={submitError}>
          {(p) => (
            <Input
              {...p}
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (submitError) setSubmitError(null);
              }}
              required
              maxLength={200}
              autoComplete="off"
            />
          )}
        </FormField>

        <FormField label="Legal name">
          {(p) => (
            <Input
              {...p}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              maxLength={200}
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
          <FormField label="Default timezone">
            {(p) => (
              <Input
                {...p}
                value={defaultTimezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="UTC"
                maxLength={64}
                autoComplete="off"
              />
            )}
          </FormField>
        </div>
      </form>
    </Dialog>
  );
}
