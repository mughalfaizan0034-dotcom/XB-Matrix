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
import { describeError } from '@/lib/session';
import { useCan } from '@/lib/use-can';
import { ApiError } from '@/lib/api-client';

/**
 * Direct add-user dialog, the PRIMARY user-creation path while email
 * lifecycle is paused (see memory/feedback_auth_direction).
 *
 * Two scopes, two permission domains:
 *   - 'organization' → customer/tenant users (organization_admin /
 *     organization_user) inside one org. Used from the org settings card.
 *   - 'internal'     → XB Matrix platform staff (internal_manager /
 *     internal_staff), no org. Used from the Internal Users section.
 *
 * super_admin is never offered, it is provisioned only via DB migration.
 */
type AddUserScope = 'organization' | 'internal';

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Defaults to 'organization'. */
  readonly scope?: AddUserScope;
  /** Required for the 'organization' scope; null/omitted for 'internal'. */
  readonly organization?: Organization | null;
}

const ROLE_LABEL: Record<CreateUserRole, string> = {
  super_admin:        'Super admin',
  internal_manager:   'Internal · Manager',
  internal_staff:     'Internal · Staff',
  organization_admin: 'Admin',
  organization_user:  'User',
};

export function AddUserDialog({ open, onClose, scope = 'organization', organization = null }: Props) {
  const toast = useToast();
  const create = useCreateUser();
  const isInternal = scope === 'internal';
  const defaultRole: CreateUserRole = isInternal ? 'internal_staff' : 'organization_user';

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState(suggestPassword());
  const [role, setRole] = useState<CreateUserRole>(defaultRole);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<ReadonlyArray<string>>([]);
  const [created, setCreated] = useState<UserSummary | null>(null);

  // Tiered create permissions mirror the backend canCreateUserWithRole
  // guard (apps/api/src/lib/permissions.ts). Capability checks only —
  // inline `effectiveRole ===` would drift from the canonical rule.
  //
  // super_admin role is intentionally not offered: provisioned only via
  // DB migration.
  const canCreateManagers = useCan('create-internal-manager');
  const canCreateInternal = useCan('create-internal-staff');

  useEffect(() => {
    if (open) {
      setUsername('');
      setDisplayName('');
      setPassword(suggestPassword());
      setRole(defaultRole);
      setSubmitError(null);
      setUsernameSuggestions([]);
      setCreated(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope]);

  function close() {
    if (create.isPending) return;
    onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setUsernameSuggestions([]);
    const submitted = username.trim().toLowerCase();
    try {
      const user = await create.mutateAsync({
        username: submitted,
        displayName: displayName.trim(),
        password,
        role,
        // Internal staff have no organization; org users land in the org.
        organizationId: isInternal ? null : organization?.id ?? null,
      });
      setCreated(user);
      toast.push('success', `Created ${user.username}.`);
    } catch (err) {
      setSubmitError(describeError(err));
      if (isUsernameConflict(err)) {
        setUsernameSuggestions(suggestUsernameVariants(submitted));
      }
    }
  }

  const canSubmit =
    !create.isPending &&
    /^[a-z0-9._-]{3,120}$/.test(username.trim().toLowerCase()) &&
    displayName.trim().length > 0 &&
    password.length >= 12 &&
    (isInternal || !!organization);

  const title = created
    ? 'User created'
    : isInternal
      ? 'Add internal user'
      : 'Add user';
  const description = created
    ? 'Share the credentials with the user. They can sign in immediately at /sign-in.'
    : isInternal
      ? 'Create an XB Matrix platform staff account. Internal users operate cross-organization and have no tenant.'
      : `Create a user that signs in with a username and password. Lands in ${organization?.displayName ?? 'this organization'}.`;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      description={description}
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
            hint="Minimum 12 characters. Share with the user, they can change it after sign-in."
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
                {isInternal ? (
                  <>
                    {/* Internal scope, platform staff only. */}
                    {canCreateInternal ? (
                      <option value="internal_staff">Internal · Staff</option>
                    ) : null}
                    {canCreateManagers ? (
                      <option value="internal_manager">Internal · Manager</option>
                    ) : null}
                  </>
                ) : (
                  <>
                    {/* Organization scope, customer/tenant users only. */}
                    <option value="organization_user">User</option>
                    <option value="organization_admin">Admin</option>
                  </>
                )}
                {/* Super admin is intentionally NOT offered, provisioned only via DB migration */}
              </Select>
            )}
          </FormField>

          {submitError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {submitError}
              {usernameSuggestions.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-red-900">
                  <span className="font-medium">Try:</span>
                  {usernameSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setUsername(s);
                        setSubmitError(null);
                        setUsernameSuggestions([]);
                      }}
                      className="rounded-md border border-red-200 bg-white px-2 py-0.5 font-mono text-xs text-red-900 hover:bg-red-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : null}
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

/**
 * Generate up to 5 username variants based on the conflicting input.
 * Strategy: strip a trailing numeric suffix to find the "stem" so e.g.
 * "billu1" → stem "billu" → variants billu.1, billu_1, billu2, billu3,
 * billu.2. Empty/garbage inputs return [].
 */
function suggestUsernameVariants(base: string): string[] {
  const clean = base.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (clean.length < 1) return [];
  const stem = clean.replace(/\d+$/, '') || clean;
  const candidates = [
    `${stem}.1`,
    `${stem}_1`,
    `${stem}1`,
    `${stem}2`,
    `${stem}.2`,
  ];
  const seen = new Set<string>([clean]);
  return candidates.filter((s) => {
    if (seen.has(s)) return false;
    seen.add(s);
    return /^[a-z0-9._-]{3,120}$/.test(s);
  });
}

/** Detect the "username already taken" 409 from the create-user endpoint. */
function isUsernameConflict(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status !== 409) return false;
  return (
    err.code === 'username_exists' ||
    err.code === 'username_taken' ||
    err.code === 'duplicate_username' ||
    /username/i.test(err.message)
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
