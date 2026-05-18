'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, FormField, Input, Select, useToast } from '@xb/ui';
import { isValidSlug, toSlug } from '@xb/types/slug';
import { useCreateOrganization } from '@/lib/api-orgs';
import { describeError } from '@/lib/session';
import { ApiError } from '@/lib/api-client';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'PKR', 'INR'];

export function NewOrganizationDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const create = useCreateOrganization();
  const [displayName, setDisplayName] = useState('');
  const [defaultCurrencyCode, setCurrency] = useState('USD');
  const [legalName, setLegalName] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Slug is derived live and never user-editable. Same utility runs on the
  // backend so what you see here is exactly what will be stored.
  const slug = useMemo(() => toSlug(displayName), [displayName]);
  const slugValid = slug.length === 0 || isValidSlug(slug);

  function resetState() {
    setDisplayName('');
    setLegalName('');
    setCurrency('USD');
    setSubmitError(null);
  }

  // Reset every time the dialog opens — never leak stale values from a
  // previous attempt.
  useEffect(() => {
    if (open) resetState();
  }, [open]);

  function close() {
    if (create.isPending) return;
    onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    try {
      await create.mutateAsync({
        displayName,
        defaultCurrencyCode,
        ...(legalName ? { legalName } : {}),
      });
      toast.push('success', `Organization "${displayName}" created.`);
      onClose();
    } catch (err) {
      // Conflict is the common case — surface inline and keep the dialog
      // open with values preserved. Other errors go to the toast.
      if (err instanceof ApiError && err.status === 409) {
        setSubmitError(err.message);
        return;
      }
      toast.push('error', describeError(err));
    }
  }

  const canSubmit =
    !create.isPending && displayName.trim().length > 0 && slug.length > 0 && slugValid;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New organization"
      description="Organizations are the top-level tenant boundary. Each contains workspaces."
      footer={
        <>
          <Button variant="outline" type="button" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="new-org-form" disabled={!canSubmit}>
            {create.isPending ? 'Creating…' : 'Create organization'}
          </Button>
        </>
      }
    >
      <form id="new-org-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField
          label="Organization name"
          required
          error={submitError}
        >
          {(p) => (
            <Input
              {...p}
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (submitError) setSubmitError(null);
              }}
              placeholder="Acme Brands"
              required
              autoFocus
              maxLength={200}
              autoComplete="off"
            />
          )}
        </FormField>

        <FormField
          label="URL identifier"
          hint="Auto-generated from the name. Immutable once created."
        >
          {(p) => (
            <Input
              {...p}
              value={slug || '—'}
              readOnly
              tabIndex={-1}
              className="bg-muted/40 font-mono text-xs text-muted-foreground"
            />
          )}
        </FormField>

        <FormField label="Legal name (optional)">
          {(p) => (
            <Input
              {...p}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Acme Brands Pvt Ltd"
              maxLength={200}
              autoComplete="off"
            />
          )}
        </FormField>

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
      </form>
    </Dialog>
  );
}
