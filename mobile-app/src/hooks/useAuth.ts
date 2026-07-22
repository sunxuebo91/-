import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { authService } from '../services/authService';

/**
 * useAuth：统一登录态与用户信息访问。
 * 返回 user/token/permissions/roles + login/logout/fetchProfile + hasPermission/hasRole。
 */
export function useAuth() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);
  const roles = useAuthStore((s) => s.roles);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const hasRole = useAuthStore((s) => s.hasRole);

  const login = useCallback(async (username: string, password: string) => {
    return authService.login(username, password);
  }, []);

  const fetchProfile = useCallback(async () => {
    return authService.fetchProfile();
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    navigate('/login', { replace: true });
  }, [navigate]);

  return {
    token,
    user,
    permissions,
    roles,
    isAuthenticated: !!token,
    hasPermission,
    hasRole,
    login,
    logout,
    fetchProfile,
  };
}

export default useAuth;
