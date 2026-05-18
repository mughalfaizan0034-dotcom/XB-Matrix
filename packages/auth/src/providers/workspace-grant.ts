import type { ActorContext, PermissionScope } from '@xb/types';
import type { RuleEvaluation, RuleProvider } from './types.js';

export interface WorkspaceGrantLookup {
  hasGrant(
    actor: ActorContext,
    scope: PermissionScope,
  ): Promise<{ allowed: boolean; reason: string } | null>;
}

export class WorkspaceGrantProvider implements RuleProvider {
  readonly name = 'workspace_grant';

  constructor(private readonly lookup: WorkspaceGrantLookup) {}

  async evaluate(actor: ActorContext, scope: PermissionScope): Promise<RuleEvaluation> {
    if (!scope.workspaceId) return { applies: false };
    const grant = await this.lookup.hasGrant(actor, scope);
    if (!grant) return { applies: false };
    return {
      applies: true,
      decision: {
        allowed: grant.allowed,
        source: 'workspace_grant',
        reason: grant.reason,
      },
    };
  }
}
