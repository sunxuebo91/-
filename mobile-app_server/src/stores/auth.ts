import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '../types/user';
import {
  checkPermission,
  checkRole,
  normalizePermissions,
  normalizeRole,
} from '../utils/permission';
import { zustandStorage } from '../utils/storage';

/**
 * 认证 + 权限统一 store（对齐 frontend AuthContext）。
 * - token / user / permissions[] / roles[]
 * - hasPermission(perm)：支持 `*`、精确、`resource:all` 通配
 * - hasRole(role)：角色归一化比较
 * 使用 @capacitor/preferences（原生）/ localStorage（web）异步持久化。
 *
 * 注意：此 store 不 import services/api，避免与 api.ts 形成循环依赖。
 * 登录/拉取用户信息等副作用放在 services/authService.ts 中。
 */

interface AuthState {
  token: string | null;
  user: User | null;
  permissions: string[];
  roles: string[];
  hasHydrated: boolean;
  // actions
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  clear: () => void;
  setHydrated: () => void;
  // selectors
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      permissions: [],
      roles: [],
      hasHydrated: false,

      setAuth: (token, user) =>
        set({
          token,
          user,
          permissions: normalizePermissions(user?.permissions),
          roles: user?.role ? [normalizeRole(user.role)] : [],
        }),

      setUser: (user) =>
        set({
          user,
          permissions: normalizePermissions(user?.permissions),
          roles: user?.role ? [normalizeRole(user.role)] : [],
        }),

      setToken: (token) => set({ token }),

      clear: () => set({ token: null, user: null, permissions: [], roles: [] }),

      setHydrated: () => set({ hasHydrated: true }),

      hasPermission: (permission) => checkPermission(get().permissions, permission),

      hasRole: (role) => checkRole(get().user?.role, role),
    }),
    {
      name: 'ande-mobile-auth',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        permissions: state.permissions,
        roles: state.roles,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
