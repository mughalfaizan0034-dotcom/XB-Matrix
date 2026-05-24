'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  FlaskConical,
  Lock,
  RefreshCcw,
  User as UserIcon,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  PageHeader,
  Select,
  useToast,
} from '@xb/ui';
import { useSession, describeError } from '@/lib/session';
import { useOrganizations } from '@/lib/api-orgs';
import {
  useBootstrapUser,
  useDebugContext,
  type BootstrapRole,
  type BootstrappedUser,
  type ResolverProbe,
} from '@/lib/api-bootstrap';

const ROLE_LABEL: Record<BootstrapRole, string> = {
  internal_manager:   'Internal · Manager',
  internal_staff:     'Internal · Staff',
  organization_admin: 'Org · Admin',
  organization_user:  'Org · User',
};

/**
 * Temporary bootstrap / testing page, internal-manager only.
 *
 * Lets a manager:
 *   - Manually create a fully-active user (skips invitation +
 *     email-verification round-trip) so multi-user testing isn't
 *     bottlenecked while those lifecycles are still under
 *     construction.
 *   - Inspect the resolver's current view (actor context, orgs,
 *     workspaces, decision grid) to diagnose access issues.
 *
 * Not production UX. When the full invitation / verification /
 * permissions matrix lifecycle ships, this page either gets removed
 * or stays as a super-admin operational tool.
 */
export default function BootstrapPage() {
  const { data: user } = useSession();
  const isManager = user?.isInternalManager ?? false;

  if (!user) {
    return (
      <div className="flex flex-col gap-6 p-6 lg:p-8">
        <PageHeader title="Bootstrap tools" description="Loading session…" />
      </div>
    );
  }

  if (!isManager) {
    return (
      <div className="flex flex-col gap-6 p-6 lg:p-8">
        <PageHeader
          title="Bootstrap tools"
          description="Internal-manager only."
        />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            This page is restricted to internal managers. Ask your platform
            administrator if you need access to testing tooling.
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ManagerBootstrap />;
}

function ManagerBootstrap() {
  return (
    <div className="flex flex-col gap-5 p-6 lg:p-8">
      <PageHeader
        title="Bootstrap tools"
        description={
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <FlaskConical className="h-3.5 w-3.5" />
            <span>Temporary bootstrap / testing flow · internal-manager only</span>
          </span>
        }
        actions={
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Settings
          </Link>
        }
      />

      <Card>
        <CardContent className="flex items-start gap-3 pt-5">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning-600" />
          <div className="text-sm text-muted-foreground">
            These tools exist to accelerate multi-user testing while the full invitation +
            email-verification + permissions-matrix lifecycle is still under construction.
            They bypass the production user-creation path and write directly to{' '}
            <code className="font-mono text-foreground">xb_core.users</code> with{' '}
            <code className="font-mono text-foreground">user_status='active'</code>.
            Don&apos;t use them for real organization users, go through Invitations instead.
          </div>
        </CardContent>
      </Card>

      <CreateTestUserCard />
      <DebugVisibilityCard />
    </div>
  );
}

// =====================================================================
// Create test user
// =====================================================================

function CreateTestUserCard() {
  const orgs = useOrganizations({ pageSize: 200 });
  const create = useBootstrapUser();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState(suggestPassword());
  const [role, setRole] = useState<BootstrapRole>('organization_user');
  const [organizationId, setOrganizationId] = useState('');
  const [markEmailVerified, setMarkEmailVerified] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<BootstrappedUser | null>(null);

  const needsOrg = role === 'organization_admin' || role === 'organization_user';
  const orgOptions = orgs.data?.items ?? [];

  const canSubmit =
    !create.isPending &&
    email.trim().length > 0 &&
    displayName.trim().length > 0 &&
    password.length >= 12 &&
    (!needsOrg || organizationId.length === 26);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    try {
      const result = await create.mutateAsync({
        email: email.trim(),
        displayName: displayName.trim(),
        password,
        role,
        organizationId: needsOrg ? organizationId : null,
        markEmailVerified,
      });
      setCreated(result);
      toast.push('success', `Created ${result.email}.`);
      // Reset for next user (keep role + org for batch creation).
      setEmail('');
      setDisplayName('');
      setPassword(suggestPassword());
    } catch (err) {
      setSubmitError(describeError(err));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <UserIcon className="h-4 w-4 text-muted-foreground" />
        <CardTitle>Create test user</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-2">
        <p className="text-xs text-muted-foreground">
          Inserts an <code className="font-mono">active</code> user with a known password.
          Skips the invitation token + accept-invite flow entirely. Pick the role and (for
          org roles) the organization. <span className="font-medium text-foreground">Bypass email verification</span>{' '}
          ticks <code className="font-mono">email_verified_at = now()</code> so the user
          can sign in without the verification step.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Email" required>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="test+admin@example.com"
                  required
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
                  placeholder="Test Admin"
                  required
                  maxLength={200}
                  autoComplete="off"
                />
              )}
            </FormField>
          </div>

          <FormField
            label="Password"
            required
            hint={
              password.length < 12
                ? 'Minimum 12 characters.'
                : 'Share this with the test user, they sign in directly, no invitation email.'
            }
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Role" required>
              {(p) => (
                <Select
                  {...p}
                  value={role}
                  onChange={(e) => setRole(e.target.value as BootstrapRole)}
                >
                  {(Object.keys(ROLE_LABEL) as BootstrapRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField
              label="Organization"
              required={needsOrg}
              hint={needsOrg ? 'Required for org roles.' : 'Ignored for internal roles.'}
            >
              {(p) => (
                <Select
                  {...p}
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  disabled={!needsOrg}
                  required={needsOrg}
                >
                  <option value="">{needsOrg ? 'Pick an organization…' : '- not applicable -'}</option>
                  {orgOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.displayName}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={markEmailVerified}
              onChange={(e) => setMarkEmailVerified(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Bypass email verification (recommended for testing)
          </label>

          {submitError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {submitError}
            </div>
          ) : null}

          <div className="flex items-center justify-end">
            <Button type="submit" disabled={!canSubmit}>
              {create.isPending ? 'Creating…' : 'Create user'}
            </Button>
          </div>
        </form>

        {created ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
            <div className="font-medium">User created</div>
            <div className="mt-1 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
              <div>
                <span className="text-emerald-700">email:</span> <code className="font-mono">{created.email}</code>
              </div>
              <div>
                <span className="text-emerald-700">role:</span>{' '}
                <Badge tone="success">{ROLE_LABEL[created.role]}</Badge>
              </div>
              {created.organizationName ? (
                <div>
                  <span className="text-emerald-700">organization:</span> {created.organizationName}
                </div>
              ) : null}
              <div>
                <span className="text-emerald-700">email_verified:</span>{' '}
                {created.emailVerified ? 'yes' : 'no'}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// Debug visibility
// =====================================================================

function DebugVisibilityCard() {
  const [enabled, setEnabled] = useState(false);
  const ctx = useDebugContext(enabled);

  const probesByWorkspace = useMemo(() => {
    const m = new Map<string, ResolverProbe[]>();
    if (!ctx.data) return m;
    for (const p of ctx.data.resolverProbes) {
      const key = p.workspaceId ?? 'platform';
      const arr = m.get(key);
      if (arr) arr.push(p);
      else m.set(key, [p]);
    }
    return m;
  }, [ctx.data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Debug visibility</CardTitle>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEnabled(true);
            void ctx.refetch();
          }}
        >
          <RefreshCcw className="mr-1 h-3.5 w-3.5" />
          {enabled ? 'Reload snapshot' : 'Load snapshot'}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-2">
        <p className="text-xs text-muted-foreground">
          Point-in-time snapshot of the resolver&apos;s view for your current session.
          Helpful when verifying a test user&apos;s access: sign in as them in another
          browser/profile and open this page to see exactly what the resolver returns.
        </p>

        {!enabled ? (
          <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
            Snapshot not loaded.
          </div>
        ) : ctx.isLoading ? (
          <div className="rounded-md border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : ctx.error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {describeError(ctx.error)}
          </div>
        ) : ctx.data ? (
          <div className="flex flex-col gap-4">
            {/* Actor identity */}
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Active actor
              </div>
              <dl className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
                <Row k="actor_id" v={ctx.data.actor.actorId} mono />
                <Row k="actor_kind" v={ctx.data.actor.actorKind} />
                <Row k="effective_role" v={ctx.data.actor.effectiveRole} badge />
                <Row k="organization_id" v={ctx.data.actor.organizationId ?? '-'} mono />
                <Row k="is_internal_manager" v={String(ctx.data.actor.isInternalManager)} />
                <Row k="session_id" v={ctx.data.actor.sessionId ?? '-'} mono />
              </dl>
            </div>

            {/* Accessible organizations */}
            <div className="rounded-md border border-border bg-card">
              <div className="border-b border-border bg-muted/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Accessible organizations ({ctx.data.organizations.length})
              </div>
              {ctx.data.organizations.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">None.</div>
              ) : (
                <ul className="max-h-40 divide-y divide-border overflow-auto">
                  {ctx.data.organizations.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                      <span className="font-medium text-foreground">{o.displayName}</span>
                      <span className="flex items-center gap-2">
                        <Badge tone={o.organizationStatus === 'active' ? 'success' : 'neutral'}>
                          {o.organizationStatus}
                        </Badge>
                        <code className="font-mono text-[10px] text-muted-foreground">{o.id}</code>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Accessible workspaces + resolver probe grid */}
            <div className="rounded-md border border-border bg-card">
              <div className="border-b border-border bg-muted/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Accessible workspaces ({ctx.data.workspaces.length}) · resolver probed for first 10
              </div>
              {ctx.data.workspaces.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">None.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {ctx.data.workspaces.slice(0, 10).map((ws) => {
                    const probes = probesByWorkspace.get(ws.id) ?? [];
                    return (
                      <li key={ws.id} className="px-3 py-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-foreground">
                            {ws.organizationName} · {ws.workspaceName}
                          </span>
                          <code className="font-mono text-[10px] text-muted-foreground">{ws.id}</code>
                        </div>
                        {probes.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {probes.map((p, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px]"
                                title={p.reason ?? p.source}
                              >
                                {p.allowed ? (
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <XCircle className="h-3 w-3 text-red-600" />
                                )}
                                <code className="font-mono text-foreground">{p.module}:{p.action}</code>
                                <span className="text-muted-foreground">({p.source})</span>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Row({ k, v, mono, badge }: { k: string; v: string; mono?: boolean; badge?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground">{k}:</span>
      {badge ? (
        <Badge tone="neutral">{v}</Badge>
      ) : (
        <span className={mono ? 'font-mono text-[11px] text-foreground' : 'text-foreground'}>{v}</span>
      )}
    </div>
  );
}

/**
 * Pseudo-random 16-char password for test users. Crypto-random so we
 * don't accidentally rely on a predictable Math.random. Mix in symbols
 * to satisfy reasonable strength heuristics.
 */
function suggestPassword(): string {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!#$%&*+-=?';
  const out: string[] = [];
  const target = 16;
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
