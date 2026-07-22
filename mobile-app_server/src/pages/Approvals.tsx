import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NavBar, Tabs, PullToRefresh, InfiniteScroll, Empty, ErrorBlock, DotLoading, Button, TextArea, Steps, Toast } from 'antd-mobile';
import { HandPayCircleOutline, RedoOutline } from 'antd-mobile-icons';
import { approvalService } from '../services/approvalService';
import { useApi } from '../hooks/useApi';
import { useInfiniteList, fmtDateTime, fmtMoney, APPROVAL_STATUS_TEXT, APPROVAL_STATUS_COLOR } from './_shared';
import { CACHE_TIME } from '../lib/queryClient';
import { useAuthStore } from '../stores/auth';
import { normalizeRole } from '../utils/permission';
import type { ApprovalInstance, ContractDeletionApproval } from '../types';

const { Step } = Steps;
type View = { type: 'list' } | { type: 'approvalDetail'; id: string } | { type: 'deletionDetail'; item: ContractDeletionApproval };
const cardStyle = { background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' };
const statusText = (status?: string): string => (status && APPROVAL_STATUS_TEXT[status]) || status || '-';
const statusColor = (status?: string): string => APPROVAL_STATUS_COLOR[status || ''] || 'default';
const businessText = (type?: string): string => {
  const labels: Record<string, string> = { contract_refund: '合同退款', training_refund: '培训退款', salary_distribution: '工资发放' };
  return labels[type || ''] || type || '通用审批';
};
const asRecord = (value: unknown): Record<string, unknown> | null => typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
const errorMessage = (error: unknown): string => {
  const root = asRecord(error);
  const response = asRecord(root?.response);
  const responseData = asRecord(response?.data);
  const message = responseData?.message || root?.message;
  return typeof message === 'string' && message.trim() ? message : '操作失败';
};
const sameUser = (left?: string, right?: string): boolean => !!left && !!right && String(left) === String(right);

function StatusPill({ status }: { status?: string }) {
  return <span className={`approval-status-pill approval-status-${statusColor(status)}`}>{statusText(status)}</span>;
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return <div className="approval-info-row"><span className="approval-info-label">{label}</span><span className="approval-info-value">{value || '-'}</span></div>;
}

function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return <section style={{ ...cardStyle, overflow: 'hidden', marginBottom: 16 }}><div className="approval-section-title">{title}</div><div style={{ padding: '4px 16px 12px' }}>{children}</div></section>;
}

function ActionButtons({ acting, comment, onCommentChange, onAction, admin = false }: {
  acting: boolean;
  comment: string;
  onCommentChange: (value: string) => void;
  onAction: (action: 'approve' | 'reject') => void;
  admin?: boolean;
}) {
  return <div className="approval-action-panel">
    <div className="approval-panel-title">{admin ? '管理员强制处理' : '审批处理'}</div>
    <div className="approval-comment-box"><TextArea placeholder={admin ? '请输入强制处理意见（拒绝必填）' : '请输入审批意见（拒绝必填）'} value={comment} onChange={onCommentChange} disabled={acting} rows={3} maxLength={200} /></div>
    <div className="approval-action-row">
      <Button block color="danger" className="approval-action-button approval-action-button-danger" loading={acting} disabled={acting} onClick={() => onAction('reject')}>{admin ? '强制拒绝' : '拒绝'}</Button>
      <Button block color="primary" className="approval-action-button approval-action-button-primary" loading={acting} disabled={acting} onClick={() => onAction('approve')}>{admin ? '强制通过' : '通过'}</Button>
    </div>
  </div>;
}

function ApprovalDetailView({ id, onBack, onDone }: { id: string; onBack: () => void; onDone: () => void }) {
  const user = useAuthStore((state) => state.user);
  const { data, loading, error, run } = useApi<ApprovalInstance>(approvalService.getApprovalDetail);
  const [comment, setComment] = useState('');
  const [acting, setActing] = useState(false);
  const role = normalizeRole(user?.role);
  const isAdmin = role === 'admin' || role === 'manager';
  const currentUserId = user?.id || user?._id;
  useEffect(() => { run(id).catch(() => {}); }, [id, run]);

  const pending = data?.status === 'pending';
  const currentNode = data ? data.nodes[data.currentNodeIndex] : undefined;
  const canOperate = !!data && !!currentNode && pending && currentNode.status === 'pending' && sameUser(currentNode.approverUserId, currentUserId);
  const canAdminSkip = !!data && pending && isAdmin && !canOperate;
  const canCancel = !!data && pending && sameUser(data.applicantId, currentUserId);
  const formData = data?.formData || {};

  const act = async (action: 'approve' | 'reject', admin = false) => {
    if (action === 'reject' && !comment.trim()) { Toast.show({ content: '拒绝请填写意见' }); return; }
    if (admin && !canAdminSkip) { Toast.show({ content: '无权执行管理员操作' }); return; }
    if (!admin && !canOperate) { Toast.show({ content: '当前用户不是本节点审批人' }); return; }
    setActing(true);
    try {
      if (admin) await approvalService.adminSkipApproval(id, action, comment.trim() || undefined);
      else if (action === 'approve') await approvalService.approveApproval(id, comment.trim() || undefined);
      else await approvalService.rejectApproval(id, comment.trim());
      Toast.show({ icon: 'success', content: admin ? '当前节点已强制处理' : action === 'approve' ? '已通过' : '已驳回' });
      onDone();
    } catch (caught: unknown) { Toast.show({ icon: 'fail', content: errorMessage(caught) }); }
    finally { setActing(false); }
  };

  const cancel = async () => {
    if (!canCancel) { Toast.show({ content: '只有申请人可以撤销进行中的审批' }); return; }
    setActing(true);
    try { await approvalService.cancelApproval(id); Toast.show({ icon: 'success', content: '审批已撤销' }); onDone(); }
    catch (caught: unknown) { Toast.show({ icon: 'fail', content: errorMessage(caught) }); }
    finally { setActing(false); }
  };

  return <div style={{ background: '#f5f7fa', minHeight: '100vh', paddingBottom: 60 }}>
    <NavBar onBack={onBack} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}>审批详情</NavBar>
    {loading && !data && <div style={{ textAlign: 'center', padding: 24 }}><DotLoading color="primary" /></div>}
    {error && !data && <ErrorBlock status="default" title="加载失败" description="返回重试" style={{ padding: 24 }} />}
    {data && <div style={{ padding: 16 }}>
      <section style={{ ...cardStyle, padding: 20, marginBottom: 16 }}><div style={{ color: '#158F82', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{businessText(data.businessType)}</div><div style={{ fontSize: 20, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.4 }}>{data.title}</div><div style={{ marginTop: 12 }}><StatusPill status={data.status} /></div></section>
      <InfoSection title="申请信息">
        <InfoRow label="申请人" value={data.applicantName} /><InfoRow label="类型" value={data.templateName || businessText(data.businessType)} /><InfoRow label="合同号" value={formData.contractNumber} /><InfoRow label="客户" value={formData.customerName} />
        {data.businessType === 'salary_distribution' ? <>
          <InfoRow label="工资金额" value={<strong className="approval-money">{fmtMoney(formData.salaryAmount)}</strong>} /><InfoRow label="阿姨姓名" value={formData.workerName} /><InfoRow label="电话" value={formData.workerPhone} /><InfoRow label="银行卡号" value={formData.bankCardNumber} /><InfoRow label="开户行" value={formData.bankName} /><InfoRow label="服务费" value={formData.serviceFeeCharged ? fmtMoney(formData.serviceFeeAmount) : '不收取'} /><InfoRow label="备注" value={formData.remark} />
        </> : <>
          <InfoRow label="退款金额" value={<strong className="approval-money">{fmtMoney(formData.amount)}</strong>} /><InfoRow label="合同总额" value={fmtMoney(formData.contractTotalAmount)} /><InfoRow label="已退金额" value={fmtMoney(formData.alreadyRefunded)} /><InfoRow label="原因" value={formData.reason} />
        </>}
        <InfoRow label="提交时间" value={fmtDateTime(data.createdAt)} />
      </InfoSection>
      {data.executionResult?.error && <InfoSection title="执行错误"><div style={{ color: '#d9363e', fontSize: 14, lineHeight: 1.6 }}>{data.executionResult.error}</div></InfoSection>}
      <InfoSection title="审批流程"><Steps direction="vertical" current={data.currentNodeIndex}>{(data.nodes || []).map((node, index) => <Step key={`${node.order}-${index}`} title={`${node.name || '审批'}（${node.approverName || '—'}）`} description={`${statusText(node.status)}${node.comment ? ` · ${node.comment}` : ''}${node.operatedAt ? ` · ${fmtDateTime(node.operatedAt)}` : ''}`} status={node.status === 'approved' ? 'finish' : node.status === 'rejected' ? 'error' : index === data.currentNodeIndex ? 'process' : 'wait'} />)}</Steps></InfoSection>
      {canOperate && <ActionButtons acting={acting} comment={comment} onCommentChange={setComment} onAction={(action) => void act(action)} />}
      {canAdminSkip && <ActionButtons admin acting={acting} comment={comment} onCommentChange={setComment} onAction={(action) => void act(action, true)} />}
      {canCancel && <Button block className="approval-cancel-button" loading={acting} disabled={acting} onClick={() => void cancel()}>撤销申请</Button>}
    </div>}
  </div>;
}

function DeletionDetailView({ item, onBack, onDone }: { item: ContractDeletionApproval; onBack: () => void; onDone: () => void }) {
  const user = useAuthStore((state) => state.user);
  const [comment, setComment] = useState('');
  const [acting, setActing] = useState(false);
  const role = normalizeRole(user?.role);
  const canOperate = role === 'admin' && item.status === 'pending' && (user?.username === 'sunxuebo' || user?.name === '孙学博');
  const contractNumber = item.contractId?.contractNumber || item.contractNumber;
  const act = async (approve: boolean) => {
    if (!canOperate) { Toast.show({ content: '仅孙学博可以审批合同删除申请' }); return; }
    if (!approve && !comment.trim()) { Toast.show({ content: '拒绝请填写意见' }); return; }
    setActing(true);
    try {
      if (approve) await approvalService.approveContractDeletion(item._id, comment.trim() || undefined);
      else await approvalService.rejectContractDeletion(item._id, comment.trim());
      Toast.show({ icon: 'success', content: approve ? '已通过' : '已驳回' }); onDone();
    } catch (caught: unknown) { Toast.show({ icon: 'fail', content: errorMessage(caught) }); }
    finally { setActing(false); }
  };
  return <div style={{ background: '#f5f7fa', minHeight: '100vh', paddingBottom: 60 }}>
    <NavBar onBack={onBack} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}>合同删除审批</NavBar>
    <div style={{ padding: 16 }}>
      <section style={{ ...cardStyle, padding: 20, marginBottom: 16 }}><div style={{ color: '#158F82', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>合同删除</div><div style={{ fontSize: 20, fontWeight: 600, color: '#1a1a1a' }}>删除合同 {contractNumber || '-'}</div><div style={{ marginTop: 12 }}><StatusPill status={item.status} /></div></section>
      <InfoSection title="申请详情"><InfoRow label="合同号" value={contractNumber} /><InfoRow label="客户" value={item.contractId?.customerName} /><InfoRow label="阿姨" value={item.contractId?.workerName} /><InfoRow label="申请人" value={item.requestedByName || item.requestedBy?.name} /><InfoRow label="删除原因" value={item.reason} /><InfoRow label="申请时间" value={fmtDateTime(item.createdAt)} /><InfoRow label="审批状态" value={<StatusPill status={item.status} />} /><InfoRow label="审批人" value={item.approvedByName || item.approvedBy?.name} /><InfoRow label="审批时间" value={item.approvedAt ? fmtDateTime(item.approvedAt) : '-'} /><InfoRow label="审批意见" value={item.approvalComment} /></InfoSection>
      {canOperate && <ActionButtons acting={acting} comment={comment} onCommentChange={setComment} onAction={(action) => void act(action === 'approve')} />}
    </div>
  </div>;
}

function InfiniteTab<T>({ fetchPage, renderItem, emptyText, cacheKey }: { fetchPage: (page: number, limit: number) => Promise<{ list: T[]; total: number }>; renderItem: (item: T) => ReactNode; emptyText: string; cacheKey: unknown[] }) {
  const { items, hasMore, error, loadMore, refresh } = useInfiniteList<T>(fetchPage, 10, { cacheKey, staleTime: CACHE_TIME.list.staleTime });
  return <PullToRefresh onRefresh={refresh}><div style={{ padding: '12px 16px 80px', minHeight: '50vh' }}>{error && items.length === 0 ? <ErrorBlock status="default" title="加载失败" description="下拉刷新重试" /> : items.length === 0 && !hasMore ? <Empty description={emptyText} /> : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{items.map(renderItem)}</div>}<InfiniteScroll loadMore={loadMore} hasMore={hasMore}>{hasMore ? <DotLoading /> : items.length > 0 ? <span style={{ color: '#999', fontSize: 12 }}>已到底部</span> : ''}</InfiniteScroll></div></PullToRefresh>;
}

function QuickStart({ onNavigate }: { onNavigate: (path: string, hint: 'refund' | 'salary') => void }) {
  const entries = [
    { title: '申请合同退款', description: '选择服务中的家政合同后提交', path: '/contracts', hint: 'refund' as const, icon: <RedoOutline />, color: '#d9363e', background: '#fff1f0' },
    { title: '申请培训退款', description: '选择学习中的职培合同后提交', path: '/training-orders', hint: 'refund' as const, icon: <RedoOutline />, color: '#d46b08', background: '#fff7e8' },
    { title: '申请阿姨工资发放', description: '选择服务中的家政合同后提交', path: '/contracts', hint: 'salary' as const, icon: <HandPayCircleOutline />, color: '#158F82', background: '#eaf7f4' },
  ];
  return <section style={{ margin: '12px 16px 0', padding: 14, borderRadius: 16, background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
    <div style={{ color: '#1a1a1a', fontSize: 15, fontWeight: 700 }}>快捷发起审批</div>
    <div style={{ color: '#7a8696', fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>请选择对应业务单据，审核通过后才会执行退款或工资发放。</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      {entries.map((entry) => <button key={`${entry.path}-${entry.hint}`} type="button" onClick={() => onNavigate(entry.path, entry.hint)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '8px 10px', border: '1px solid #f0f2f3', borderRadius: 12, background: '#fff', color: '#1a1a1a', font: 'inherit', textAlign: 'left' }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, flexShrink: 0, borderRadius: 10, color: entry.color, background: entry.background, fontSize: 20 }}>{entry.icon}</span><span style={{ minWidth: 0, flex: 1 }}><span style={{ display: 'block', fontSize: 14, fontWeight: 650 }}>{entry.title}</span><span style={{ display: 'block', overflow: 'hidden', color: '#8a93a5', fontSize: 12, textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{entry.description}</span></span><span aria-hidden="true" style={{ color: '#b0b8c3', fontSize: 22 }}>›</span></button>)}
    </div>
  </section>;
}

function ListView({ onOpenApproval, onOpenDeletion, onChanged, reloadKey, initialTab = 'pending' }: { onOpenApproval: (id: string) => void; onOpenDeletion: (item: ContractDeletionApproval) => void; onChanged: () => void; reloadKey: number; initialTab?: string }) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [tab, setTab] = useState(initialTab);
  const [deletionStatus, setDeletionStatus] = useState('pending');
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const role = normalizeRole(user?.role);
  const isAdmin = role === 'admin' || role === 'manager';
  const canViewDeletion = role === 'admin';
  const currentUserId = user?.id || user?._id;
  useEffect(() => { if (tab === 'deletion' && !canViewDeletion) setTab('pending'); }, [canViewDeletion, tab]);
  const pendingFetch = useCallback(async (page: number, limit: number) => { const result = await approvalService.getPendingForMe(page, limit); return { list: result.items || [], total: result.total || 0 }; }, []);
  const appliedFetch = useCallback(async (page: number, limit: number) => { const result = await approvalService.getMyApplied(page, limit); return { list: result.items || [], total: result.total || 0 }; }, []);
  const allFetch = useCallback(async (page: number, limit: number) => { const result = await approvalService.getAllApprovals(page, limit); return { list: result.items || [], total: result.total || 0 }; }, []);
  const deletionFetch = useCallback(async (page: number, limit: number) => { const result = await approvalService.getContractDeletionApprovals(deletionStatus, page, limit); return { list: result.approvals || [], total: result.total || 0 }; }, [deletionStatus]);
  const openQuickStart = (path: string, hint: 'refund' | 'salary') => navigate(path, { state: { initialStatus: 'active', approvalHint: hint } });
  const cancel = async (approval: ApprovalInstance) => {
    if (approval.status !== 'pending' || !sameUser(approval.applicantId, currentUserId)) { Toast.show({ content: '只有申请人可以撤销进行中的审批' }); return; }
    setCancelingId(approval._id);
    try { await approvalService.cancelApproval(approval._id); Toast.show({ icon: 'success', content: '审批已撤销' }); onChanged(); }
    catch (caught: unknown) { Toast.show({ icon: 'fail', content: errorMessage(caught) }); }
    finally { setCancelingId(null); }
  };
  const renderApproval = (approval: ApprovalInstance) => {
    const node = approval.status === 'pending' ? approval.nodes?.[approval.currentNodeIndex] : undefined;
    const summary = approval.businessType === 'salary_distribution' ? `${fmtMoney(approval.formData?.salaryAmount)} · ${approval.formData?.workerName || '阿姨未填写'}` : approval.formData?.amount != null ? `金额 ${fmtMoney(approval.formData.amount)}` : approval.formData?.reason || '无摘要';
    const canCancel = tab === 'applied' && approval.status === 'pending' && sameUser(approval.applicantId, currentUserId);
    return <div key={approval._id} className="approval-list-card" onClick={() => onOpenApproval(approval._id)}>
      <div className="approval-card-heading"><div style={{ minWidth: 0 }}><div className="approval-card-type">{businessText(approval.businessType)}</div><div className="approval-card-title">{approval.title || approval.formData?.contractNumber || '审批申请'}</div></div><StatusPill status={approval.status} /></div>
      <div className="approval-card-summary">{summary}</div>
      <div className="approval-card-meta"><span>申请人：{approval.applicantName || '-'}</span><span>当前节点：{node ? `${node.name} · ${node.approverName || '待处理'}` : approval.status === 'pending' ? '待处理' : '已结束'}</span><span>{fmtDateTime(approval.createdAt)}</span></div>
      {canCancel && <div className="approval-card-footer"><Button className="approval-cancel-button" loading={cancelingId === approval._id} disabled={cancelingId !== null} onClick={(event) => { event.stopPropagation(); void cancel(approval); }}>撤销申请</Button></div>}
    </div>;
  };
  const renderDeletion = (approval: ContractDeletionApproval) => <div key={approval._id} className="approval-list-card" onClick={() => onOpenDeletion(approval)}>
    <div className="approval-card-heading"><div style={{ minWidth: 0 }}><div className="approval-card-type">合同删除</div><div className="approval-card-title">删除合同 {approval.contractId?.contractNumber || approval.contractNumber || '-'}</div></div><StatusPill status={approval.status} /></div>
    <div className="approval-card-summary">客户：{approval.contractId?.customerName || '-'} · 阿姨：{approval.contractId?.workerName || '-'}</div><div className="approval-card-meta"><span>申请人：{approval.requestedByName || approval.requestedBy?.name || '-'}</span><span>原因：{approval.reason || '-'}</span><span>{fmtDateTime(approval.createdAt)}</span></div>
  </div>;
  return <div style={{ background: '#f5f7fa', minHeight: '100vh' }}>
    <NavBar onBack={() => navigate('/workbench')} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}>审批流程</NavBar>
    <Tabs activeKey={tab} onChange={setTab} style={{ background: '#fff', '--title-font-size': '14px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}><Tabs.Tab title="待我审批" key="pending" /><Tabs.Tab title="我发起的" key="applied" />{isAdmin && <Tabs.Tab title="全部审批" key="all" />}{canViewDeletion && <Tabs.Tab title="合同删除" key="deletion" />}</Tabs>
    <QuickStart onNavigate={openQuickStart} />
    {tab === 'pending' && <InfiniteTab key={`pending-${reloadKey}`} cacheKey={['approvals-pending']} fetchPage={pendingFetch} renderItem={renderApproval} emptyText="暂无待办审批" />}
    {tab === 'applied' && <InfiniteTab key={`applied-${reloadKey}`} cacheKey={['approvals-applied']} fetchPage={appliedFetch} renderItem={renderApproval} emptyText="暂无发起的审批" />}
    {tab === 'all' && isAdmin && <InfiniteTab key={`all-${reloadKey}`} cacheKey={['approvals-all']} fetchPage={allFetch} renderItem={renderApproval} emptyText="暂无审批记录" />}
    {tab === 'deletion' && canViewDeletion && <><Tabs activeKey={deletionStatus} onChange={setDeletionStatus} className="approval-sub-tabs"><Tabs.Tab title="待审批" key="pending" /><Tabs.Tab title="已批准" key="approved" /><Tabs.Tab title="已拒绝" key="rejected" /></Tabs><InfiniteTab key={`deletion-${reloadKey}-${deletionStatus}`} cacheKey={['approvals-deletion', deletionStatus]} fetchPage={deletionFetch} renderItem={renderDeletion} emptyText="暂无合同删除审批" /></>}
  </div>;
}

export default function Approvals() {
  const [view, setView] = useState<View>({ type: 'list' });
  const [reloadKey, setReloadKey] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const approvalId = searchParams.get('id');
  const requestedTab = searchParams.get('tab');
  useEffect(() => {
    if (!approvalId) return;
    setView({ type: 'approvalDetail', id: approvalId });
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
  }, [approvalId, searchParams, setSearchParams]);
  if (view.type === 'approvalDetail') return <ApprovalDetailView id={view.id} onBack={() => setView({ type: 'list' })} onDone={() => { setReloadKey((key) => key + 1); setView({ type: 'list' }); }} />;
  if (view.type === 'deletionDetail') return <DeletionDetailView item={view.item} onBack={() => setView({ type: 'list' })} onDone={() => { setReloadKey((key) => key + 1); setView({ type: 'list' }); }} />;
  return <ListView initialTab={requestedTab === 'deletion' ? 'deletion' : 'pending'} reloadKey={reloadKey} onChanged={() => setReloadKey((key) => key + 1)} onOpenApproval={(id) => setView({ type: 'approvalDetail', id })} onOpenDeletion={(item) => setView({ type: 'deletionDetail', item })} />;
}