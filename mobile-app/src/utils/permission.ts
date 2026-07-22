/**
 * 权限体系工具，逻辑对齐 frontend/src/contexts/AuthContext.tsx。
 * - ROLE_ALIAS_MAP：中英文角色别名归一化
 * - checkPermission：支持 `*` 全通配、精确匹配、`resource:all` 资源级通配
 * - checkRole：归一化后比较
 */

export const ROLE_ALIAS_MAP: Record<string, string> = {
  admin: 'admin',
  administrator: 'admin',
  系统管理员: 'admin',
  管理员: 'admin',
  超级管理员: 'admin',
  manager: 'manager',
  经理: 'manager',
  主管: 'manager',
  employee: 'employee',
  staff: 'employee',
  普通员工: 'employee',
  员工: 'employee',
  销售: 'employee',
  operator: 'operator',
  运营: 'operator',
  运营专员: 'operator',
  admissions: 'admissions',
  招生老师: 'admissions',
  招生: 'admissions',
  dispatch: 'dispatch',
  派单老师: 'dispatch',
  派单: 'dispatch',
  trainer: 'trainer',
  培训讲师: 'trainer',
  讲师: 'trainer',
};

export const normalizeRole = (role?: string): string => {
  if (!role) return '';
  const trimmed = role.trim();
  return ROLE_ALIAS_MAP[trimmed] || ROLE_ALIAS_MAP[trimmed.toLowerCase()] || trimmed;
};

export const normalizePermissions = (list?: string[]): string[] => {
  if (!Array.isArray(list)) return [];
  return [...new Set(list)];
};

/** 判断权限集合是否包含指定权限（支持通配符） */
export const checkPermission = (permissions: string[], permission: string): boolean => {
  if (!permissions || permissions.length === 0) return false;
  if (permissions.includes('*')) return true;
  if (permissions.includes(permission)) return true;
  const [resource] = permission.split(':');
  return permissions.includes(`${resource}:all`);
};

/** 判断用户角色是否匹配（归一化比较） */
export const checkRole = (userRole: string | undefined, role: string): boolean => {
  return normalizeRole(userRole) === normalizeRole(role);
};
