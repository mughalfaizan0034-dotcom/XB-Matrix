'use client';

import { useEffect, useState } from 'react';
import { Button, Dialog, FormField, Input, Select, useToast } from '@xb/ui';
import { useInviteUser, type InviteRole } from '@/lib/api-users';
import type { Organization } from '@/lib/api-orgs';
import { ApiError } from '@/lib/api-client';
import { describeError, useSession } from '@/lib/session';

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly organization: Organization;
}

export function InviteUserDialog({ open, onClose, organization }: Props) {
  const { data: session } = useSession();
  const toast = useToast();
  const invite = useInviteUser();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<InviteRole>('organization_user');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);

  const isManager = session?.isInternalManager ?? false;

  useEffect(() => {
    if (open) {
      setEmail('');
      setDisplayName('');
      setRole('organization_user');
      setSubmitError(null);
      setAcceptUrl(null);
    }
  }, [open]);

  function close() {
    if (invite.isPending) return;
    onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    try {
      const result = await invite.mutateAsync({
        email,
        displayName,
        role,
        organizationId: organization.id,
      });
      toast.push('success', `Invitation sent to ${result.email}.`);
      setAcceptUrl(result.acceptUrl);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.status === 422)) {
        setSubmitError(err.message);
        return;
      }
      toast.push('error', describeError(err));
    }
  }

  const canSubmit =
    !invite.isPending && email.trim().length > 0 && displayName.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Invite a user to ${organization.displayName}`}
      description="They'll receive an email with a one-time link to set their password and activate the account."
      footer={
        acceptUrl ? (
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="outline" type="button" onClick={close} disabled={invite.isPending}>
              Cancel
            </Button>
            <Button type="submit" form="invite-form" disabled={!canSubmit}>
              {invite.isPending ? 'Sending…' : 'Send invitation'}
            </Button>
          </>
        )
      }
    >
      {acceptUrl ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            Invitation created. The email is on its way.
          </div>
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Accept link (share manually if email is delayed)
            </div>
            <code className="block break-all font-mono text-xs text-foreground">{acceptUrl}</code>
          </div>
        </div>
      ) : (
        <form id="invite-form" onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField label="Email" required error={submitError}>
            {(p) => (
              <Input
                {...p}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (submitError) setSubmitError(null);
                }}
                placeholder="teammate@company.com"
                required
                autoFocus
                maxLength={254}
                autoComplete="off"
              />
            )}
          </FormField>

          <FormField label="Display name" required>
            {(p) => (
              <Input
                {...p}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Sara Khan"
                required
                maxLength={200}
                autoComplete="off"
              />
            )}
          </FormField>

          <FormField
            label="Role"
            required
            hint={
              role === 'organization_admin'
                ? 'Can invite users and manage workspaces in this organization.'
                : role === 'organization_user'
                  ? 'Can view and edit operational modules.'
                  : 'Platform-wide. Internal manager bypass + full settings access.'
            }
          >
            {(p) => (
              <Select {...p} value={role} onChange={(e) => setRole(e.target.value as InviteRole)} required>
                <option value="organization_user">Organization user</option>
                <option value="organization_admin">Organization admin</option>
                {isManager ? (
                  <>
                    <option value="internal_staff">Internal staff (read-only platform-wide)</option>
                    <option value="internal_manager">Internal manager (full bypass)</option>
                  </>
                ) : null}
              </Select>
            )}
          </FormField>
        </form>
      )}
    </Dialog>
  );
}
