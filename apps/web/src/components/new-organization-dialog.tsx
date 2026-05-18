'use client';

import { useState } from 'react';
import { Button, Dialog, FormField, Input, Select, useToast } from '@xb/ui';
import { useCreateOrganization } from '@/lib/api-orgs';
import { describeError } from '@/lib/session';

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
  const [slug, setSlug] = useState('');
  const [defaultCurrencyCode, setCurrency] = useState('USD');
  const [legalName, setLegalName] = useState('');

  function close() {
    if (create.isPending) return;
    setDisplayName('');
    setSlug('');
    setCurrency('USD');
    setLegalName('');
    onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        displayName,
        slug,
        defaultCurrencyCode,
        ...(legalName ? { legalName } : {}),
      });
      toast.push('success', `Organization "${displayName}" created.`);
      close();
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  function suggestSlug(v: string) {
    setSlug(
      v
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64),
    );
  }

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
          <Button
            type="submit"
            form="new-org-form"
            disabled={create.isPending || !displayName || !slug}
          >
            {create.isPending ? 'Creating…' : 'Create organization'}
          </Button>
        </>
      }
    >
      <form id="new-org-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label="Display name" required>
          {(p) => (
            <Input
              {...p}
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (!slug) suggestSlug(e.target.value);
              }}
              placeholder="Acme Brands"
              required
              autoFocus
            />
          )}
        </FormField>

        <FormField
          label="Slug"
          required
          hint="lowercase letters, digits, and hyphens; used in URLs and lookups"
        >
          {(p) => (
            <Input
              {...p}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              pattern="[a-z0-9-]{1,64}"
              placeholder="acme-brands"
              required
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
