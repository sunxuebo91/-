import { create } from 'zustand';

/**
 * 网络状态 store（Task 5 弱网/网络切换处理）。
 * - online：当前是否联网（由 NetworkProvider 通过 @capacitor/network 监听更新）
 * - connectionType：连接类型（wifi/cellular/none/unknown）
 *
 * 说明：本 store 为纯 zustand，不 import services/api，避免循环依赖；
 * api.ts 通过 isOnline() 只读读取，用于断网时拦截写操作。
 */
interface NetworkState {
  online: boolean;
  connectionType: string;
  setStatus: (online: boolean, connectionType?: string) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  online: true,
  connectionType: 'unknown',
  setStatus: (online, connectionType) =>
    set((s) => ({ online, connectionType: connectionType ?? s.connectionType })),
}));

/** 只读读取当前是否联网（供 api.ts 等非组件环境使用） */
export const isOnline = (): boolean => useNetworkStore.getState().online;
