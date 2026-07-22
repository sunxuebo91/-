import { apiService } from './api';
import { useAuthStore } from '../stores/auth';
import type { ApiResponse, LoginResult, User, WechatAppLoginResult } from '../types';

/**
 * 认证服务。负责登录/登出/拉取当前用户，并把结果写入 auth store。
 * baseURL 已含 /api，故路径不带 /api 前缀。
 */
export const authService = {
  applyLogin(result: LoginResult): User {
    useAuthStore.getState().setAuth(result.access_token, result.user);
    return result.user;
  },

  /** 登录：POST /auth/login → { success, data:{ access_token, user } } */
  async login(username: string, password: string): Promise<User> {
    const body = await apiService.post<ApiResponse<LoginResult>>('/auth/login', {
      username,
      password,
    });
    if (!body?.success || !body.data?.access_token || !body.data?.user) {
      throw new Error(body?.message || '登录失败');
    }
    return this.applyLogin(body.data);
  },

  async wechatAppLogin(code: string): Promise<WechatAppLoginResult> {
    const body = await apiService.post<ApiResponse<WechatAppLoginResult>>('/auth/wechat-app-login', { code });
    if (!body?.success || !body.data) throw new Error(body?.message || '微信登录失败');
    if (body.data.access_token && body.data.user) this.applyLogin(body.data as LoginResult);
    return body.data;
  },

  async bindCurrentWechatApp(code: string): Promise<void> {
    const body = await apiService.post<ApiResponse<{ wechatAppBound: boolean }>>('/auth/wechat-app-bind-current', { code });
    if (!body?.success || !body.data?.wechatAppBound) {
      throw new Error(body?.message || '微信账号绑定失败');
    }
    const currentUser = useAuthStore.getState().user;
    if (currentUser) useAuthStore.getState().setUser({ ...currentUser, wechatAppBound: true });
  },

  /** 拉取当前用户信息与权限：GET /auth/me → { success, data: user } */
  async fetchProfile(): Promise<User> {
    const body = await apiService.get<ApiResponse<User>>('/auth/me');
    if (!body?.success) {
      throw new Error(body?.message || '获取用户信息失败');
    }
    useAuthStore.getState().setUser(body.data);
    return body.data;
  },

  /** 刷新 token：POST /auth/refresh → { success, data:{ token } } */
  async refreshToken(): Promise<boolean> {
    try {
      const body = await apiService.post<ApiResponse<{ token: string }>>('/auth/refresh');
      const token = body?.data?.token;
      if (!token) return false;
      useAuthStore.getState().setToken(token);
      return true;
    } catch {
      return false;
    }
  },

  /** 登出：POST /auth/logout（失败也清本地状态） */
  async logout(): Promise<void> {
    try {
      await apiService.post('/auth/logout');
    } catch {
      /* ignore */
    } finally {
      useAuthStore.getState().clear();
    }
  },
};

export default authService;
