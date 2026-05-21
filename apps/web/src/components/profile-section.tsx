'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@xb/ui';
import { Button, FormField, Input, useToast } from '@xb/ui';
import { describeError, useSession } from '@/lib/session';
import { useChangePassword, useUpdateProfile } from '@/lib/api-users';

/**
 * Self-service account section — display name + password change. The
 * only Settings surface a user with no organization or no workspace
 * access can still use. Username is intentionally not editable
 * (immutable identity; admins can recreate the user under a new
 * username if a change is needed).
 */
export function ProfileSection() {
  const { data: user } = useSession();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-lg font-semibold text-foreground">Your account</h2>
        <p className="text-sm text-muted-foreground">
          Update your display name and password. Username is fixed —
          contact an administrator if it needs to change.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ReadOnlyRow label="Username" value={user ? `@${user.username}` : '—'} mono />
          {user?.email ? <ReadOnlyRow label="Email" value={user.email} /> : null}
          <DisplayNameForm initial={user?.displayName ?? ''} disabled={!user} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm disabled={!user} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------

function DisplayNameForm({ initial, disabled }: { initial: string; disabled: boolean }) {
  const toast = useToast();
  const update = useUpdateProfile();
  const [name, setName] = useState(initial);

  // Sync local state when /me hydrates after mount.
  useEffect(() => {
    setName(initial);
  }, [initial]);

  const trimmed = name.trim();
  const dirty = trimmed !== initial.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 200;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || !valid) return;
    try {
      await update.mutateAsync(trimmed);
      toast.push('success', 'Display name updated.');
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <FormField label="Display name" required hint="Shown across the app — 1–200 characters.">
        {(p) => (
          <Input
            {...p}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
            disabled={disabled}
          />
        )}
      </FormField>
      <div>
        <Button
          type="submit"
          size="sm"
          disabled={disabled || !dirty || !valid || update.isPending}
        >
          {update.isPending ? 'Saving…' : 'Save display name'}
        </Button>
      </div>
    </form>
  );
}

function ChangePasswordForm({ disabled }: { disabled: boolean }) {
  const toast = useToast();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmNext, setConfirmNext] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCurrent('');
    setNext('');
    setConfirmNext('');
    setError(null);
  }

  const nextOk = next.length >= 12 && next.length <= 200;
  const matches = next === confirmNext;
  const canSubmit = !disabled && current.length > 0 && nextOk && matches && !change.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!matches) {
      setError('New passwords do not match.');
      return;
    }
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next });
      toast.push('success', 'Password updated.');
      reset();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <FormField label="Current password" required>
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            disabled={disabled}
          />
        )}
      </FormField>
      <FormField label="New password" required hint="Minimum 12 characters.">
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={12}
            maxLength={200}
            required
            disabled={disabled}
          />
        )}
      </FormField>
      <FormField
        label="Confirm new password"
        required
        error={confirmNext.length > 0 && !matches ? 'Does not match the new password.' : undefined}
      >
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="new-password"
            value={confirmNext}
            onChange={(e) => setConfirmNext(e.target.value)}
            required
            disabled={disabled}
          />
        )}
      </FormField>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {change.isPending ? 'Updating…' : 'Change password'}
        </Button>
      </div>
    </form>
  );
}

function ReadOnlyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-3 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-sm text-foreground' : 'text-sm text-foreground'}>
        {value}
      </span>
    </div>
  );
}
