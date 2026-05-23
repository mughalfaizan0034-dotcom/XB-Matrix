/**
 * Frontend role-label mapping.
 *
 * Backend keeps its established identifiers (super_admin /
 * internal_manager / internal_staff / organization_admin /
 * organization_user); the UI only ever renders the clean labels
 * below. A single helper means a future rename touches one file.
 * RBAC, audit logs, and resolver decisions still use the backend
 * identifier.
 *
 * See project_design_system memory for the canonical ordering.
 */

export type BackendRole =
  | 'super_admin'
  | 'internal_manager'
  | 'internal_staff'
  | 'organization_admin'
  | 'organization_user';

const ROLE_LABEL: Record<BackendRole, string> = {
  super_admin: 'Super Admin',
  internal_manager: 'Manager',
  internal_staff: 'Staff',
  organization_admin: 'Admin',
  organization_user: 'User',
};

/** Canonical role display label. Falls back to a humanized string. */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return '';
  if (role in ROLE_LABEL) return ROLE_LABEL[role as BackendRole];
  // Defensive fallback for unexpected values (treat as a single word).
  return role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Canonical ordering for sorts, dropdowns, and role pickers. */
export const ROLE_ORDER: ReadonlyArray<BackendRole> = [
  'super_admin',
  'internal_manager',
  'internal_staff',
  'organization_admin',
  'organization_user',
];
