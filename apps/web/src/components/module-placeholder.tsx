'use client';

import Link from 'next/link';
import { Building2, Layers } from 'lucide-react';
import { Button, Card, CardContent, PageHeader } from '@xb/ui';
import { useActiveWorkspace, useSession } from '@/lib/session';

interface Props {
  readonly title: string;
  readonly description: string;
}

/**
 * Shared shell for modules whose data/engine layer hasn't been built yet.
 * Renders the page-level header, surfaces the active workspace context
 * when set, and falls back to a friendly "pick a workspace" nudge when
 * not, same UX as the data-backed module pages so the experience is
 * consistent across modules in any state of build-out.
 */
export function ModulePlaceholder({ title, description }: Props) {
  const { data: user } = useSession();
  const { data: activeWorkspace } = useActiveWorkspace();

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <PageHeader
        title={title}
        description={
          activeWorkspace ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              <span>{activeWorkspace.organizationName}</span>
              <span aria-hidden="true">·</span>
              <Layers className="h-3.5 w-3.5" />
              <span>{activeWorkspace.workspaceName}</span>
            </span>
          ) : (
            description
          )
        }
      />
      {!activeWorkspace ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {user?.isInternalManager
                ? `Pick a workspace from the topbar switcher to scope ${title.toLowerCase()}.`
                : `Pick a workspace to begin.`}
            </p>
            <Link href="/select-workspace">
              <Button size="sm" variant="outline">
                Browse workspaces
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center gap-2 pt-6 text-center">
            <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-orange-700">
              Foundation
            </span>
            <p className="text-sm text-muted-foreground">{description}</p>
            <p className="text-xs text-muted-foreground">
              Module shell only, data layer lands in a later phase.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
