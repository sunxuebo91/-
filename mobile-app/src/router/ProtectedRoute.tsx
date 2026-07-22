import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { usePermission } from '../hooks/usePermission';

interface ProtectedRouteProps {
  children: ReactNode;
  /** 访问所需权限；不填表示登录即可访问 */
  requiredPermission?: string;
}

/**
 * 受保护路由高阶组件：
 * - 未登录 → 跳转 /login
 * - 指定 requiredPermission 且无该权限 → 跳转 /403
 */
export function ProtectedRoute({ children, requiredPermission }: ProtectedRouteProps) {
  const token = useAuthStore((s) => s.token);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  // hook 必须无条件调用；无 requiredPermission 时忽略其结果
  const hasPerm = usePermission(requiredPermission ?? '');

  if (!hasHydrated) {
    return null;
  }
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (requiredPermission && !hasPerm) {
    return <Navigate to="/403" replace />;
  }
  return <>{children}</>;
}

export default ProtectedRoute;
