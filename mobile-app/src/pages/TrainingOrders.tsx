import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Button,
  Dialog,
  DotLoading,
  Empty,
  ErrorBlock,
  Grid,
  InfiniteScroll,
  Input,
  NavBar,
  Popup,
  PullToRefresh,
  SearchBar,
  Space,
  Tabs,
  Toast,
} from 'antd-mobile';
import { AddOutline, DeleteOutline, DownlandOutline, EyeOutline, RedoOutline } from 'antd-mobile-icons';
import { PaymentConfigPopup } from './Contract/PaymentConfigPopup';
import { TrainingContractForm } from './TrainingContractForm';
import { approvalService } from '../services/approvalService';
import { contractService } from '../services/contractService';
import { trainingOrderService } from '../services/modules';
import { usePermission } from '../hooks/usePermission';
import { useAuthStore } from '../stores/auth';
import { normalizeRole } from '../utils/permission';
import { fmtDateTime, useInfiniteList } from './_shared';
import type { Contract, PaymentRecordItem } from '../types';
import type { TrainingOrder, TrainingOrderDetail, TrainingOrderSignUrl } from '../types/modules';

const STATUS_STYLE: Record<string, { text: string; bg: string; color: string }> = {
  signing: { text: '签约中', bg: '#eaf2ff', color: '#3478e5' },
  signed: { text: '已签约', bg: '#e5f8f5', color: '#158f82' },
  active: { text: '学习中', bg: '#e5f8f5', color: '#158f82' },
  graduated: { text: '已毕业', bg: '#e9f8e9', color: '#20a65a' },
  refunded: { text: '已退款', bg: '#fff0ee', color: '#e8564b' },
};
const FILTER_STATUS_OPTIONS = [
  { label: '签约中', value: 'signing' },
  { label: '已签约', value: 'signed' },
  { label: '学习中', value: 'active' },
  { label: '已毕业', value: 'graduated' },
  { label: '已退款', value: 'refunded' },
];
const FILTER_SOURCE_OPTIONS = ['美团', '抖音', '快手', '小红书', '转介绍', '幼亲舒', 'BOSS', 'BOSS直聘', '其他'];
type ListFilters = { status?: string; leadSource?: string; certificateStatus?: 'applied' | 'unapplied'; startDate?: string; endDate?: string };

const errorText = (error: any, fallback: string) => error?.response?.data?.message || error?.message || fallback;
const statusOf = (order: Pick<TrainingOrder, 'displayStatusCode' | 'contractStatus'>) => order.displayStatusCode || order.contractStatus || 'signing';
const statusPill = (code?: string, text?: string) => {
  const item = STATUS_STYLE[code || 'signing'] || STATUS_STYLE.signing;
  return <span style={{ flexShrink: 0, borderRadius: 20, padding: '3px 8px', fontSize: 11, fontWeight: 600, background: item.bg, color: item.color }}>{text || item.text}</span>;
};
const maskId = (id?: string | null) => id && id.length > 10 ? `${id.slice(0, 6)}****${id.slice(-4)}` : id || '-';
const money = (value?: string | null) => value || '-';
const openExternal = (url?: string | null) => {
  if (!url) {
    Toast.show({ content: '暂无可用链接' });
    return;
  }
  window.open(url, '_blank');
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}><div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{title}</div>{children}</section>;
}

function InfoGrid({ rows }: { rows: Array<{ label: string; value?: React.ReactNode; wide?: boolean; color?: string }> }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px 12px' }}>{rows.map((row) => <div key={row.label} style={{ gridColumn: row.wide ? 'span 2' : undefined, minWidth: 0 }}><div style={{ fontSize: 12, color: '#8a93a5', marginBottom: 4 }}>{row.label}</div><div style={{ color: row.color || '#1a1a1a', fontSize: 14, fontWeight: 500, wordBreak: 'break-word' }}>{row.value || '-'}</div></div>)}</div>;
}

function OrderCard({ order, onOpen }: { order: TrainingOrder; onOpen: () => void }) {
  const courses = order.enrolledCourses || [];
  const courseAmount = order.courseAmountYuan ?? order.courseAmount;
  return <button type="button" onClick={onOpen} style={{ width: '100%', textAlign: 'left', border: 'none', background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 12px rgba(0,0,0,.04)', font: 'inherit', color: '#1a1a1a' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ flex: 1, minWidth: 0, color: '#158F82', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.contractNumber || order.contractNo || '未生成合同号'}</span>{statusPill(statusOf(order), order.displayStatus)}</div>
    <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 10 }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 17, fontWeight: 700 }}>{order.customerName || order.studentName || '未命名学员'}</div><div style={{ marginTop: 4, color: '#7a8696', fontSize: 13 }}>{order.customerPhone || '-' }{order.leadSource ? `　·　${order.leadSource}` : ''}</div></div><div style={{ color: '#FF8F1F', fontWeight: 700, fontSize: 16 }}>{courseAmount == null ? '-' : `¥${Number(courseAmount).toLocaleString()}`}</div></div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>{courses.length ? courses.map((course) => <span key={course} style={{ borderRadius: 20, padding: '3px 8px', color: '#158F82', background: 'rgba(21,143,130,.08)', fontSize: 11 }}>{course}</span>) : <span style={{ color: '#999', fontSize: 12 }}>未填写报名课程</span>}</div>
    <div style={{ display: 'flex', marginTop: 12, paddingTop: 10, borderTop: '1px solid #f2f4f5', color: '#8a93a5', fontSize: 12 }}><span>证书申报：{order.isGraduated ? '是' : '否'}</span><span style={{ marginLeft: 'auto' }}>{order.createdByName || '未记录'}　{fmtDateTime(order.createdAt)}</span></div>
  </button>;
}

const floatingCreateStyle = { position: 'fixed' as const, right: 16, bottom: 'calc(62px + env(safe-area-inset-bottom))', zIndex: 15, display: 'inline-flex', alignItems: 'center', gap: 5, height: 44, padding: '0 16px', border: 'none', borderRadius: 24, color: '#fff', background: '#158F82', boxShadow: '0 5px 16px rgba(21,143,130,.28)', font: 'inherit', fontSize: 14, fontWeight: 700 };

function ListView({ onOpen, onCreate, canCreate, initialStatus = 'all', approvalHint }: { onOpen: (id: string) => void; onCreate: () => void; canCreate: boolean; initialStatus?: string; approvalHint?: 'refund' }) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ListFilters>(initialStatus === 'active' ? { status: 'active' } : {});
  const [filterVisible, setFilterVisible] = useState(false);
  const fetchPage = useCallback((page: number, limit: number) => trainingOrderService.listForApp({ page, limit, search: search || undefined, ...filters }), [search, filters]);
  const { items, hasMore, error, loadMore, refresh } = useInfiniteList<TrainingOrder>(fetchPage, 10);
  useEffect(() => { void refresh(); }, [search, filters, refresh]);
  const submitSearch = (value: string) => setSearch(value.trim());
  const updateFilters = (patch: Partial<ListFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setFilters({});
  };
  const filterCount = Object.values(filters).filter(Boolean).length;
  return <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
    <NavBar back={null} right={<div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>{canCreate && <button type="button" onClick={onCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, minWidth: 46, height: 32, border: 'none', padding: '0 2px', background: 'transparent', color: '#158F82', fontSize: 14, fontWeight: 600 }}><AddOutline fontSize={18} />新建</button>}<button type="button" onClick={() => setFilterVisible(true)} style={{ position: 'relative', minWidth: 36, height: 32, border: 'none', padding: '0 4px', background: 'transparent', color: '#158F82', fontSize: 14, fontWeight: 600 }}>筛选{filterCount > 0 && <span style={{ position: 'absolute', top: 0, right: -2, minWidth: 15, height: 15, borderRadius: 8, padding: '0 3px', background: '#e8564b', color: '#fff', fontSize: 10, lineHeight: '15px' }}>{filterCount}</span>}</button></div>} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}>职培合同</NavBar>
    <div style={{ background: '#fff', padding: '8px 16px 12px' }}><SearchBar value={searchInput} onChange={setSearchInput} onSearch={submitSearch} placeholder="搜索学员姓名、手机或合同号" style={{ '--border-radius': '20px', '--background': '#f5f7fa' }} /></div>
    {approvalHint && <div style={{ margin: '0 16px', padding: '9px 12px', borderRadius: 10, color: '#765a2a', background: '#fff7e8', fontSize: 12, lineHeight: 1.55 }}>已筛选学习中合同。进入合同详情后，在「更多操作」中点击「申请退款」。</div>}
    <div style={{ padding: '10px 16px 2px', color: '#7a8696', fontSize: 12 }}>与 CRM 职培合同列表同步 · 下拉刷新获取最新数据</div>
    <PullToRefresh onRefresh={refresh}><div style={{ padding: '10px 16px 84px' }}>
      {error && items.length === 0 ? <ErrorBlock status="default" title="加载失败" description="下拉刷新重试" /> : items.length === 0 && !hasMore ? <Empty description="暂无职培合同" /> : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{items.map((order, index) => <OrderCard key={order._id || order.id || index} order={order} onOpen={() => { const id = order._id || order.id; if (id) onOpen(id); }} />)}</div>}
      <InfiniteScroll loadMore={loadMore} hasMore={hasMore}>{hasMore ? <DotLoading color="primary" /> : items.length ? <span style={{ color: '#999', fontSize: 12 }}>已到底部</span> : ''}</InfiniteScroll>
    </div></PullToRefresh>
    {canCreate && <button type="button" aria-label="创建职培合同" onClick={onCreate} style={floatingCreateStyle}><AddOutline fontSize={20} /><span>创建合同</span></button>}
    <Popup visible={filterVisible} onMaskClick={() => setFilterVisible(false)} bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: '24px 16px calc(16px + env(safe-area-inset-bottom))' }}>
      <div style={{ marginBottom: 20, textAlign: 'center', fontSize: 16, fontWeight: 500, color: '#333' }}>筛选职培合同</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>合同状态</div>
      <Grid columns={3} gap={[8, 8]}>{FILTER_STATUS_OPTIONS.map((option) => <Grid.Item key={option.value}><Button block size="small" color={filters.status === option.value ? 'primary' : 'default'} fill={filters.status === option.value ? 'solid' : 'outline'} onClick={() => updateFilters({ status: filters.status === option.value ? undefined : option.value })}>{option.label}</Button></Grid.Item>)}</Grid>
      <div style={{ fontSize: 13, fontWeight: 600, margin: '18px 0 10px' }}>线索来源</div>
      <Grid columns={3} gap={[8, 8]}>{FILTER_SOURCE_OPTIONS.map((source) => <Grid.Item key={source}><Button block size="small" color={filters.leadSource === source ? 'primary' : 'default'} fill={filters.leadSource === source ? 'solid' : 'outline'} onClick={() => updateFilters({ leadSource: filters.leadSource === source ? undefined : source })}>{source}</Button></Grid.Item>)}</Grid>
      <div style={{ fontSize: 13, fontWeight: 600, margin: '18px 0 10px' }}>证书申报</div>
      <Space block><Button block size="small" color={filters.certificateStatus === 'applied' ? 'primary' : 'default'} fill={filters.certificateStatus === 'applied' ? 'solid' : 'outline'} onClick={() => updateFilters({ certificateStatus: filters.certificateStatus === 'applied' ? undefined : 'applied' })}>已申报</Button><Button block size="small" color={filters.certificateStatus === 'unapplied' ? 'primary' : 'default'} fill={filters.certificateStatus === 'unapplied' ? 'solid' : 'outline'} onClick={() => updateFilters({ certificateStatus: filters.certificateStatus === 'unapplied' ? undefined : 'unapplied' })}>未申报</Button></Space>
      <div style={{ fontSize: 13, fontWeight: 600, margin: '18px 0 10px' }}>创建日期</div>
      <div style={{ display: 'flex', gap: 10 }}><Input type="date" value={filters.startDate} onChange={(startDate) => updateFilters({ startDate: startDate || undefined })} /><Input type="date" value={filters.endDate} onChange={(endDate) => updateFilters({ endDate: endDate || undefined })} /></div>
      <div style={{ display: 'flex', gap: 10, marginTop: 26 }}><Button block onClick={resetFilters}>重置</Button><Button block color="primary" onClick={() => setFilterVisible(false)}>完成</Button></div>
    </Popup>
  </div>;
}

function SigningSection({ detail, contractId, onReload }: { detail: TrainingOrderDetail; contractId: string; onReload: () => void }) {
  const canEdit = usePermission('contract:edit');
  const [signers, setSigners] = useState<TrainingOrderSignUrl[]>(detail.view.esign.signUrls || []);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  useEffect(() => setSigners(detail.view.esign.signUrls || []), [detail]);
  const loadUrls = async () => { setLoading(true); try { const result = await contractService.getSignUrls(contractId); if (!result.success) throw new Error(result.message); setSigners(result.signUrls); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '获取签署链接失败') }); } finally { setLoading(false); } };
  const sync = async () => { setSyncing(true); try { const result = await contractService.syncEsignStatus(contractId); if (!result.success) throw new Error(result.message); Toast.show({ icon: 'success', content: '签约状态已同步' }); onReload(); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '同步失败') }); } finally { setSyncing(false); } };
  if (!detail.view.esign.esignContractNo) return <Section title="电子合同状态"><span style={{ color: '#999', fontSize: 13 }}>暂未发起电子签。</span></Section>;
  return <Section title="电子合同状态"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>{statusPill(detail.view.header.displayStatusCode, detail.view.header.displayStatus)}<Space><Button size="mini" fill="outline" loading={loading} onClick={loadUrls}>获取签署链接</Button>{detail.view.actions.canSyncEsign && canEdit && <Button size="mini" fill="outline" loading={syncing} onClick={sync}>同步状态</Button>}</Space></div>{signers.length === 0 ? <div style={{ color: '#999', fontSize: 13 }}>暂无签署方信息</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{signers.map((signer, index) => { const signed = Number(signer.status) === 2; const automatic = !signer.signUrl || signer.signUrl.includes('无需签署'); return <div key={`${signer.mobile || signer.name || 'signer'}-${index}`} style={{ borderRadius: 12, background: '#f7f8fa', padding: 12 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b style={{ flex: 1 }}>{signer.name || '签署方'}</b>{statusPill(signed ? 'signed' : automatic ? 'draft' : 'signing', automatic ? '自动签章' : signer.statusText || (signed ? '已签署' : '待签署'))}</div><div style={{ color: '#7a8696', fontSize: 12, marginTop: 5 }}>{signer.role || '签署方'}　{automatic ? '企业自动签章' : signer.mobile || '-'}</div>{!signed && !automatic && canEdit && <Space style={{ marginTop: 10 }}><Button size="mini" color="primary" fill="outline" onClick={() => openExternal(signer.signUrl)}>打开签署页</Button></Space>}</div>; })}</div>}</Section>;
}

function PaymentSection({ contract, detail, onReload }: { contract: Contract; detail: TrainingOrderDetail; onReload: () => void }) {
  const canEdit = usePermission('contract:edit');
  const [records, setRecords] = useState<PaymentRecordItem[]>([]);
  const [qrLoading, setQrLoading] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const loadRecords = useCallback(async () => { try { setRecords(await contractService.getPaymentRecords(contract._id)); } catch { setRecords([]); } }, [contract._id]);
  useEffect(() => { if (contract.paymentEnabled) void loadRecords(); }, [contract.paymentEnabled, loadRecords]);
  const showQr = async () => { setQrLoading(true); try { const result = await contractService.generatePaymentQr(contract._id); Dialog.show({ title: `收款 ${Number(result.amount || 0) / 100} 元`, content: <div style={{ textAlign: 'center' }}><img src={result.qrImage} alt="收款二维码" style={{ width: 220, maxWidth: '100%' }} /><div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>请学员使用微信/支付宝扫码支付</div>{result.clientSn && <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>长按二维码保存，或截图发给客户</div>}</div>, closeOnMaskClick: true, actions: [{ key: 'close', text: '关闭', onClick: () => { void loadRecords(); onReload(); } }] }); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '生成收款码失败') }); } finally { setQrLoading(false); } };
  const paid = records.filter((record) => record.status === 'paid').reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
  return <><Section title="收款状态"><InfoGrid rows={[{ label: '收款状态', value: detail.view.costInfo.paymentStatusText }, { label: '已收金额', value: detail.view.costInfo.showPaymentAmount ? money(detail.view.costInfo.paymentAmountText) : '-' }, { label: '支付时间', value: detail.view.costInfo.paidAt ? fmtDateTime(detail.view.costInfo.paidAt) : '-' }, { label: '退款时间', value: detail.view.costInfo.showRefundInfo ? detail.view.costInfo.refundedAtFmt : '-' }]} />{contract.paymentEnabled && <div style={{ marginTop: 14 }}><div style={{ color: '#7a8696', fontSize: 12, marginBottom: 8 }}>收款流水 {records.length ? `· 已收 ¥${(paid / 100).toLocaleString()}` : ''}</div>{records.length ? records.map((record, index) => <div key={record._id || index} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13, borderTop: '1px solid #f2f4f5' }}><span>{record.label || `第 ${index + 1} 笔`}　{record.status === 'paid' ? '已支付' : record.status || '待支付'}</span><b>¥{(Number(record.amount) / 100).toLocaleString()}</b></div>) : <span style={{ color: '#999', fontSize: 13 }}>暂无收款流水</span>}</div>}{canEdit && <Space style={{ marginTop: 14 }}><Button size="small" color="primary" disabled={!contract.paymentEnabled} loading={qrLoading} onClick={showQr}>生成收款码</Button><Button size="small" fill="outline" onClick={() => setConfigOpen(true)}>收款配置</Button></Space>}</Section><PaymentConfigPopup visible={configOpen} contract={contract} onClose={() => setConfigOpen(false)} onSuccess={() => { setConfigOpen(false); onReload(); }} onSaveAndCollect={() => { setConfigOpen(false); onReload(); showQr(); }} /></>;
}

function DetailView({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const canEdit = usePermission('training-order:edit');
  const canDeleteContract = usePermission('contract:delete');
  const userRole = useAuthStore((state) => state.user?.role);
  const canDelete = canDeleteContract && normalizeRole(userRole) === 'admin';
  const [detail, setDetail] = useState<TrainingOrderDetail>();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [moreVisible, setMoreVisible] = useState(false);
  const [refundVisible, setRefundVisible] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [acting, setActing] = useState(false);
  const load = useCallback(async () => { try { setLoading(true); setDetail(await trainingOrderService.getDetailForApp(id)); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '获取职培合同详情失败') }); } finally { setLoading(false); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  const contract = detail?.contract as Contract | undefined;
  const preview = async () => { if (!contract?.esignContractNo) { Toast.show({ content: '暂未发起电子签' }); return; } try { const result = await contractService.previewContract(contract.esignContractNo); openExternal(result?.previewUrl || result?.previewData); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '预览合同失败') }); } };
  const download = async () => { if (!contract?._id) return; try { Toast.show({ icon: 'loading', content: '准备下载…' }); const result = await contractService.downloadContract(contract._id); const payload = result?.data?.data; if (!payload) throw new Error('暂无下载文件'); const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0)); const url = URL.createObjectURL(new Blob([bytes], { type: result.data.fileType === 1 ? 'application/zip' : 'application/pdf' })); const link = document.createElement('a'); link.href = url; link.download = result.data.fileName || `${contract.contractNumber || '职培合同'}.pdf`; link.click(); URL.revokeObjectURL(url); Toast.clear(); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '下载合同失败') }); } };
  const deleteContract = () => { if (!canDelete) return; void Dialog.confirm({ title: '确认删除职培合同', content: <div>将永久删除此职培合同，删除后不可恢复。<div style={{ marginTop: 8 }}>合同编号：{contract?.contractNumber || '-'}</div><div>学员：{detail?.view.studentInfo.customerName || '-'}</div></div>, confirmText: '确认删除', cancelText: '取消', onConfirm: async () => { try { setActing(true); const result = await contractService.deleteContract(id); if (!result.success) throw new Error(result.message || '删除失败'); Toast.show({ icon: 'success', content: '职培合同已删除' }); onChanged(); onBack(); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '删除职培合同失败') }); } finally { setActing(false); } } }); };
  const graduate = () => { if (!detail?.view.actions.canGraduate || !canEdit) return; void Dialog.confirm({ content: '确认完成证书申报并标记该学员已毕业吗？此操作不可撤回。', onConfirm: async () => { try { setActing(true); await trainingOrderService.graduate(id); Toast.show({ icon: 'success', content: '已标记毕业' }); await load(); onChanged(); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '标记毕业失败') }); } finally { setActing(false); } } }); };
  const submitRefund = async () => { const amount = Number(refundAmount); if (!Number.isFinite(amount) || amount <= 0 || !refundReason.trim()) return; try { setActing(true); await approvalService.applyRefund(id, amount, refundReason.trim()); Toast.show({ icon: 'success', content: '退款申请已提交，等待审批' }); setRefundVisible(false); await load(); onChanged(); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '退款申请失败') }); } finally { setActing(false); } };
  if (loading && !detail) return <div style={{ textAlign: 'center', padding: 40 }}><DotLoading color="primary" /></div>;
  if (!detail || !contract) return <><NavBar onBack={onBack} style={{ background: '#fff' }}>职培合同详情</NavBar><ErrorBlock status="empty" title="合同不存在" /></>;
  const view = detail.view;
  const moreActions = [
    { icon: <EyeOutline />, text: '预览合同', key: 'preview', disabled: !contract.esignContractNo, onClick: preview },
    { icon: <DownlandOutline />, text: '下载合同', key: 'download', disabled: !contract.esignContractNo, onClick: download },
    ...(canEdit && view.actions.canRefund ? [{ icon: <RedoOutline />, text: '申请退款', key: 'refund', danger: true, onClick: () => { setRefundAmount(''); setRefundReason(''); setRefundVisible(true); } }] : []),
    ...(canDelete ? [{ icon: <DeleteOutline />, text: '删除合同', key: 'delete', danger: true, onClick: deleteContract }] : []),
  ];
  return <div style={{ minHeight: '100vh', background: '#f5f7fa', paddingBottom: canEdit && view.actions.canGraduate ? 'calc(110px + env(safe-area-inset-bottom))' : '24px' }}>
    <NavBar onBack={onBack} right={<div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}><button type="button" aria-label="更多操作" onClick={() => setMoreVisible(true)} style={{ minWidth: 48, height: 32, border: 'none', padding: '0 4px', background: 'transparent', color: '#158F82', fontSize: 14, fontWeight: 600, lineHeight: 1 }}>更多</button></div>} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}>职培合同详情</NavBar>
    <div style={{ padding: '16px 16px 0' }}><div style={{ borderRadius: 16, padding: 18, color: '#fff', background: 'linear-gradient(135deg, #158F82, #27aea0)', boxShadow: '0 4px 14px rgba(21,143,130,.2)' }}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ fontSize: 12, fontFamily: 'monospace', opacity: .92 }}>{view.contractNumber || '-'}</span><span style={{ marginLeft: 'auto', borderRadius: 16, padding: '3px 9px', background: 'rgba(255,255,255,.2)', fontSize: 12, fontWeight: 600 }}>{view.header.displayStatus}</span></div><div style={{ fontSize: 21, fontWeight: 700, marginTop: 9 }}>{view.studentInfo.customerName || '未命名学员'}</div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 13, opacity: .94 }}><span>{view.studentInfo.customerPhone || '-'}</span><span style={{ fontSize: 17, fontWeight: 700 }}>{money(view.costInfo.totalText)}</span></div></div></div>
    <Tabs activeKey={tab} onChange={setTab} style={{ marginTop: 12, background: '#fff', '--title-font-size': '14px' }}><Tabs.Tab title="概览" key="overview" /><Tabs.Tab title="费用收款" key="payment" /><Tabs.Tab title="电子合同" key="contract" /></Tabs>
    <div style={{ padding: 16 }}>{tab === 'overview' && <><SigningSection detail={detail} contractId={id} onReload={() => { void load(); onChanged(); }} /><Section title="合同基本信息"><InfoGrid rows={[{ label: '合同编号', value: view.basicInfo.contractNumber, wide: true, color: '#158F82' }, { label: '合同类型', value: '职培合同' }, { label: '合同状态', value: view.basicInfo.displayStatus }, { label: '合同签约日期', value: view.basicInfo.signDate }, { label: '创建时间', value: fmtDateTime(view.basicInfo.createdAt || undefined) }, { label: '线索来源', value: view.leadSource || '-' }, { label: '创建人', value: view.createdBy.name || '-' }, { label: '已报课程', value: view.enrolledCourses.length ? view.enrolledCourses.join('、') : '-', wide: true }]}/></Section><Section title="学员信息"><InfoGrid rows={[{ label: '学员姓名', value: view.studentInfo.customerName }, { label: '联系电话', value: view.studentInfo.customerPhone }, { label: '身份证号', value: maskId(view.studentInfo.customerIdCard) }, { label: '咨询职位', value: view.studentInfo.consultPosition }, { label: '联系地址', value: view.studentInfo.customerAddress, wide: true }]}/></Section>{view.terminal.graduatedAtFmt || view.terminal.refundedAtFmt ? <Section title="业务状态"><InfoGrid rows={[{ label: '毕业日期', value: view.terminal.graduatedAtFmt }, { label: '退款日期', value: view.terminal.refundedAtFmt }]}/></Section> : null}</>}{tab === 'payment' && <><Section title="费用信息"><InfoGrid rows={[{ label: '学员培训费', value: money(view.costInfo.courseAmountText), color: '#158F82' }, { label: '劳动者服务费', value: money(view.costInfo.serviceFeeAmountText), color: '#7b57c7' }, { label: '费用总计', value: money(view.costInfo.totalText), color: '#FF8F1F', wide: true }]}/></Section><PaymentSection contract={contract} detail={detail} onReload={() => { void load(); onChanged(); }} /></>}{tab === 'contract' && <Section title="合同文件"><div style={{ color: '#7a8696', fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>可在线预览或下载已生成的电子合同文件。</div><Space><Button size="small" color="primary" disabled={!contract.esignContractNo} onClick={preview}>预览合同</Button><Button size="small" fill="outline" disabled={!contract.esignContractNo} onClick={download}>下载合同</Button></Space></Section>}</div>
    {canEdit && view.actions.canGraduate && <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(50px + env(safe-area-inset-bottom))', zIndex: 20, display: 'flex', gap: 8, padding: '8px 16px', background: 'rgba(255,255,255,.97)', boxShadow: '0 -3px 12px rgba(0,0,0,.08)' }}><Button size="small" color="primary" loading={acting} onClick={graduate} style={{ flex: 1, borderRadius: 20 }}>证书申报</Button></div>}
    <Popup visible={moreVisible} onMaskClick={() => setMoreVisible(false)} bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: '24px 16px calc(16px + env(safe-area-inset-bottom))' }}><div style={{ marginBottom: 24, textAlign: 'center', fontSize: 16, fontWeight: 500, color: '#333' }}>更多操作</div><Grid columns={4} gap={[16, 24]}>{moreActions.map((item) => <Grid.Item key={item.key} onClick={() => { if (!item.disabled) { item.onClick(); setMoreVisible(false); } }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: item.disabled ? 'not-allowed' : 'pointer', opacity: item.disabled ? 0.4 : 1 }}><div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: item.danger ? '#fff1f0' : '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: item.danger ? '#ff4d4f' : '#666', marginBottom: 8 }}>{item.icon}</div><div style={{ fontSize: 12, color: '#333', textAlign: 'center' }}>{item.text}</div></Grid.Item>)}</Grid><div style={{ marginTop: 32 }}><Button block shape="rounded" onClick={() => setMoreVisible(false)} style={{ background: '#f5f7fa', color: '#666', border: 'none' }}>取消</Button></div></Popup>
    <Popup visible={refundVisible} onMaskClick={() => !acting && setRefundVisible(false)} bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '20px 16px calc(28px + env(safe-area-inset-bottom))' }}><div style={{ fontSize: 18, fontWeight: 700 }}>申请退款</div><div style={{ color: '#7a8696', fontSize: 13, margin: '8px 0 16px' }}>退款将进入 CRM 审批流程，审批通过后才会更新合同状态。</div><Input type="number" value={refundAmount} onChange={setRefundAmount} placeholder="退款金额（元）" /><div style={{ marginTop: 12 }}><Input value={refundReason} onChange={setRefundReason} placeholder="退款原因（必填）" /></div><div style={{ display: 'flex', gap: 10, marginTop: 22 }}><Button block disabled={acting} onClick={() => setRefundVisible(false)}>取消</Button><Button block color="primary" loading={acting} disabled={!Number(refundAmount) || !refundReason.trim() || acting} onClick={submitRefund}>提交退款审批</Button></div></Popup>
  </div>;
}

type PageView = { type: 'list' } | { type: 'detail'; id: string } | { type: 'create' };

export default function TrainingOrders() {
  const location = useLocation();
  const canCreate = usePermission('training-order:create');
  const initialStatus = location.state?.initialStatus === 'active' ? 'active' : 'all';
  const approvalHint = location.state?.approvalHint === 'refund' ? 'refund' : undefined;
  const [view, setView] = useState<PageView>({ type: 'list' });
  const [listKey, setListKey] = useState(0);
  if (view.type === 'detail') return <DetailView id={view.id} onBack={() => setView({ type: 'list' })} onChanged={() => setListKey((key) => key + 1)} />;
  if (view.type === 'create') return <TrainingContractForm onBack={() => setView({ type: 'list' })} onDone={() => setListKey((key) => key + 1)} />;
  return <ListView key={`${listKey}-${initialStatus}-${approvalHint || 'none'}`} canCreate={canCreate} initialStatus={initialStatus} approvalHint={approvalHint} onOpen={(id) => setView({ type: 'detail', id })} onCreate={() => setView({ type: 'create' })} />;
}