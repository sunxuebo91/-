import { useNavigate } from 'react-router-dom';
import { NavBar, Grid, Badge } from 'antd-mobile';
import {
  TeamOutline,
  FileOutline,
  CheckOutline,
  UserContactOutline,
  UserOutline,
  SetOutline,
  ContentOutline,
  PayCircleOutline,
  StarOutline,
  ReceivePaymentOutline,
  BankcardOutline,
  TravelOutline,
  UnorderedListOutline,
  GiftOutline,
  BellOutline,
  TagOutline,
} from 'antd-mobile-icons';
import type { ReactNode } from 'react';
import { useAuthStore } from '../stores/auth';
import { useNotificationStore } from '../stores/notification';
import { checkPermission } from '../utils/permission';

/**
 * 工作台（更多）：聚合全部低频/管理类模块入口，避免 TabBar 过载。
 * 按权限动态显隐（复用 checkPermission，与 AppShell 一致，权限点对齐后端 catalog）。
 */

interface Entry {
  path: string;
  label: string;
  icon: ReactNode;
  perm?: string;
}

interface Group {
  title: string;
  entries: Entry[];
}

const GROUPS: Group[] = [
  {
    title: '业务',
    entries: [
      { path: '/customers', label: '客户', icon: <TeamOutline />, perm: 'customer:view' },
      { path: '/contracts', label: '合同', icon: <FileOutline />, perm: 'contract:view' },
      { path: '/approvals', label: '审批', icon: <CheckOutline /> },
      { path: '/resumes', label: '简历/阿姨', icon: <UserContactOutline />, perm: 'resume:view' },
      { path: '/order-hall', label: '接单大厅', icon: <UnorderedListOutline /> },
      { path: '/referral', label: '推荐返费', icon: <GiftOutline /> },
      { path: '/notifications', label: '通知中心', icon: <BellOutline /> },
    ],
  },
  {
    title: '保险 · 背调',
    entries: [
      { path: '/insurance', label: '保险', icon: <StarOutline />, perm: 'insurance:view' },
      { path: '/background-check', label: '背景调查', icon: <BankcardOutline />, perm: 'background-check:view' },
    ],
  },
  {
    title: '职业培训',
    entries: [
      { path: '/training-leads', label: '培训线索', icon: <TravelOutline />, perm: 'training-lead:view' },
      { path: '/training-orders', label: '职培合同', icon: <FileOutline />, perm: 'training-order:view' },
      { path: '/training-class', label: '开班管理', icon: <TeamOutline />, perm: 'training-order:view' },
      { path: '/course', label: '课程', icon: <ContentOutline />, perm: 'training-order:view' },
    ],
  },
  {
    title: '内容 · 收款',
    entries: [
      { path: '/forms', label: '表单', icon: <UnorderedListOutline /> },
      { path: '/esign', label: '电子签', icon: <FileOutline />, perm: 'contract:view' },
      { path: '/payment', label: '支付/收款', icon: <PayCircleOutline /> },
      { path: '/finance', label: '财务流水', icon: <TagOutline />, perm: 'finance:view' },
    ],
  },
  {
    title: '系统管理',
    entries: [
      { path: '/users', label: '用户', icon: <UserOutline />, perm: 'user:view' },
      { path: '/roles', label: '角色', icon: <ReceivePaymentOutline />, perm: 'admin:roles' },
      { path: '/settings', label: '系统设置', icon: <SetOutline />, perm: 'admin:settings' },
    ],
  },
];

function Cell({ entry, onClick }: { entry: Entry; onClick: () => void }) {
  return (
    <Grid.Item onClick={onClick}>
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '16px 8px',
          textAlign: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div style={{
          fontSize: 24,
          color: '#158F82',
          background: 'rgba(21, 143, 130, 0.08)',
          width: 44,
          height: 44,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8
        }}>
          {entry.icon}
        </div>
        <div style={{ fontSize: 13, color: '#333', fontWeight: 500 }}>{entry.label}</div>
      </div>
    </Grid.Item>
  );
}

export default function Workbench() {
  const navigate = useNavigate();
  const permissions = useAuthStore((s) => s.permissions);
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const groups = GROUPS.map((g) => ({
    ...g,
    entries: g.entries.filter((e) => !e.perm || checkPermission(permissions, e.perm)),
  })).filter((g) => g.entries.length > 0);

  return (
    <div style={{ background: '#f5f7fa', minHeight: '100vh', paddingBottom: 60 }}>
      <NavBar
        back={null}
        style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}
        right={
          <div onClick={() => navigate('/notifications')} style={{ fontSize: 24, cursor: 'pointer', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
            <Badge content={unreadCount > 0 ? unreadCount : null} style={{ '--right': '10%', '--top': '10%' }}>
              <BellOutline />
            </Badge>
          </div>
        }
      >
        工作台
      </NavBar>
      <div style={{ padding: '16px 16px' }}>
        {groups.map((g) => (
          <div key={g.title} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>{g.title}</div>
            <Grid columns={4} gap={12}>
              {g.entries.map((e) => (
                <Cell key={e.path} entry={e} onClick={() => navigate(e.path)} />
              ))}
            </Grid>
          </div>
        ))}
      </div>
    </div>
  );
}
