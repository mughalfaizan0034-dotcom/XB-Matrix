import type {
  ActorContext,
  PermissionDecision,
  PermissionScope,
} from '@xb/types';
import { ForbiddenError, MissingContextError } from './errors.js';
import type { RuleProvider } from './providers/types.js';

export interface ResolverOptions {
  readonly providers: ReadonlyArray<RuleProvider>;
  readonly onDecision?: (
    actor: ActorContext,
    scope: PermissionScope,
    decision: PermissionDecision,
  ) => void | Promise<void>;
}

/**
 * Centralized authorization resolver.
 *
 * Walks rule providers in order. First provider that "applies" produces the
 * decision. If no provider applies, the resolver returns a deny-by-default
 * decision tagged `deny_default`.
 *
 * Decisions are emitted via `onDecision` for audit + telemetry.
 */
export class Resolver {
  constructor(private readonly opts: ResolverOptions) {}

  async resolve(
    actor: ActorContext,
    scope: PermissionScope,
  ): Promise<PermissionDecision> {
    this.assertContext(actor, scope);

    let decision: PermissionDecision = {
      allowed: false,
      source: 'deny_default',
      reason: 'no rule provider produced a decision; deny-by-default',
    };

    for (const provider of this.opts.providers) {
      const result = await provider.evaluate(actor, scope);
      if (result.applies && result.decision) {
        decision = result.decision;
        break;
      }
    }

    if (this.opts.onDecision) {
      await this.opts.onDecision(actor, scope, decision);
    }
    return decision;
  }

  async assert(actor: ActorContext, scope: PermissionScope): Promise<void> {
    const decision = await this.resolve(actor, scope);
    if (!decision.allowed) {
      throw new ForbiddenError(
        `denied: ${scope.action} on ${scope.module}`,
        decision.reason,
      );
    }
  }

  private assertContext(actor: ActorContext, scope: PermissionScope): void {
    if (!actor.organizationId && actor.actorKind !== 'system' && !actor.isInternalManager) {
      throw new MissingContextError(
        'actor has no organization context and is not internal_manager/system',
      );
    }
    if (actor.organizationId && scope.organizationId !== actor.organizationId && !actor.isInternalManager) {
      throw new ForbiddenError(
        'scope.organizationId does not match actor.organizationId',
        'org_mismatch',
      );
    }
  }
}
