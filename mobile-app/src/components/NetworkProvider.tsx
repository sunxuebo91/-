import { useEffect } from 'react';
import { Toast } from 'antd-mobile';
import { useQueryClient } from '@tanstack/react-query';
import { Network } from '@capacitor/network';
import type { PluginListenerHandle } from '@capacitor/core';
import { useNetworkStore } from '../stores/network';

/**
 * NetworkProvider（Task 5 弱网/网络切换处理）
 *
 * - 启动时读取一次网络状态，并用 @capacitor/network 持续监听 networkStatusChange。
 * - 状态写入 useNetworkStore（api.ts 断网时据此拦截写操作、页面可据此禁用提交）。
 * - 断网 → 顶部常驻横幅提示；恢复 → Toast 提示并 invalidate 所有查询，
 *   触发当前活跃列表/详情自动重新拉取（与 api.ts 的 withRetry 协同）。
 *
 * 兼容 Web：@capacitor/network 在浏览器下用 navigator.onLine 实现，无需额外分支。
 */
export default function NetworkProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const online = useNetworkStore((s) => s.online);
  const setStatus = useNetworkStore((s) => s.setStatus);

  useEffect(() => {
    let handle: PluginListenerHandle | undefined;
    let prevOnline = useNetworkStore.getState().online;

    const apply = (connected: boolean, type?: string) => {
      const wasOffline = !prevOnline;
      prevOnline = connected;
      setStatus(connected, type);
      if (connected && wasOffline) {
        // 恢复联网：提示并刷新活跃查询，重新拉取关键数据
        Toast.show({ icon: 'success', content: '网络已恢复' });
        queryClient.invalidateQueries();
      }
    };

    Network.getStatus()
      .then((s) => apply(s.connected, s.connectionType))
      .catch(() => {});

    Network.addListener('networkStatusChange', (s) => apply(s.connected, s.connectionType))
      .then((h) => {
        handle = h;
      })
      .catch(() => {});

    return () => {
      handle?.remove().catch(() => {});
    };
  }, [queryClient, setStatus]);

  return (
    <>
      {!online && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            background: '#ff3141',
            color: '#fff',
            textAlign: 'center',
            fontSize: 13,
            padding: '6px 12px',
          }}
        >
          当前无网络连接，部分操作已暂停
        </div>
      )}
      {children}
    </>
  );
}
