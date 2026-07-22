import axios from 'axios';
import type { AxiosRequestConfig, AxiosInstance } from 'axios';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { useAuthStore } from '../stores/auth';
import { isOnline } from '../stores/network';

/**
 * 统一 API 层
 * - axios + baseURL(VITE_API_BASE) + Bearer 注入 + 统一响应解包（返回后端 body）
 * - 网络错误自动重试（默认 2 次，指数退避）
 * - 相同 GET 请求并发去重（url+params 共享 in-flight Promise）
 * - 401 统一处理：清空 auth 状态并跳转登录（配合 HashRouter，用 hash 跳转）
 * - 平台适配：原生环境可选走 CapacitorHttp（默认 axios，见 USE_NATIVE_HTTP）
 *
 * 注意：baseURL 已包含 /api，故各 service 路径无需再带 /api 前缀。
 */

const BASE_URL = import.meta.env.VITE_API_BASE || 'https://crm.andejiazheng.com/api';
const TIMEOUT = 15000;
const MAX_RETRIES = 2;

// 是否在原生环境启用 CapacitorHttp 通道。Task 0 已确认 axios 直连可通过 CORS，
// 故默认关闭，axios 为默认通道；如需原生网络加固可置为 true。
const USE_NATIVE_HTTP = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

// ── 401 统一跳转（HashRouter） ─────────────────
export const redirectToLogin = (): void => {
  try {
    useAuthStore.getState().clear();
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && !window.location.hash.includes('/login')) {
    window.location.hash = '#/login';
  }
};

// ── axios 实例 ─────────────────────────────────
export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：成功解包为后端 body；失败时统一处理 401
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err?.response?.status === 401) {
      redirectToLogin();
    }
    return Promise.reject(err);
  },
);

// ── 网络错误重试（指数退避） ────────────────────
const isRetriableError = (err: any): boolean => {
  if (!err) return false;
  if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') return true;
  // 无响应（断网/超时）可重试；有响应（4xx/5xx）不重试
  return !err.response;
};

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES, delay = 500): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0 && isRetriableError(err)) {
      await sleep(delay);
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw err;
  }
}

// ── CapacitorHttp 原生通道（可选） ──────────────
async function nativeRequest<T = any>(config: {
  method: string;
  url: string;
  params?: Record<string, unknown>;
  data?: unknown;
}): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await CapacitorHttp.request({
    method: config.method,
    url: `${BASE_URL}${config.url}`,
    headers,
    params: config.params as Record<string, string> | undefined,
    data: config.data,
  });
  if (res.status === 401) {
    redirectToLogin();
    throw { response: { status: 401, data: res.data } };
  }
  if (res.status >= 400) {
    throw { response: { status: res.status, data: res.data } };
  }
  return res.data as T;
}

const preferNativeHttp = () => USE_NATIVE_HTTP && isNative();

// 断网时拦截写操作（Task 5）：禁止提交，快速报错，避免白等超时/重试。
// 与 NetworkProvider 的全局断网横幅提示协同；读操作（GET）不拦截，交由 withRetry 处理。
const assertOnline = (): void => {
  if (!isOnline()) {
    const err: any = new Error('当前无网络连接，请稍后重试');
    err.code = 'ERR_OFFLINE';
    throw err;
  }
};

// ── GET 并发去重 ───────────────────────────────
const inflight = new Map<string, Promise<any>>();

function dedupGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const key = `GET:${url}:${JSON.stringify(params || {})}`;
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const p = withRetry<T>(() =>
    preferNativeHttp()
      ? nativeRequest<T>({ method: 'GET', url, params })
      : (api.get(url, { params }) as unknown as Promise<T>),
  ).finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

// ── 统一 apiService（返回后端 body） ────────────
export const apiService = {
  get<T = any>(url: string, params?: Record<string, unknown>): Promise<T> {
    return dedupGet<T>(url, params);
  },

  // 写操作（POST/PUT/PATCH/DELETE）不做自动重试：网络抖动时对非幂等请求重试
  // 可能造成重复落库/重复提交，失败统一交由页面显式反馈（Toast/错误态）。
  post<T = any>(url: string, data?: unknown): Promise<T> {
    assertOnline();
    return preferNativeHttp()
      ? nativeRequest<T>({ method: 'POST', url, data })
      : (api.post(url, data) as unknown as Promise<T>);
  },

  put<T = any>(url: string, data?: unknown): Promise<T> {
    assertOnline();
    return preferNativeHttp()
      ? nativeRequest<T>({ method: 'PUT', url, data })
      : (api.put(url, data) as unknown as Promise<T>);
  },

  patch<T = any>(url: string, data?: unknown): Promise<T> {
    assertOnline();
    return preferNativeHttp()
      ? nativeRequest<T>({ method: 'PATCH', url, data })
      : (api.patch(url, data) as unknown as Promise<T>);
  },

  delete<T = any>(url: string): Promise<T> {
    assertOnline();
    return preferNativeHttp()
      ? nativeRequest<T>({ method: 'DELETE', url })
      : (api.delete(url) as unknown as Promise<T>);
  },

  // 文件上传统一走 axios（FormData 由浏览器/webview 处理 boundary）
  upload<T = any>(url: string, formData: FormData, method: 'POST' | 'PATCH' = 'POST'): Promise<T> {
    assertOnline();
    const config: AxiosRequestConfig = {
      headers: { 'Content-Type': 'multipart/form-data' },
    };
    const req =
      method === 'PATCH' ? api.patch(url, formData, config) : api.post(url, formData, config);
    return req as unknown as Promise<T>;
  },
};

export default api;
