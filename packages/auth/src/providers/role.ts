import type {
  ActorContext,
  EffectiveRole,
  ModuleKey,
  PermissionAction,
  PermissionScope,
} from '@xb/types';
import type { RuleEvaluation, RuleProvider } from './types.js';

type RoleMatrix = Readonly<
  Record<EffectiveRole, Readonly<Record<ModuleKey, ReadonlyArray<PermissionAction>>>>
>;

const ALL: ReadonlyArray<PermissionAction> = ['view', 'edit', 'create', 'delete', 'export', 'admin'];
const VIEW: ReadonlyArray<PermissionAction> = ['view', 'export'];
const VIEW_EDIT: ReadonlyArray<PermissionAction> = ['view', 'edit', 'create', 'export'];
const NONE: ReadonlyArray<PermissionAction> = [];

const ALL_MODULES_FULL: Record<ModuleKey, ReadonlyArray<PermissionAction>> = Object.freeze({
  dashboard: ALL,
  sales: ALL,
  ppc: ALL,
  inventory: ALL,
  shipments: ALL,
  uploads: ALL,
  reports: ALL,
  unit_economics: ALL,
  settings: ALL,
});

const ALL_MODULES_VIEW: Record<ModuleKey, ReadonlyArray<PermissionAction>> = Object.freeze({
  dashboard: VIEW,
  sales: VIEW,
  ppc: VIEW,
  inventory: VIEW,
  shipments: VIEW,
  uploads: VIEW,
  reports: VIEW,
  unit_economics: VIEW,
  settings: NONE,
});

const ALL_MODULES_VIEW_EDIT: Record<ModuleKey, ReadonlyArray<PermissionAction>> = Object.freeze({
  dashboard: VIEW_EDIT,
  sales: VIEW_EDIT,
  ppc: VIEW_EDIT,
  inventory: VIEW_EDIT,
  shipments: VIEW_EDIT,
  uploads: VIEW_EDIT,
  reports: VIEW_EDIT,
  unit_economics: VIEW,
  settings: NONE,
});

const EMPTY_MATRIX: Record<ModuleKey, ReadonlyArray<PermissionAction>> = Object.freeze({
  dashboard: NONE,
  sales: NONE,
  ppc: NONE,
  inventory: NONE,
  shipments: NONE,
  uploads: NONE,
  reports: NONE,
  unit_economics: NONE,
  settings: NONE,
});

/**
 * Baseline role matrix. This is a stand-in until Spec 2 (Permission Truth Table)
 * lands — those values will be loaded from the DB / config instead of hardcoded.
 *
 *   super_admin           → bypass via InternalManagerProvider (matrix unused)
 *   internal_manager      → bypass via InternalManagerProvider (matrix unused)
 *   internal_staff        → view on every module
 *   organization_admin    → full on every module within their org, plus settings admin
 *   organization_user     → view+edit on operational modules; no settings
 *   ai_agent              → view-only on outputs
 *   system                → bypass; gets system_job kind in audit, no resolver gate
 */
const DEFAULT_MATRIX: RoleMatrix = Object.freeze({
  super_admin: ALL_MODULES_FULL,
  internal_manager: ALL_MODULES_FULL,
  internal_staff: ALL_MODULES_VIEW,
  organization_admin: { ...ALL_MODULES_FULL, settings: ALL },
  organization_user: ALL_MODULES_VIEW_EDIT,
  ai_agent: ALL_MODULES_VIEW,
  system: ALL_MODULES_FULL,
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
    const moduleEntry = this.matrix[actor.effectiveRole]?.[scope.module];
    if (!moduleEntry || moduleEntry.length === 0) {
      return { applies: false };
    }
    if (!moduleEntry.includes(scope.action)) {
      return { applies: false };
    }
    return {
      applies: true,
      decision: {
        allowed: true,
        source: 'role',
        reason: `role '${actor.effectiveRole}' grants '${scope.action}' on '${scope.module}'`,
      },
    };
  }
}
