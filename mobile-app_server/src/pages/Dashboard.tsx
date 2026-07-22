import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, DotLoading, ErrorBlock, Input, NavBar, Popup, PullToRefresh, Toast } from 'antd-mobile';
import { BellOutline, CheckOutline, FileOutline, TeamOutline, UserContactOutline } from 'antd-mobile-icons';
import { useAuthStore } from '../stores/auth';
import { useNotificationStore } from '../stores/notification';
import { useApi } from '../hooks/useApi';
import { usePermission } from '../hooks/usePermission';
import { queryClient, CACHE_TIME } from '../lib/queryClient';
import { dashboardService } from '../services/dashboardService';
import { getDailyQuote, getLunarText } from '../utils/lunar';
import { normalizeRole } from '../utils/permission';
import type { DashboardPeriodParams, DepartmentDashboard, DeptPersonMetrics, OverviewMetrics } from '../types';

type PeriodKey = 'today' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'last30Days';
type EditableMetric = 'monthlyTask' | 'taskAchievedBase';

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'today', label: '今日' },
  { key: 'thisWeek', label: '本周' },
  { key: 'thisMonth', label: '本月' },
  { key: 'lastMonth', label: '上月' },
  { key: 'last30Days', label: '近30天' },
];

const ROLE_LABELS: Record<string, string> = {
  admin: '系统管理员', manager: '经理', employee: '员工', operator: '运营专员',
  admissions: '招生老师', dispatch: '派单老师', trainer: '培训讲师', finance: '财务',
};

const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

const rangeFor = (period: PeriodKey): DashboardPeriodParams => {
  const now = new Date();
  const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, -1);
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const start = startOfDay(now);
  if (period === 'thisWeek') start.setDate(start.getDate() - start.getDay());
  if (period === 'thisMonth') start.setDate(1);
  if (period === 'lastMonth') {
    start.setMonth(start.getMonth() - 1, 1);
    return { startDate: start.toISOString(), endDate: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)).toISOString() };
  }
  if (period === 'last30Days') start.setDate(start.getDate() - 29);
  return { startDate: start.toISOString(), endDate: endOfDay(now).toISOString() };
};

const money = (amount: number) => `¥${Math.round(amount || 0).toLocaleString('zh-CN')}`;
const growth = (value: number | null) => value == null ? '暂无对比' : `${value >= 0 ? '↑' : '↓'} ${Math.abs(value)}%`;

function MetricCard({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: string }) {
  return (
    <div style={{ background: tone, borderRadius: 14, padding: '14px 12px', minHeight: 108 }}>
      <div style={{ color: '#6b7280', fontSize: 12 }}>{title}</div>
      <div style={{ color: '#172033', fontWeight: 700, fontSize: 21, marginTop: 10, letterSpacing: '-0.4px' }}>{value}</div>
      <div style={{ color: '#657084', fontSize: 11, marginTop: 8 }}>{detail}</div>
    </div>
  );
}

function PerformanceRow({
  person,
  canEdit,
  onEdit,
}: {
  person: DeptPersonMetrics;
  canEdit: boolean;
  onEdit: (person: DeptPersonMetrics, metric: EditableMetric) => void;
}) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f1f3', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
      <div>
        <div style={{ color: '#1f2937', fontWeight: 600, fontSize: 14 }}>{person.userName}</div>
        <div style={{ color: '#7b8494', fontSize: 12, marginTop: 5 }}>线索 {person.leadCount} · 订单 {person.orderCount} · 转化 {person.conversionRate}%</div>
        {canEdit && <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="button" onClick={() => onEdit(person, 'monthlyTask')} style={{ padding: 0, border: 0, color: '#158F82', background: 'transparent', fontSize: 12 }}>编辑任务</button>
          <button type="button" onClick={() => onEdit(person, 'taskAchievedBase')} style={{ padding: 0, border: 0, color: '#158F82', background: 'transparent', fontSize: 12 }}>修正业绩</button>
        </div>}
      </div>
      <div style={{ textAlign: 'right', alignSelf: 'center' }}>
        <div style={{ color: '#158F82', fontWeight: 700, fontSize: 15 }}>{money(person.taskAchieved)}</div>
        {canEdit && <div style={{ color: '#7b8494', fontSize: 11, marginTop: 4 }}>任务 {money(person.monthlyTask)}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const canCustomer = usePermission('customer:view');
  const canContract = usePermission('contract:view');
  const canResume = usePermission('resume:view');
  const canTrainingLead = usePermission('training-lead:view');
  const canTrainingOrder = usePermission('training-order:view');
  const [period, setPeriod] = useState<PeriodKey>('thisMonth');
  const [editing, setEditing] = useState<{ person: DeptPersonMetrics; metric: EditableMetric } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const normalizedRole = normalizeRole(user?.role);
  const isAdmin = normalizedRole === 'admin' || user?.permissions?.includes('*') === true;
  // 与 CRM Dashboard 的 canEdit 完全一致；后端仍以 @Roles('admin', 'operator') 强制校验。
  const canEditPerformance = normalizedRole === 'admin' || normalizedRole === 'operator';
  const now = new Date();
  const solarText = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 周${WEEK_DAYS[now.getDay()]}`;
  const lunarText = getLunarText(now);
  const dailyQuote = getDailyQuote(now);
  const avatarUrl = user?.avatar || user?.wechatAvatar;
  const roleLabel = user?.role ? ROLE_LABELS[user.role] || user.role : '';
  const params = useMemo(() => rangeFor(period), [period]);
  const {
    data: overview,
    loading: overviewLoading,
    error: overviewError,
    run: runOverview,
  } = useApi<OverviewMetrics>(dashboardService.getOverviewMetrics, {
    cacheKey: (request?: DashboardPeriodParams) => ['dashboard-overview', request?.startDate, request?.endDate],
    ...CACHE_TIME.stats,
  });
  const {
    data: team,
    run: runDepartment,
  } = useApi<DepartmentDashboard>(dashboardService.getDepartmentMetrics, {
    cacheKey: (request?: DashboardPeriodParams) => ['dashboard-department', request?.startDate, request?.endDate],
    ...CACHE_TIME.stats,
  });

  const load = useCallback(async (force = false) => {
    if (force) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-department'] }),
      ]);
    }
    await Promise.all([runOverview(params), runDepartment(params)]);
  }, [params, runDepartment, runOverview]);

  // 周期变化必须重新请求，不能复用上一个周期的统计缓存。
  useEffect(() => { load(true).catch(() => {}); }, [load]);

  const openEditor = (person: DeptPersonMetrics, metric: EditableMetric) => {
    setEditing({ person, metric });
    setEditValue(String(metric === 'monthlyTask' ? person.monthlyTask : person.taskAchievedBase));
  };

  const saveEdit = async () => {
    if (!editing || saving) return;
    const amount = Number(editValue);
    if (!Number.isFinite(amount) || amount < 0) {
      Toast.show({ content: '请输入不小于 0 的金额' });
      return;
    }
    setSaving(true);
    try {
      if (editing.metric === 'monthlyTask') await dashboardService.updateMonthlyTask(editing.person.userId, amount);
      else await dashboardService.updateTaskAchievedBase(editing.person.userId, amount);
      Toast.show({ icon: 'success', content: editing.metric === 'monthlyTask' ? '本月任务已更新' : '业绩修正已保存' });
      setEditing(null);
      await load(true);
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.message || '保存失败，请重试' });
    } finally {
      setSaving(false);
    }
  };

  const shortcuts = (user?.role === 'admissions'
    ? [
        { key: 'training-leads', label: '学员管理', icon: <TeamOutline />, show: canTrainingLead, color: '#00A88F', bg: '#E8F7F3' },
        { key: 'training-orders', label: '职培订单', icon: <FileOutline />, show: canTrainingOrder, color: '#257BDE', bg: '#EAF2FF' },
        { key: 'approvals', label: '审批流', icon: <CheckOutline />, show: true, color: '#ED8A17', bg: '#FFF3E6' },
        { key: 'resumes', label: '简历库', icon: <UserContactOutline />, show: canResume, color: '#7B59D6', bg: '#F2EEFF' },
      ]
    : [
        { key: 'customers', label: '客户管理', icon: <TeamOutline />, show: canCustomer, color: '#00A88F', bg: '#E8F7F3' },
        { key: 'contracts', label: '合同管理', icon: <FileOutline />, show: canContract, color: '#257BDE', bg: '#EAF2FF' },
        { key: 'approvals', label: '审批流', icon: <CheckOutline />, show: true, color: '#ED8A17', bg: '#FFF3E6' },
        { key: 'resumes', label: '简历库', icon: <UserContactOutline />, show: canResume, color: '#7B59D6', bg: '#F2EEFF' },
      ]).filter((item) => item.show);
  const teamRows = team ? [...team.admissions, ...team.dispatch] : [];
  const ownId = user?.id || user?._id;
  const personalRow = teamRows.find((row) => row.userId === ownId);
  const pageTitle = isAdmin ? '全局概览' : '我的业绩';

  return (
    <div style={{ background: '#f5f7fa', minHeight: '100vh', paddingBottom: 24 }}>
      <NavBar back={null} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 700 }} right={
        <div onClick={() => navigate('/notifications')} style={{ fontSize: 24, cursor: 'pointer' }}>
          <Badge content={unreadCount || null} style={{ '--right': '10%', '--top': '10%' }}><BellOutline /></Badge>
        </div>
      }>业务驾驶舱</NavBar>
      <PullToRefresh onRefresh={async () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-department'] });
        try { await load(true); } catch { Toast.show({ icon: 'fail', content: '刷新失败，请重试' }); }
      }}>
        <div style={{ padding: 16 }}>
          <div style={{ background: 'linear-gradient(135deg, #0A534B, #158F82)', borderRadius: 16, color: '#fff', padding: '24px 20px', marginBottom: 16, boxShadow: '0 8px 20px rgba(21, 143, 130, 0.2)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -20, top: -20, opacity: 0.1, fontSize: 140, pointerEvents: 'none' }}><TeamOutline /></div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, position: 'relative' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, opacity: 0.85, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}><span>{solarText}</span><span style={{ opacity: 0.7 }}>{lunarText}</span></div>
                <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '0.5px', marginTop: 10 }}>{user?.name || '系统用户'}</div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: 0.92 }}><span style={{ fontSize: 14 }}>🔥</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dailyQuote}</span></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, alignSelf: 'stretch' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', border: '2px solid rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: 22, fontWeight: 700, color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                  {avatarUrl ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (user?.name?.charAt(0) || <UserContactOutline />)}
                </div>
                {roleLabel && <div style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap' }}>{roleLabel}</div>}
              </div>
            </div>
          </div>

          {shortcuts.length > 0 && <div style={{ background: '#fff', borderRadius: 16, padding: '20px 16px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}><div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#1a1a1a' }}>常用功能</div><div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>{shortcuts.map((item) => <div key={item.key} onClick={() => navigate(`/${item.key}`)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer' }}><div style={{ width: 52, height: 52, borderRadius: 18, background: item.bg, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>{item.icon}</div><div style={{ fontSize: 13, color: '#333', fontWeight: 500, whiteSpace: 'nowrap' }}>{item.label}</div></div>)}</div></div>}

          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 4 }}>
            {PERIODS.map((item) => <button key={item.key} type="button" onClick={() => setPeriod(item.key)} style={{ border: 0, flexShrink: 0, borderRadius: 16, padding: '7px 13px', color: period === item.key ? '#fff' : '#536072', background: period === item.key ? '#158F82' : '#fff', fontSize: 13 }}>{item.label}</button>)}
          </div>

          {overviewLoading && !overview && <div style={{ textAlign: 'center', padding: 40, background: '#fff', borderRadius: 16 }}><DotLoading color="primary" /></div>}
          {overviewError && !overview && <ErrorBlock status="default" title="业绩数据加载失败" description="请下拉刷新重试" style={{ background: '#fff', borderRadius: 16 }} />}
          {overview && <>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '10px 2px 12px' }}><div style={{ fontSize: 17, fontWeight: 700 }}>{pageTitle}</div><div style={{ fontSize: 12, color: '#7b8494' }}>{PERIODS.find((item) => item.key === period)?.label} · 已签约口径</div></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <MetricCard title="总 GMV" value={money(overview.totalGmv)} detail={`上期 ${money(overview.prevPeriodGmv)}`} tone="#EEF6FF" />
              <MetricCard title="招生 GMV" value={money(overview.admissionsGmv)} detail={growth(overview.admissionsGmvMomGrowth)} tone="#F2FBEA" />
              <MetricCard title="派单 GMV" value={money(overview.dispatchGmvAmount)} detail={growth(overview.dispatchGmvMomGrowth)} tone="#FFF7E7" />
              <MetricCard title="GMV 环比" value={growth(overview.gmvMomGrowth)} detail="与上个等长周期对比" tone="#FFF0F6" />
              <MetricCard title="招生订单量" value={`${overview.enrollmentOrderCount} 单`} detail={`上期 ${overview.prevEnrollmentOrderCount} 单`} tone="#F5F0FF" />
              <MetricCard title="派单订单量" value={`${overview.dispatchOrderCount} 单`} detail={`上期 ${overview.prevDispatchOrderCount} 单`} tone="#EAF6FF" />
            </div>
          </>}

          {team && <div style={{ background: '#fff', borderRadius: 16, padding: '16px', marginTop: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{isAdmin ? '部门业绩' : '我的业绩明细'}</div>
            {isAdmin ? <>{teamRows.length > 0 ? teamRows.map((person) => <PerformanceRow key={person.userId} person={person} canEdit={canEditPerformance} onEdit={openEditor} />) : <div style={{ color: '#8791a1', fontSize: 13, padding: '12px 0' }}>当前周期暂无团队业绩数据</div>}</> : personalRow ? <PerformanceRow person={personalRow} canEdit={canEditPerformance} onEdit={openEditor} /> : <div style={{ color: '#8791a1', fontSize: 13, padding: '12px 0' }}>当前角色暂无部门业绩明细，以上仅展示本人已签约业绩。</div>}
          </div>}
        </div>
      </PullToRefresh>
      <Popup visible={!!editing} onMaskClick={() => !saving && setEditing(null)} onClose={() => !saving && setEditing(null)} bodyStyle={{ borderRadius: '18px 18px 0 0', padding: '20px 16px calc(20px + env(safe-area-inset-bottom))' }}>
        <div style={{ color: '#1a1a1a', fontSize: 18, fontWeight: 700 }}>{editing?.metric === 'monthlyTask' ? '编辑本月任务' : '修正任务达成基准值'}</div>
        <div style={{ marginTop: 8, color: '#667085', fontSize: 13 }}>{editing?.person.userName} · 金额单位：元</div>
        {editing?.metric === 'taskAchievedBase' && <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, color: '#8a5a00', background: '#fff7e6', fontSize: 12, lineHeight: 1.5 }}>任务达成 = 此基准值 + 基准时间后的新签金额 − 退款。</div>}
        <Input type="number" value={editValue} onChange={setEditValue} placeholder="请输入金额" style={{ marginTop: 18, padding: '11px 12px', borderRadius: 10, background: '#f5f7fa' }} />
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <Button block fill="outline" disabled={saving} onClick={() => setEditing(null)}>取消</Button>
          <Button block color="primary" loading={saving} onClick={() => { void saveEdit(); }}>保存</Button>
        </div>
      </Popup>
    </div>
  );
}