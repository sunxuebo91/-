import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { TabBar } from 'antd-mobile';
import { NAV_ITEMS, preloadNavigationPage } from '../router/navConfig';
import { useAuthStore } from '../stores/auth';
import { checkPermission, normalizeRole } from '../utils/permission';

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  // 订阅 permissions，权限变化时底部 Tab 自动更新
  const { permissions, user } = useAuthStore();

  const userRole = user?.role ? normalizeRole(user.role) : '';
  const isAdminOrOp = userRole === 'admin' || userRole === 'operator';
  const isAdmissions = userRole === 'admissions';

  // 动态构建 TabBar 项目
  let tabKeys: string[] = ['/dashboard'];

  if (isAdminOrOp) {
    // 管理员/运营：能看到全部业务线 Tab
    tabKeys.push('/customers', '/training-leads', '/contracts', '/training-orders');
  } else if (isAdmissions) {
    // 招生老师：只看学员、职培订单
    tabKeys.push('/training-leads', '/training-orders');
  } else {
    // 派单老师等其他角色：只看客户、合同
    tabKeys.push('/customers', '/contracts');
  }

  tabKeys.push('/workbench', '/my');

  // 按 tabKeys + 权限动态过滤可见 Tab
  const visibleTabs = tabKeys
    .map((key) => NAV_ITEMS.find((item) => item.path === key))
    .filter((item): item is typeof NAV_ITEMS[0] => {
      if (!item) return false;
      return !item.permission || checkPermission(permissions, item.permission);
    })
    .map((item) => {
      // 优化 Tab 名称显示，避免文字过长
      let title = item.title;
      if (item.path === '/training-leads') title = '学员';
      if (item.path === '/training-orders') title = '职培';
      return { ...item, title };
    });

  const activeTab = visibleTabs.find((t) => location.pathname === t.path || location.pathname.startsWith(`${t.path}/`));
  const activeKey =
    activeTab?.path ||
    visibleTabs[0]?.path ||
    '/dashboard';

  const showTabBar = !!activeTab;
  const visibleTabPaths = visibleTabs.map((tab) => tab.path).join('|');

  // 让首屏先稳定渲染，再按可见 Tab 顺序预加载模块。
  // 这样不会阻塞启动，也能消除首次点击底部导航时的懒加载顿挫。
  useEffect(() => {
    const paths = visibleTabPaths.split('|').filter((path) => path && path !== activeKey);
    const timers = paths.map((path, index) =>
      window.setTimeout(() => preloadNavigationPage(path), 700 + index * 180),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [activeKey, visibleTabPaths]);

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', paddingBottom: showTabBar ? 50 : 0 }}>
      <Outlet />
      {showTabBar && (
        <TabBar
          activeKey={activeKey}
          onChange={(key) => navigate(key)}
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            // 常驻 backdrop-filter 会让 Android WebView 在滚动和切页时重绘整块底层内容。
            background: '#fff',
            borderTop: '1px solid rgba(0,0,0,0.05)',
            paddingBottom: 'safe-area-inset-bottom',
            transform: 'translateZ(0)',
          }}
        >
          {visibleTabs.map((t) => (
            <TabBar.Item key={t.path} title={t.title} icon={t.icon} />
          ))}
        </TabBar>
      )}
    </div>
  );
}
