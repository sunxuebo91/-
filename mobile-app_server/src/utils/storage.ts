import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { StateStorage } from 'zustand/middleware';

/**
 * 统一存储封装：
 * - 原生环境（Capacitor）使用 @capacitor/preferences 持久化
 * - Web / 浏览器环境回退到 localStorage
 * 所有方法均为异步（Preferences 天然异步），Web 端用 Promise 包装保持签名一致。
 */

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (isNative()) {
      const { value } = await Preferences.get({ key });
      return value ?? null;
    }
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isNative()) {
      await Preferences.set({ key, value });
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore quota / privacy mode errors */
    }
  },

  async removeItem(key: string): Promise<void> {
    if (isNative()) {
      await Preferences.remove({ key });
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

// ── Token 便捷方法 ─────────────────────────────
export const TOKEN_KEY = 'ande-mobile-token';

export const getToken = (): Promise<string | null> => storage.getItem(TOKEN_KEY);
export const setToken = (token: string): Promise<void> => storage.setItem(TOKEN_KEY, token);
export const removeToken = (): Promise<void> => storage.removeItem(TOKEN_KEY);

/**
 * 供 Zustand persist 使用的 StateStorage 适配器。
 * getItem/setItem/removeItem 均返回 Promise，persist 支持异步存储并自动 rehydrate。
 */
export const zustandStorage: StateStorage = {
  getItem: (name) => storage.getItem(name),
  setItem: (name, value) => storage.setItem(name, value),
  removeItem: (name) => storage.removeItem(name),
};
