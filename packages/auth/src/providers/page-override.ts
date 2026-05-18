import type { ActorContext, PermissionScope } from '@xb/types';
import type { RuleEvaluation, RuleProvider } from './types.js';

export interface PageOverrideLookup {
  getOverride(
    actor: ActorContext,
    scope: PermissionScope,
  ): Promise<{ allowed: boolean; reason: string } | null>;
}

export class PageOverrideProvider implements RuleProvider {
  readonly name = 'page_override';

  constructor(private readonly lookup: PageOverrideLookup) {}

  async evaluate(actor: ActorContext, scope: PermissionScope): Promise<RuleEvaluation> {
    const override = await this.lookup.getOverride(actor, scope);
    if (!override) return { applies: false };
    return {
      applies: true,
      decision: {
        allowed: override.allowed,
        source: 'page_override',
        reason: override.reason,
      },
    };
  }
}
