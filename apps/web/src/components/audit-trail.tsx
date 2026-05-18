'use client';

import { Badge, Drawer } from '@xb/ui';
import { useOrganizationAudit, useWorkspaceAudit, type AuditEntry } from '@/lib/api-audit';

interface BaseProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly entityLabel: string;
}

interface OrgProps extends BaseProps {
  readonly entityKind: 'organization';
  readonly entityId: string | null;
}

interface WsProps extends BaseProps {
  readonly entityKind: 'workspace';
  readonly entityId: string | null;
}

export function AuditTrail(props: OrgProps | WsProps) {
  const orgQ = useOrganizationAudit(
    props.entityKind === 'organization' ? props.entityId : null,
    { enabled: props.open && props.entityKind === 'organization' },
  );
  const wsQ = useWorkspaceAudit(
    props.entityKind === 'workspace' ? props.entityId : null,
    { enabled: props.open && props.entityKind === 'workspace' },
  );
  const q = props.entityKind === 'organization' ? orgQ : wsQ;

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      title="Audit history"
      description={`Last 50 events for ${props.entityLabel}.`}
    >
      {q.isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : q.error ? (
        <div className="py-10 text-center text-sm text-destructive">
          Failed to load audit history.
        </div>
      ) : !q.data || q.data.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">No events yet.</div>
      ) : (
        <ol className="flex flex-col gap-3">
          {q.data.map((e) => (
            <AuditRow key={e.id} entry={e} />
          ))}
        </ol>
      )}
    </Drawer>
  );
}

function operationTone(op: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (op === 'record.created') return 'success';
  if (op === 'record.restored') return 'success';
  if (op === 'record.soft_deleted') return 'warning';
  if (op === 'record.hard_deleted') return 'danger';
  if (op === 'record.updated') return 'info';
  return 'neutral';
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const when = new Date(entry.occurredAt);
  return (
    <li className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <Badge tone={operationTone(entry.operation)}>{entry.operation.replace('record.', '')}</Badge>
        <time
          dateTime={entry.occurredAt}
          className="font-sans text-xs text-muted-foreground"
          data-numeric="true"
        >
          {when.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">
        {entry.actorKind} <span className="text-foreground/70">·</span>{' '}
        <span className="font-mono">{entry.actorId?.slice(-12) ?? 'system'}</span>
      </div>
    </li>
  );
}
