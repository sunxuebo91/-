import { lazy } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  AppOutline,
  TeamOutline,
  FileOutline,
  UserContactOutline,
  CheckOutline,
  UserOutline,
  AppstoreOutline,
  TravelOutline,
} from 'antd-mobile-icons';

/**
 * 业务模块导航/路由配置（Task 4 全模块覆盖）。
 * - App.tsx 依据此表生成受保护路由（React.lazy 懒加载）
 * - AppShell.tsx 依据此表 + 权限动态渲染底部 TabBar
 * - Workbench（工作台）聚合全部低频/管理类模块入口，避免 TabBar 过载
 * - 权限点对齐后端 permission-catalog（:view/:create/:edit/:delete）
 */

export interface NavItem {
  /** 完整路由路径（HashRouter 下形如 #/dashboard） */
  path: string;
  /** 路由相对段（用于 <Route path>），如 'dashboard' */
  segment: string;
  title: string;
  icon?: ReactNode;
  /** 访问所需权限；不填表示登录即可访问 */
  permission?: string;
  /** 是否在底部 TabBar 展示 */
  showInTab: boolean;
  /** 懒加载页面组件 */
  component: React.LazyExoticComponent<ComponentType<unknown>>;
}

// modules.tsx 内多模块命名导出，统一用 then 解出 default 供 lazy 使用
const mod = (name: string) =>
  lazy(() =>
    import('../pages/modules').then((m) => ({
      default: (m as unknown as Record<string, ComponentType<unknown>>)[name],
    })),
  );

// 底部高频模块在 App 空闲时预加载。React.lazy 使用相同的动态 import，
// 因此实际进入路由时会直接复用已缓存的模块，不增加重复下载。
const tabPageLoaders: Partial<Record<string, () => Promise<unknown>>> = {
  '/dashboard': () => import('../pages/Dashboard'),
  '/customers': () => import('../pages/Customers'),
  '/training-leads': () => import('../pages/TrainingLeads'),
  '/contracts': () => import('../pages/Contract/ContractList'),
  '/training-orders': () => import('../pages/TrainingOrders'),
  '/workbench': () => import('../pages/Workbench'),
  '/my': () => import('../pages/My'),
};

export const preloadNavigationPage = (path: string): void => {
  void tabPageLoaders[path]?.();
};

export const NAV_ITEMS: NavItem[] = [
  // ── 底部 TabBar（高频） ──────────────────────
  {
    path: '/dashboard',
    segment: 'dashboard',
    title: '首页',
    icon: <AppOutline />,
    showInTab: true,
    component: lazy(() => import('../pages/Dashboard')),
  },
  {
    path: '/customers',
    segment: 'customers',
    title: '客户',
    icon: <TeamOutline />,
    permission: 'customer:view',
    showInTab: true,
    component: lazy(() => import('../pages/Customers')),
  },
  {
    path: '/contracts',
    segment: 'contracts',
    title: '合同',
    icon: <FileOutline />,
    permission: 'contract:view',
    showInTab: true,
    component: lazy(() => import('../pages/Contract/ContractList')),
  },
  {
    path: '/workbench',
    segment: 'workbench',
    title: '工作台',
    icon: <AppstoreOutline />,
    showInTab: true,
    component: lazy(() => import('../pages/Workbench')),
  },
  {
    path: '/my',
    segment: 'my',
    title: '我的',
    icon: <UserOutline />,
    showInTab: true,
    component: lazy(() => import('../pages/My')),
  },

  // ── 业务（工作台入口，不占 Tab） ─────────────
  {
    path: '/approvals',
    segment: 'approvals',
    title: '审批',
    icon: <CheckOutline />,
    // 后端为仅登录(JwtAuthGuard)，不存在 approval:read 权限点 → 所有已登录员工可见
    showInTab: false,
    component: lazy(() => import('../pages/Approvals')),
  },
  {
    path: '/resumes',
    segment: 'resumes',
    title: '简历',
    icon: <UserContactOutline />,
    permission: 'resume:view',
    showInTab: false,
    component: lazy(() => import('../pages/Resumes')),
  },
  {
    path: '/order-hall',
    segment: 'order-hall',
    title: '接单大厅',
    // 后端仅登录访问，无 order-hall:view 权限点 → 所有已登录员工可见
    showInTab: false,
    component: mod('OrderHallPage'),
  },
  {
    path: '/referral',
    segment: 'referral',
    title: '推荐审核',
    // 后端仅登录访问，无 referral:view 权限点 → 所有已登录员工可见
    showInTab: false,
    component: lazy(() => import('../pages/ReferralReview')),
  },

  // ── 保险 / 背调 ──────────────────────────────
  {
    path: '/insurance',
    segment: 'insurance',
    title: '保险',
    permission: 'insurance:view',
    showInTab: false,
    component: lazy(() => import('../pages/Insurance')),
  },
  {
    path: '/background-check',
    segment: 'background-check',
    title: '背景调查',
    permission: 'background-check:view',
    showInTab: false,
    component: lazy(() => import('../pages/BackgroundCheck')),
  },

  // ── 职业培训 ─────────────────────────────────
  {
    path: '/training-leads',
    segment: 'training-leads',
    title: '培训线索',
    icon: <TravelOutline />,
    permission: 'training-lead:view',
    showInTab: false,
    component: lazy(() => import('../pages/TrainingLeads')),
  },
  {
    path: '/training-orders',
    segment: 'training-orders',
    title: '职培合同',
    icon: <FileOutline />,
    permission: 'training-order:view',
    showInTab: false,
    component: lazy(() => import('../pages/TrainingOrders')),
  },
  {
    path: '/training-class',
    segment: 'training-class',
    title: '开班管理',
    permission: 'training-order:view',
    showInTab: false,
    component: mod('TrainingClassPage'),
  },
  {
    path: '/course',
    segment: 'course',
    title: '课程',
    permission: 'training-order:view',
    showInTab: false,
    component: mod('CoursePage'),
  },

  // ── 内容 / 收款 ──────────────────────────────
  {
    path: '/forms',
    segment: 'forms',
    title: '表单',
    // 后端仅登录访问，无 forms:view 权限点 → 所有已登录员工可见
    showInTab: false,
    component: lazy(() => import('../pages/Forms').then((m) => ({ default: m.FormsPage }))),
  },
  {
    path: '/esign',
    segment: 'esign',
    title: '电子签',
    permission: 'contract:view',
    showInTab: false,
    component: mod('EsignPage'),
  },
  {
    path: '/payment',
    segment: 'payment',
    title: '支付/收款',
    // 后端仅登录访问，无 payment:view 权限点 → 所有已登录员工可见
    showInTab: false,
    component: mod('PaymentPage'),
  },

  // ── 通知 / 财务 ──────────────────────────────
  {
    path: '/notifications',
    segment: 'notifications',
    title: '通知中心',
    showInTab: false,
    component: mod('NotificationsPage'),
  },
  {
    path: '/finance',
    segment: 'finance',
    title: '财务流水',
    permission: 'finance:view',
    showInTab: false,
    component: lazy(() => import('../features/finance/FinancePage')),
  },

  // ── 系统管理 ─────────────────────────────────
  {
    path: '/users',
    segment: 'users',
    title: '用户',
    permission: 'user:view',
    showInTab: false,
    component: lazy(() => import('../pages/SystemManagement').then((m) => ({ default: m.UsersPage }))),
  },
  {
    path: '/roles',
    segment: 'roles',
    title: '角色',
    permission: 'admin:roles',
    showInTab: false,
    component: lazy(() => import('../pages/SystemManagement').then((m) => ({ default: m.RolesPage }))),
  },
  {
    path: '/settings',
    segment: 'settings',
    title: '系统设置',
    permission: 'admin:settings',
    showInTab: false,
    component: mod('SettingsPage'),
  },
];
