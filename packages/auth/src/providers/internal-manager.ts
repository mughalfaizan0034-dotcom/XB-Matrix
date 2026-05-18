import type { ActorContext, PermissionScope } from '@xb/types';
import type { RuleEvaluation, RuleProvider } from './types.js';

export class InternalManagerProvider implements RuleProvider {
  readonly name = 'internal_manager_bypass';

  async evaluate(actor: ActorContext, _scope: PermissionScope): Promise<RuleEvaluation> {
    if (actor.isInternalManager) {
      return {
        applies: true,
        decision: {
          allowed: true,
          source: 'internal_manager_bypass',
          reason: 'actor is internal_manager — bypass for support operations (audited)',
        },
      };
    }
    return { applies: false };
  }
}
