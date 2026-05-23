'use client';

import { Badge, Card, CardContent, PageHeader } from '@xb/ui';
import { Inbox, MessageSquare, ShieldCheck, Tag } from 'lucide-react';

/**
 * Support workspace shell, Coming Soon.
 *
 * The full ticketing module (canonical xb_core.support_tickets +
 * service + frontend with threading, CC, notifications) is queued as
 * a separate major workstream. This page exists today so the topbar
 * "Manage Support Tickets" action has a live destination. The shell
 * renders a preview of the future operational surface.
 */
export default function SupportPage() {
  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <PageHeader
        title="Support Tickets"
        actions={<Badge tone="warning">Coming soon</Badge>}
      />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">
            A native operational support workspace, integrated into xB Matrix.
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Tickets, replies, status, and CC will live here rather than in
            email or an external helpdesk. The workspace stays scoped to
            your organization with audit, internal notes, and RBAC enforced
            backend-side.
          </p>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          When unlocked, this module will support
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <PreviewTile
            icon={Inbox}
            title="Tabbed ticket queues"
            body="New, Open, Working, Waiting, Resolved, Closed, plus a global search. Sticky-header tables and column customization."
          />
          <PreviewTile
            icon={MessageSquare}
            title="Threaded conversations"
            body="Original issue, staff replies, your replies, status updates, future attachments, and an audit timeline."
          />
          <PreviewTile
            icon={Tag}
            title="Priority + CC"
            body="Low, Medium, High, Urgent priorities. Multi-select CC across your organization so the right people stay in the loop."
          />
          <PreviewTile
            icon={ShieldCheck}
            title="Internal notes"
            body="Internal staff can collaborate behind the scenes. Internal-only notes never appear in customer-visible threads."
          />
          <PreviewTile
            icon={Inbox}
            title="Notification center"
            body="Topbar bell with unread counters, grouped events, and one-click navigation to the affected ticket."
          />
          <PreviewTile
            icon={Tag}
            title="Search, tags, SLA"
            body="Future enhancements: ticket search with semantic indexing, tagging, SLA timers, and ticket analytics."
          />
        </div>
      </section>
    </div>
  );
}

function PreviewTile({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-navy/10 text-navy">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
