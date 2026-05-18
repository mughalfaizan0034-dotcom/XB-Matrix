import type {
  ActorContext,
  PermissionDecision,
  PermissionScope,
} from '@xb/types';

export interface RuleEvaluation {
  readonly applies: boolean;
  readonly decision?: PermissionDecision;
}

export interface RuleProvider {
  readonly name: string;
  evaluate(actor: ActorContext, scope: PermissionScope): Promise<RuleEvaluation>;
}
