import { Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, SpinLoading } from 'antd-mobile';
import zhCN from 'antd-mobile/es/locales/zh-CN';
import { lazy } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SplashScreen } from '@capacitor/splash-screen';
import AppShell from './layouts/AppShell';
import ProtectedRoute from './router/ProtectedRoute';
import { NAV_ITEMS } from './router/navConfig';
import { useAuthStore } from './stores/auth';
import { authService } from './services/authService';
import { queryClient } from './lib/queryClient';
import NetworkProvider from './components/NetworkProvider';
import { promptUpdate } from './services/updateService';
import { notificationSocket } from './services/notificationSocket';
import PriorityNotificationHost from './components/PriorityNotificationHost';

const Login = lazy(() => import('./pages/Login'));
const Forbidden = lazy(() => import('./pages/Forbidden'));
const Notifications = lazy(() => import('./pages/Notifications'));

function SuspenseFallback() {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SpinLoading color="primary" />
    </div>
  );
}

export default function App() {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (!hasHydrated || !token) return;
    notificationSocket.connect();
    return () => notificationSocket.disconnect();
  }, [hasHydrated, token]);

  // 启动预加载：已登录则先拉取最新用户信息与权限，就绪后再隐藏 Splash，
  // 避免白屏与权限闪烁（capacitor.config 已将 launchAutoHide 关闭，改由此处手动 hide）。
  useEffect(() => {
    // Preferences 为异步存储。恢复完成前若渲染路由，会把有效登录态误判为未登录。
    if (!hasHydrated) return;

    let done = false;
    const hide = () => {
      if (done) return;
      done = true;
      SplashScreen.hide().catch(() => {});
    };
    // 安全兜底：无论预加载结果如何，最多 5s 后必隐藏 Splash
    const safety = setTimeout(hide, 5000);

    const boot = async () => {
      if (useAuthStore.getState().token) {
        // 失败时沿用本地缓存的权限，不阻塞进入
        await authService.fetchProfile().catch(() => {});
      }
    };
    boot().finally(() => {
      clearTimeout(safety);
      hide();
      // 登录态就绪后做一次静默版本检查（未配置/失败均不打扰，不阻塞启动）
      if (useAuthStore.getState().token) {
        promptUpdate().catch(() => {});
      }
    });

    return () => clearTimeout(safety);
  }, [hasHydrated]);

  if (!hasHydrated) {
    return <SuspenseFallback />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <NetworkProvider>
        <ConfigProvider locale={zhCN}>
          <HashRouter>
            <Suspense fallback={<SuspenseFallback />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/403" element={<Forbidden />} />
                <Route
                  path="/notifications"
                  element={
                    <ProtectedRoute>
                      <Notifications />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <AppShell />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  {NAV_ITEMS.map((item) => {
                    const Page = item.component;
                    return (
                      <Route
                        key={item.path}
                        path={item.segment}
                        element={
                          <ProtectedRoute requiredPermission={item.permission}>
                            <Page />
                          </ProtectedRoute>
                        }
                      />
                    );
                  })}
                </Route>
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
            <PriorityNotificationHost />
          </HashRouter>
        </ConfigProvider>
      </NetworkProvider>
    </QueryClientProvider>
  );
}
