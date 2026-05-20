'use client';

import { useEffect, useState } from 'react';
import { Copy, RefreshCcw } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  FormField,
  Input,
  Select,
  useToast,
} from '@xb/ui';
import { useCreateUser, type CreateUserRole, type UserSummary } from '@/lib/api-users';
import type { Organization } from '@/lib/api-orgs';
import { describeError, useSession } from '@/lib/session';

/**
 * Direct add-user dialog — the PRIMARY user-creation path while email
 * lifecycle is paused (see memory/feedback_auth_direction). Admins
 * pick username + display name + password + role; user is `active`
 * immediately and can sign in.
 *
 * Replaces InviteUserDialog. Invitation flow returns when resend.com
 * is wired up.
 */
interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly organization: Organization;
}

const ROLE_LABEL: Record<CreateUserRole, string> = {
  internal_manager:   'Internal · Manager',
  internal_staff:     'Internal · Staff',
  organization_admin: 'Org · Admin',
  organization_user:  'Org · User',
};

export function AddUserDialog({ open, onClose, organization }: Props) {
  const { data: session } = useSession();
  const toast = useToast();
  const create = useCreateUser();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState(suggestPassword());
  const [role, setRole] = useState<CreateUserRole>('organization_user');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<UserSummary | null>(null);

  const isManager = session?.isInternalManager ?? false;

  useEffect(() => {
    if (open) {
      setUsername('');
      setDisplayName('');
      setPassword(suggestPassword());
      setRole('organization_user');
      setSubmitError(null);
      setCreated(null);
    }
  }, [open]);

  function close() {
    if (create.isPending) return;
    onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    try {
      const isInternal = role === 'internal_manager' || role === 'internal_staff';
      const user = await create.mutateAsync({
        username: username.trim().toLowerCase(),
        displayName: displayName.trim(),
        password,
        role,
        organizationId: isInternal ? null : organization.id,
      });
      setCreated(user);
      toast.push('success', `Created ${user.username}.`);
    } catch (err) {
      setSubmitError(describeError(err));
    }
  }

  const canSubmit =
    !create.isPending &&
    /^[a-z0-9._-]{3,120}$/.test(username.trim().toLowerCase()) &&
    displayName.trim().length > 0 &&
    password.length >= 12;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={created ? 'User created' : 'Add user'}
      description={
        created
          ? 'Share the credentials with the user. They can sign in immediately at /sign-in.'
          : `Create a user that signs in with a username and password. Lands in ${organization.displayName}.`
      }
      footer={
        created ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="outline" type="button" onClick={close} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" form="add-user-form" disabled={!canSubmit}>
              {create.isPending ? 'Creating…' : 'Create user'}
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="flex flex-col gap-3 text-sm">
          <CredentialRow label="Username" value={created.username} />
          <CredentialRow label="Password" value={password} mono />
          <div className="flex items-center gap-2">
            <Badge tone="success">{ROLE_LABEL[role]}</Badge>
            <Badge tone="neutral">active</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Password is not retrievable later. Copy it now and share it with the user securely
            (email, password manager, secure chat). Use the admin reset password action on the
            user row if it's lost.
          </p>
        </div>
      ) : (
        <form id="add-user-form" onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField
            label="Username"
            required
            hint="Lowercase letters, digits, dot, underscore, dash · 3-120 characters · must be unique"
          >
            {(p) => (
              <Input
                {...p}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="jane.doe"
                required
                autoCapitalize="none"
                spellCheck={false}
                minLength={3}
                maxLength={120}
                pattern="[a-zA-Z0-9._\-]{3,120}"
              />
            )}
          </FormField>

          <FormField label="Display name" required>
            {(p) => (
              <Input
                {...p}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Doe"
                required
                maxLength={200}
              />
            )}
          </FormField>

          <FormField
            label="Initial password"
            required
            hint="Minimum 12 characters. Share with the user — they can change it after sign-in."
          >
            {(p) => (
              <div className="flex items-center gap-2">
                <Input
                  {...p}
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={12}
                  maxLength={200}
                  required
                  autoComplete="off"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPassword(suggestPassword())}
                  title="Regenerate"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(password);
                    toast.push('success', 'Password copied.');
                  }}
                  title="Copy"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </FormField>

          <FormField label="Role" required>
            {(p) => (
              <Select {...p} value={role} onChange={(e) => setRole(e.target.value as CreateUserRole)}>
                <option value="organization_user">Org · User</option>
                <option value="organization_admin">Org · Admin</option>
                {isManager ? (
                  <>
                    <option value="internal_staff">Internal · Staff</option>
                    <option value="internal_manager">Internal · Manager</option>
                  </>
                ) : null}
              </Select>
            )}
          </FormField>

          {submitError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {submitError}
            </div>
          ) : null}
        </form>
      )}
    </Dialog>
  );
}

function CredentialRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const toast = useToast();
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={mono ? 'font-mono text-xs text-foreground' : 'text-sm text-foreground'}>
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          toast.push('success', `${label} copied.`);
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function suggestPassword(): string {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!#$%&*+-=?';
  const target = 16;
  const out: string[] = [];
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(target);
    crypto.getRandomValues(buf);
    for (let i = 0; i < target; i++) out.push(chars[buf[i]! % chars.length]!);
  } else {
    for (let i = 0; i < target; i++) {
      out.push(chars[Math.floor(Math.random() * chars.length)]!);
    }
  }
  return out.join('');
}
