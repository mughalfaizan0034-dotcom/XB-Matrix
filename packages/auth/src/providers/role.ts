import type {
  ActorContext,
  ActorKind,
  ModuleKey,
  PermissionAction,
  PermissionScope,
} from '@xb/types';
import type { RuleEvaluation, RuleProvider } from './types.js';

type RoleMatrix = Readonly<
  Record<ActorKind, Readonly<Record<ModuleKey, ReadonlyArray<PermissionAction>>>>
>;

const EMPTY_MODULE_PERMS = Object.freeze({
  dashboard: [],
  sales: [],
  ppc: [],
  inventory: [],
  shipments: [],
  uploads: [],
  reports: [],
  unit_economics: [],
  settings: [],
}) satisfies Record<ModuleKey, ReadonlyArray<PermissionAction>>;

const DEFAULT_MATRIX: RoleMatrix = Object.freeze({
  internal_manager: EMPTY_MODULE_PERMS,
  internal_staff: EMPTY_MODULE_PERMS,
  organization_admin: EMPTY_MODULE_PERMS,
  organization_user: EMPTY_MODULE_PERMS,
  ai_agent: EMPTY_MODULE_PERMS,
  system: EMPTY_MODULE_PERMS,
});

export interface RoleProviderOptions {
  readonly matrix?: RoleMatrix;
}

export class RoleProvider implements RuleProvider {
  readonly name = 'role_baseline';
  private readonly matrix: RoleMatrix;

  constructor(opts: RoleProviderOptions = {}) {
    this.matrix = opts.matrix ?? DEFAULT_MATRIX;
  }

  async evaluate(actor: ActorContext, scope: PermissionScope): Promise<RuleEvaluation> {
    const moduleEntry = this.matrix[actor.actorKind]?.[scope.module];
    if (!moduleEntry || moduleEntry.length === 0) {
      return { applies: false };
    }
    const allowed = moduleEntry.includes(scope.action);
    if (!allowed) {
      return { applies: false };
    }
    return {
      applies: true,
      decision: {
        allowed: true,
        source: 'role',
        reason: `role '${actor.actorKind}' grants '${scope.action}' on '${scope.module}'`,
      },
    };
  }
}
