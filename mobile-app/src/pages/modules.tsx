import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  NavBar,
  List,
  PullToRefresh,
  InfiniteScroll,
  Empty,
  ErrorBlock,
  DotLoading,
  Tag,
  Popup,
  Tabs,
  Button,
  Space,
  Toast,
} from 'antd-mobile';
import { useInfiniteList, fmtDate, fmtDateTime, fmtMoney } from './_shared';
import { usePermission } from '../hooks/usePermission';
import { useAuthStore } from '../stores/auth';
import type { TrainingOrder, OrderGrab } from '../types/modules';
import {
  insuranceService,
  trainingOrderService,
  trainingClassService,
  courseService,
  orderHallService,
  referralService,
  baobeiService,
  roleService,
  userService,
  notificationService,
} from '../services/modules';

/**
 * 全模块覆盖（Task 4）通用列表页集合。
 * - 所有低频/管理类模块均以命名导出提供，navConfig 通过 lazy(import().then) 懒加载。
 * - 统一使用 SimpleList：下拉刷新（PullToRefresh）+ 上拉加载（InfiniteScroll）+ 点击查看详情（Popup）。
 * - 复杂 PC 表单（表单设计器 / 系统设置 / 电子签编辑）在移动端仅做「查看/轻量操作」版。
 */

// ── 通用工具 ────────────────────────────────────
const keyOf = (x: { _id?: string; id?: string }, i: number): string => x._id || x.id || String(i);

interface Row {
  label: string;
  value: ReactNode;
}

interface SimpleListConfig<T> {
  title: string;
  fetchPage: (page: number, limit: number) => Promise<{ list: T[]; total: number }>;
  primary: (item: T) => ReactNode;
  description?: (item: T) => ReactNode;
  extra?: (item: T) => ReactNode;
  detail?: (item: T) => Row[];
  /** 详情 Popup 内、字段列表之后渲染的操作区/子列表（认领释放、抢单审批、提交记录、学员列表等） */
  detailFooter?: (item: T, helpers: { refresh: () => Promise<void>; close: () => void }) => ReactNode;
  emptyText?: string;
  back?: boolean;
  headerExtra?: ReactNode;
}

function statusTag(status?: string): ReactNode {
  if (!status) return null;
  const danger = ['cancelled', 'rejected', 'failed', 'refunded', '已取消', '已拒绝', '失败'];
  const success = ['active', 'signed', 'approved', 'accepted', 'completed', 'published', '已通过', '已完成', '已发布', '生效中'];
  const color = danger.includes(status) ? 'danger' : success.includes(status) ? 'success' : 'primary';
  return (
    <Tag color={color} fill="outline">
      {status}
    </Tag>
  );
}

/** 通用列表组件：list + 下拉刷新 + 上拉加载 + 详情 Popup */
function SimpleList<T extends { _id?: string; id?: string }>(cfg: SimpleListConfig<T>) {
  const { items, hasMore, error, loadMore, refresh } = useInfiniteList<T>(cfg.fetchPage);
  const [detail, setDetail] = useState<T | null>(null);

  return (
    <div>
      <NavBar back={cfg.back ? undefined : null} style={{ background: '#fff' }}>
        {cfg.title}
      </NavBar>
      {cfg.headerExtra}
      <PullToRefresh onRefresh={refresh}>
        <div style={{ paddingBottom: 70, minHeight: '60vh' }}>
          {error && items.length === 0 ? (
            <ErrorBlock status="default" title="加载失败" description="下拉刷新重试" style={{ padding: 24 }} />
          ) : items.length === 0 && !hasMore ? (
            <Empty description={cfg.emptyText || '暂无数据'} />
          ) : (
            <div style={{ padding: '12px' }}>
              {items.map((it, i) => (
                <div
                  key={keyOf(it, i)}
                  onClick={cfg.detail ? () => setDetail(it) : undefined}
                  style={{
                    background: '#fff',
                    borderRadius: 16,
                    padding: '16px',
                    marginBottom: 12,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                    cursor: cfg.detail ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: cfg.description ? 8 : 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', flex: 1, paddingRight: 12, wordBreak: 'break-all' }}>
                      {cfg.primary(it)}
                    </div>
                    {cfg.extra && (
                      <div style={{ flexShrink: 0 }}>
                        {cfg.extra(it)}
                      </div>
                    )}
                  </div>
                  {cfg.description && (
                    <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>
                      {cfg.description(it)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <InfiniteScroll loadMore={loadMore} hasMore={hasMore}>
            {hasMore ? <DotLoading /> : items.length > 0 ? '没有更多了' : ''}
          </InfiniteScroll>
        </div>
      </PullToRefresh>

      <Popup
        visible={!!detail}
        onMaskClick={() => setDetail(null)}
        onClose={() => setDetail(null)}
        bodyStyle={{ height: '75vh', display: 'flex', flexDirection: 'column', borderTopLeftRadius: 20, borderTopRightRadius: 20, background: '#f5f7fa' }}
      >
        {detail && cfg.detail && (
          <>
            <div style={{ padding: '20px 16px 16px', fontWeight: 600, fontSize: 18, color: '#1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
              详情
              <div onClick={() => setDetail(null)} style={{ color: '#999', padding: 4 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              <div style={{ background: '#fff', borderRadius: 16, padding: '8px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.02)' }}>
                {cfg.detail(detail).map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < cfg.detail!(detail).length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                    <div style={{ color: '#666', fontSize: 14 }}>{r.label}</div>
                    <div style={{ color: '#333', fontSize: 14, fontWeight: 500, textAlign: 'right', flex: 1, marginLeft: 16 }}>{r.value ?? '-'}</div>
                  </div>
                ))}
              </div>
              {cfg.detailFooter && (
                <div style={{ marginTop: 24 }}>
                  {cfg.detailFooter(detail, { refresh, close: () => setDetail(null) })}
                </div>
              )}
            </div>
          </>
        )}
      </Popup>
    </div>
  );
}

function useStaffId(): string {
  const user = useAuthStore((s) => s.user);
  return (user as unknown as { _id?: string; id?: string })?._id || (user as unknown as { id?: string })?.id || '';
}

const sf = (o: Record<string, unknown>, k: string): string => {
  const v = o[k];
  return v == null ? '' : String(v);
};

// ── 接单大厅：抢单列表 + 审批（listGrabs/approveGrab/rejectGrab） ──
function GrabsSection({
  orderId,
  staffId,
  onChanged,
}: {
  orderId: string;
  staffId: string;
  onChanged: () => Promise<void>;
}) {
  const [grabs, setGrabs] = useState<OrderGrab[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGrabs(await orderHallService.listGrabs(orderId, staffId));
    } catch (error: any) {
      setGrabs([]);
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '加载抢单记录失败' });
    } finally {
      setLoading(false);
    }
  }, [orderId, staffId]);
  useEffect(() => {
    load();
  }, [load]);
  const act = async (grabId: string, type: 'approve' | 'reject') => {
    if (acting) return;
    setActing(true);
    try {
      if (type === 'approve') await orderHallService.approveGrab(grabId, staffId);
      else await orderHallService.rejectGrab(grabId, staffId);
      Toast.show({ icon: 'success', content: type === 'approve' ? '已通过' : '已驳回' });
      await load();
      await onChanged();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || `${type === 'approve' ? '通过' : '驳回'}失败，请重试` });
    } finally {
      setActing(false);
    }
  };
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>查看抢单</div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <DotLoading />
        </div>
      ) : grabs.length === 0 ? (
        <Empty description="暂无抢单" imageStyle={{ width: 60 }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {grabs.map((g, i) => (
            <div
              key={g._id || i}
              style={{
                background: '#f9f9f9',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#333', marginBottom: 4 }}>
                  {g.auntName || '阿姨'}
                </div>
                <div style={{ fontSize: 13, color: '#666' }}>
                  {g.auntPhone || ''}{g.remark ? ` · ${g.remark}` : ''}
                </div>
              </div>
              <div>
                {g.status === 'pending' ? (
                  <Space>
                    <Button size="mini" fill="outline" color="danger" disabled={acting} onClick={() => act(g._id, 'reject')} style={{ borderRadius: 12 }}>
                      驳回
                    </Button>
                    <Button size="mini" color="primary" disabled={acting} onClick={() => act(g._id, 'approve')} style={{ borderRadius: 12 }}>
                      通过
                    </Button>
                  </Space>
                ) : (
                  statusTag(g.status)
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 职培订单：学员列表（只读，trainingOrderService.students 全局列表 + search 过滤） ──
function StudentsSection({ order }: { order: TrainingOrder }) {
  const [students, setStudents] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const search = order.studentName || order.customerName || '';
    trainingOrderService
      .students({ page: 1, limit: 20, search })
      .then((r) => alive && setStudents(r.list))
      .catch((error: any) => {
        if (!alive) return;
        setStudents([]);
        Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '加载学员列表失败' });
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [order]);
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>学员列表</div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <DotLoading />
        </div>
      ) : students.length === 0 ? (
        <Empty description="暂无学员" imageStyle={{ width: 60 }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {students.map((s, i) => (
            <div key={sf(s, '_id') || sf(s, 'id') || i} style={{ background: '#f9f9f9', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 4 }}>
                  {sf(s, 'studentName') || sf(s, 'customerName') || sf(s, 'name') || '学员'}
                </div>
                <div style={{ fontSize: 13, color: '#666' }}>
                  {sf(s, 'phone') || '-'}
                  {sf(s, 'courseName') ? ` · ${sf(s, 'courseName')}` : ''}
                  {sf(s, 'certificateProgress') ? ` · ${sf(s, 'certificateProgress')}` : ''}
                </div>
              </div>
              <div style={{ flexShrink: 0, marginLeft: 12 }}>
                {statusTag(sf(s, 'status'))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 保险（大树保） ──────────────────────────────
export function InsurancePage() {
  const fetchPage = useCallback(
    (page: number, limit: number) => insuranceService.listPolicies({ page, limit }),
    [],
  );
  return (
    <SimpleList
      title="保险（大树保）"
      emptyText="暂无保单"
      fetchPage={fetchPage}
      primary={(p) => p.insuredName || p.policyNo || '保单'}
      description={(p) => (
        <span>
          {p.policyNo || '-'}
          {p.mobile ? ` · ${p.mobile}` : ''}
          {p.premium != null ? ` · ${fmtMoney(p.premium)}` : ''}
        </span>
      )}
      extra={(p) => statusTag(p.status)}
      detail={(p) => [
        { label: '被保人', value: p.insuredName },
        { label: '保单号', value: p.policyNo },
        { label: '手机号', value: p.mobile },
        { label: '身份证', value: p.idNumber },
        { label: '产品', value: p.productName },
        { label: '保费', value: fmtMoney(p.premium) },
        { label: '状态', value: p.status },
        { label: '生效日', value: fmtDate(p.startDate) },
        { label: '到期日', value: fmtDate(p.endDate) },
        { label: '创建时间', value: fmtDateTime(p.createdAt) },
      ]}
    />
  );
}

// ── 培训订单/职培合同 ───────────────────────────
export function TrainingOrdersPage() {
  const fetchPage = useCallback(
    (page: number, limit: number) => trainingOrderService.list({ page, limit }),
    [],
  );
  return (
    <SimpleList
      title="职培合同"
      emptyText="暂无订单"
      fetchPage={fetchPage}
      primary={(o) => o.studentName || o.customerName || o.contractNo || '订单'}
      description={(o) => (
        <span>
          {o.contractNo || '-'}
          {o.courseName ? ` · ${o.courseName}` : ''}
          {o.amount != null ? ` · ${fmtMoney(o.amount)}` : ''}
        </span>
      )}
      extra={(o) => statusTag(o.status)}
      detail={(o) => [
        { label: '合同号', value: o.contractNo },
        { label: '学员', value: o.studentName },
        { label: '客户', value: o.customerName },
        { label: '课程', value: o.courseName },
        { label: '金额', value: fmtMoney(o.amount) },
        { label: '状态', value: o.status },
        { label: '创建时间', value: fmtDateTime(o.createdAt) },
      ]}
      detailFooter={(o) => <StudentsSection order={o} />}
    />
  );
}

// ── 培训班级/开班 ───────────────────────────────
export function TrainingClassPage() {
  const fetchPage = useCallback(
    (page: number, limit: number) => trainingClassService.list({ page, limit }),
    [],
  );
  return (
    <SimpleList
      title="开班管理"
      emptyText="暂无班级"
      fetchPage={fetchPage}
      primary={(c) => c.name || '班级'}
      description={(c) => (
        <span>
          {c.trainerName ? `讲师 ${c.trainerName}` : ''}
          {c.memberCount != null ? ` · ${c.memberCount}人` : ''}
        </span>
      )}
      extra={(c) => statusTag(c.status)}
      detail={(c) => [
        { label: '班级', value: c.name },
        { label: '讲师', value: c.trainerName },
        { label: '开班', value: fmtDate(c.startDate) },
        { label: '结束', value: fmtDate(c.endDate) },
        { label: '人数', value: c.memberCount },
        { label: '状态', value: c.status },
      ]}
    />
  );
}

// ── 课程 ────────────────────────────────────────
export function CoursePage() {
  const fetchPage = useCallback(
    (page: number, limit: number) => courseService.list({ page, limit }),
    [],
  );
  return (
    <SimpleList
      title="课程管理"
      emptyText="暂无课程"
      fetchPage={fetchPage}
      primary={(c) => c.title || c.name || '课程'}
      description={(c) => (
        <span>
          {c.category || '-'}
          {c.duration != null ? ` · ${c.duration}分钟` : ''}
          {c.price != null ? ` · ${fmtMoney(c.price)}` : ''}
        </span>
      )}
      extra={(c) => statusTag(c.status)}
      detail={(c) => [
        { label: '标题', value: c.title || c.name },
        { label: '分类', value: c.category },
        { label: '时长', value: c.duration != null ? `${c.duration}分钟` : '-' },
        { label: '价格', value: fmtMoney(c.price) },
        { label: '状态', value: c.status },
      ]}
    />
  );
}

// ── 接单大厅 ────────────────────────────────────
export function OrderHallPage() {
  const staffId = useStaffId();
  const fetchPage = useCallback(
    (page: number, limit: number) => orderHallService.listOrders({ staffId, page, pageSize: limit }),
    [staffId],
  );
  return (
    <SimpleList
      title="接单大厅"
      emptyText="暂无订单"
      fetchPage={fetchPage}
      primary={(o) => o.title || o.serviceType || '订单'}
      description={(o) => (
        <span>
          {o.serviceType || '-'}
          {o.area ? ` · ${o.area}` : ''}
          {o.salaryText ? ` · ${o.salaryText}` : o.salaryBudget != null ? ` · ${fmtMoney(o.salaryBudget)}` : ''}
          {` · 抢单${o.grabCount ?? 0}`}
        </span>
      )}
      extra={(o) => statusTag(o.status)}
      detail={(o) => [
        { label: '标题', value: o.title },
        { label: '服务类型', value: o.serviceType },
        { label: '区域', value: o.area },
        { label: '地址', value: o.address },
        { label: '薪资', value: o.salaryText || fmtMoney(o.salaryBudget) },
        { label: '工作内容', value: o.workContent },
        { label: '期望上户', value: fmtDate(o.expectedStartDate) },
        { label: '抢单数', value: o.grabCount },
        { label: '状态', value: o.status },
        { label: '发布时间', value: fmtDateTime(o.publishedAt || o.createdAt) },
      ]}
      detailFooter={(o, helpers) => (
        <GrabsSection orderId={o._id} staffId={staffId} onChanged={helpers.refresh} />
      )}
    />
  );
}

// ── 推荐返费 ────────────────────────────────────
export function ReferralPage() {
  const staffId = useStaffId();
  const [tab, setTab] = useState('resumes');
  const fetchResumes = useCallback(
    (page: number, limit: number) =>
      referralService.listReferrals({ adminStaffId: staffId, isAdmin: true, page, pageSize: limit }),
    [staffId],
  );
  const fetchReferrers = useCallback(
    (page: number, limit: number) => referralService.listReferrers({ page, pageSize: limit }),
    [],
  );
  return (
    <div>
      <NavBar back={null} style={{ background: '#fff' }}>
        推荐返费
      </NavBar>
      <Tabs activeKey={tab} onChange={setTab} style={{ background: '#fff' }}>
        <Tabs.Tab title="推荐简历" key="resumes" />
        <Tabs.Tab title="推荐人" key="referrers" />
      </Tabs>
      {tab === 'resumes' ? (
        <SimpleList
          key="resumes"
          title=""
          emptyText="暂无推荐简历"
          fetchPage={fetchResumes}
          primary={(r) => r.name || '推荐简历'}
          description={(r) => (
            <span>
              {r.phone || '-'}
              {r.referrerName ? ` · 推荐人 ${r.referrerName}` : ''}
            </span>
          )}
          extra={(r) => statusTag(r.status)}
          detail={(r) => [
            { label: '姓名', value: r.name },
            { label: '电话', value: r.phone },
            { label: '推荐人', value: r.referrerName },
            { label: '状态', value: r.status },
            { label: '审核结果', value: r.reviewResult },
            { label: '创建时间', value: fmtDateTime(r.createdAt) },
          ]}
        />
      ) : (
        <SimpleList
          key="referrers"
          title=""
          emptyText="暂无推荐人"
          fetchPage={fetchReferrers}
          primary={(r) => r.name || '推荐人'}
          description={(r) => (
            <span>
              {r.phone || '-'}
              {r.referralCount != null ? ` · 推荐 ${r.referralCount}` : ''}
            </span>
          )}
          extra={(r) => statusTag(r.approvalStatus)}
          detail={(r) => [
            { label: '姓名', value: r.name },
            { label: '电话', value: r.phone },
            { label: '审核状态', value: r.approvalStatus },
            { label: '推荐数', value: r.referralCount },
            { label: '创建时间', value: fmtDateTime(r.createdAt) },
          ]}
        />
      )}
    </div>
  );
}

// ── 电子签（签署合同：入口指向合同模块） ─────────
// 电子签基于具体合同发起：签署链接 / 签署状态 / 收款均在「合同详情」内操作。
export function EsignPage() {
  const navigate = useNavigate();
  return (
    <div>
      <NavBar back={null} style={{ background: '#fff' }}>
        电子签
      </NavBar>
      <div style={{ padding: 12 }}>
        <List header="签署合同">
          <List.Item description="签署链接、签署状态同步均在对应合同详情内操作">
            电子签基于具体合同发起
          </List.Item>
        </List>
        <Button
          block
          color="primary"
          style={{ marginTop: 16 }}
          onClick={() => navigate('/contracts')}
        >
          前往合同列表
        </Button>
        <div style={{ padding: 16, color: '#999', fontSize: 13 }}>
          进入合同详情页后，在「签署合同（电子签）」区域可获取各签署方链接、
          打开签署页并同步最新签署状态。
        </div>
      </div>
    </div>
  );
}

// ── 褓贝：文章 / Banner（Tabs） ─────────────────
export function BaobeiPage() {
  const [tab, setTab] = useState('articles');
  const fetchArticles = useCallback(
    (page: number, limit: number) => baobeiService.listArticles({ page, limit }),
    [],
  );
  const fetchBanners = useCallback(
    (page: number, limit: number) => baobeiService.listBanners({ page, limit }),
    [],
  );
  return (
    <div>
      <NavBar back={null} style={{ background: '#fff' }}>
        褓贝后台
      </NavBar>
      <Tabs activeKey={tab} onChange={setTab} style={{ background: '#fff' }}>
        <Tabs.Tab title="文章" key="articles" />
        <Tabs.Tab title="Banner" key="banners" />
      </Tabs>
      {tab === 'articles' ? (
        <SimpleList
          key="articles"
          title=""
          emptyText="暂无文章"
          fetchPage={fetchArticles}
          primary={(a) => a.title || '文章'}
          description={(a) => (
            <span>
              {a.category || '-'}
              {a.viewCount != null ? ` · ${a.viewCount}阅读` : ''}
            </span>
          )}
          extra={(a) => statusTag(a.status)}
          detail={(a) => [
            { label: '标题', value: a.title },
            { label: '分类', value: a.category },
            { label: '阅读', value: a.viewCount },
            { label: '状态', value: a.status },
            { label: '创建时间', value: fmtDateTime(a.createdAt) },
          ]}
        />
      ) : (
        <SimpleList
          key="banners"
          title=""
          emptyText="暂无 Banner"
          fetchPage={fetchBanners}
          primary={(b) => b.title || 'Banner'}
          description={(b) => <span>{b.sort != null ? `排序 ${b.sort}` : '—'}</span>}
          extra={(b) => statusTag(b.status)}
          detail={(b) => [
            { label: '标题', value: b.title },
            { label: '排序', value: b.sort },
            { label: '状态', value: b.status },
            { label: '创建时间', value: fmtDateTime(b.createdAt) },
          ]}
        />
      )}
    </div>
  );
}

// ── 角色管理（只读列表） ────────────────────────
export function RolesPage() {
  const fetchPage = useCallback(
    (page: number, limit: number) => roleService.list({ page, limit }),
    [],
  );
  return (
    <SimpleList
      title="角色管理"
      emptyText="暂无角色"
      fetchPage={fetchPage}
      primary={(r) => r.name || '角色'}
      description={(r) => (
        <span>{r.permissions ? `${r.permissions.length} 项权限` : r.description || '—'}</span>
      )}
      extra={(r) => (r.isSystem ? <Tag color="primary">系统</Tag> : null)}
      detail={(r) => [
        { label: '名称', value: r.name },
        { label: '说明', value: r.description },
        { label: '权限数', value: r.permissions?.length },
        { label: '系统角色', value: r.isSystem ? '是' : '否' },
      ]}
    />
  );
}

// ── 用户管理（只读列表） ────────────────────────
export function UsersPage() {
  const fetchPage = useCallback(
    (page: number, limit: number) => userService.list({ page, limit }),
    [],
  );
  return (
    <SimpleList
      title="用户管理"
      emptyText="暂无用户"
      fetchPage={fetchPage}
      primary={(u) => u.name || u.username || '用户'}
      description={(u) => (
        <span>
          {u.username || '-'}
          {u.role ? ` · ${u.role}` : ''}
          {u.phone ? ` · ${u.phone}` : ''}
        </span>
      )}
      extra={(u) => {
        const active = u.isActive ?? u.status === 'active';
        return (
          <Tag color={active ? 'success' : 'default'} fill="outline">
            {active ? '启用' : '停用'}
          </Tag>
        );
      }}
      detail={(u) => [
        { label: '姓名', value: u.name },
        { label: '账号', value: u.username },
        { label: '角色', value: u.role },
        { label: '手机号', value: u.phone },
        { label: '状态', value: (u.isActive ?? u.status === 'active') ? '启用' : '停用' },
        { label: '创建时间', value: fmtDateTime(u.createdAt) },
      ]}
    />
  );
}

// ── 系统设置（移动端只读/说明版） ───────────────
export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const roles = useAuthStore((s) => s.roles);
  const permissions = useAuthStore((s) => s.permissions);
  const env = import.meta.env.MODE;
  const apiBase = import.meta.env.VITE_API_BASE || 'https://crm.andejiazheng.com/api';
  const isAdmin = permissions.includes('*');
  return (
    <div>
      <NavBar back={null} style={{ background: '#fff' }}>
        系统设置
      </NavBar>
      <div style={{ padding: 12 }}>
        <List header="当前登录">
          <List.Item extra={user?.name || '-'}>姓名</List.Item>
          <List.Item extra={(user as { username?: string })?.username || '-'}>账号</List.Item>
          <List.Item extra={roles.join('/') || user?.role || '-'}>角色</List.Item>
          <List.Item extra={isAdmin ? '全部（*）' : `${permissions.length} 项`}>权限</List.Item>
        </List>
        <List header="运行环境">
          <List.Item extra="安得家政 CRM">应用名称</List.Item>
          <List.Item extra="员工移动端">端类型</List.Item>
          <List.Item extra="Android">平台</List.Item>
          <List.Item extra={env}>构建环境</List.Item>
          <List.Item extra={<span style={{ fontSize: 12, wordBreak: 'break-all' }}>{apiBase}</span>}>接口地址</List.Item>
        </List>
        <div style={{ padding: 16, color: '#999', fontSize: 13, lineHeight: 1.8 }}>
          系统设置（权限矩阵、参数配置、集成密钥等）涉及复杂 PC 表单，
          请到 Web 后台完成配置。移动端仅提供查看类能力。
        </div>
      </div>
    </div>
  );
}

// ── 通知中心 ────────────────────────────────────
export function NotificationsPage() {
  const fetchPage = useCallback(
    (page: number, limit: number) => notificationService.list({ page, limit }),
    [],
  );
  const [markingAll, setMarkingAll] = useState(false);
  const doMarkAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await notificationService.markAllRead();
      Toast.show({ icon: 'success', content: '已全部标为已读' });
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '全部标记已读失败' });
    } finally {
      setMarkingAll(false);
    }
  };
  return (
    <SimpleList
      title="通知中心"
      emptyText="暂无通知"
      fetchPage={fetchPage}
      headerExtra={
        <div style={{ padding: '0 12px 8px', textAlign: 'right' }}>
          <Button size="mini" fill="outline" loading={markingAll} disabled={markingAll} onClick={doMarkAll}>
            全部已读
          </Button>
        </div>
      }
      primary={(n) => (n.title as string) || (n.content as string) || '通知'}
      description={(n) => (
        <span>
          {(n.content as string) || '-'}
          {n.createdAt ? ` · ${fmtDateTime(n.createdAt as string)}` : ''}
        </span>
      )}
      extra={(n) =>
        n.isRead ? (
          <Tag color="default" fill="outline">已读</Tag>
        ) : (
          <Tag color="primary" fill="solid">未读</Tag>
        )
      }
      detail={(n) => [
        { label: '标题', value: n.title as string },
        { label: '内容', value: n.content as string },
        { label: '类型', value: n.type as string },
        { label: '状态', value: n.isRead ? '已读' : '未读' },
        { label: '时间', value: fmtDateTime(n.createdAt as string) },
      ]}
    />
  );
}

// ── 支付/收款（收钱：入口指向合同模块） ──────────
// 收款基于具体合同：生成聚合收款码 / 查看收款流水均在「合同详情」内操作。
export function PaymentPage() {
  const navigate = useNavigate();
  const canView = usePermission('contract:view');
  return (
    <div>
      <NavBar back={null} style={{ background: '#fff' }}>
        支付/收款
      </NavBar>
      <div style={{ padding: 12 }}>
        <List header="收款指引">
          <List.Item description="进入合同详情，在「收款」区域生成支付宝聚合收款码给客户扫码支付">
            合同收款
          </List.Item>
          <List.Item description="保险保单支付请在「保险」模块内对应保单发起">保单支付</List.Item>
        </List>
        {canView ? (
          <Button
            block
            color="primary"
            style={{ marginTop: 16 }}
            onClick={() => navigate('/contracts')}
          >
            前往合同列表
          </Button>
        ) : (
          <div style={{ padding: 16, color: '#999', fontSize: 13 }}>
            如需生成收款码 / 查看收款明细，请联系管理员开通合同查看权限。
          </div>
        )}
      </div>
    </div>
  );
}
