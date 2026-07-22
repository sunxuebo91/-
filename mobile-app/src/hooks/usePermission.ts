import { useAuthStore } from '../stores/auth';

/**
 * usePermission：权限判断 hook。
 * @param permission 权限标识，对齐后端 permission-catalog（资源统一用 :view / :edit 等），
 *   如 'customer:view'、'customer:edit'、'contract:all'、'*'。
 *   注意：后端 catalog 不存在的权限点（如 approval/order-hall/referral/forms/payment）
 *   对应端点为仅登录访问，相关模块应改为「无 permission = 登录即可见」，不要在此门控。
 * @returns 是否拥有该权限
 *
 * 用法：const canEdit = usePermission('customer:edit');
 */
export function usePermission(permission: string): boolean {
  // 订阅 permissions，权限变化时组件自动重渲染
  const permissions = useAuthStore((s) => s.permissions);
  if (!permissions || permissions.length === 0) return false;
  if (permissions.includes('*')) return true;
  if (permissions.includes(permission)) return true;
  const [resource] = permission.split(':');
  return permissions.includes(`${resource}:all`);
}

export default usePermission;
