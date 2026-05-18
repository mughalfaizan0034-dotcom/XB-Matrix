import type { OrganizationId, WorkspaceId } from './ids.js';
import type { ModuleKey, PermissionAction } from './module.js';

export interface PermissionScope {
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId | null;
  readonly module: ModuleKey;
  readonly action: PermissionAction;
}

export type PermissionDecisionSource =
  | 'role'
  | 'workspace_grant'
  | 'page_override'
  | 'derived'
  | 'internal_manager_bypass'
  | 'deny_default';

export interface PermissionDecision {
  readonly allowed: boolean;
  readonly source: PermissionDecisionSource;
  readonly reason: string;
}
