export const MODULES = [
  'dashboard',
  'sales',
  'ppc',
  'inventory',
  'shipments',
  'uploads',
  'reports',
  'unit_economics',
  'settings',
] as const;

export type ModuleKey = (typeof MODULES)[number];

export const PERMISSION_ACTIONS = [
  'view',
  'edit',
  'create',
  'delete',
  'export',
  'admin',
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
