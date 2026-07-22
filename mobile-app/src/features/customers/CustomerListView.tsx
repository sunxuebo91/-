import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AddOutline, EyeOutline, FileOutline, UserContactOutline, UserSetOutline } from 'antd-mobile-icons';
import { Button, DotLoading, Empty, ErrorBlock, Grid, InfiniteScroll, NavBar, Popup, PullToRefresh, SearchBar, Selector, Tabs, TextArea, Toast } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import { VirtualList } from '../../components/VirtualList';
import { customerService } from '../../services/customerService';
import { apiService } from '../../services/api';
import { useInfiniteList, fmtDate } from '../../pages/_shared';
import { usePermission } from '../../hooks/usePermission';
import { useAuthStore } from '../../stores/auth';
import { normalizeRole } from '../../utils/permission';
import type { Customer } from '../../types';
import { CUSTOMER_FILTER_SERVICE_CATEGORIES, LEAD_SOURCES, displayUser } from './constants';
import { mapParsedCustomerToForm } from './customerForm';
import type { AssignableUser, CustomerFilters } from './types';

interface CustomerListViewProps {
  onOpen: (id: string) => void;
  onQuickFollowUp: (id: string) => void;
  onCreate: (initialValues?: Record<string, unknown>) => void;
  canCreate: boolean;
}

const FOLLOW_UP_FILTERS = ['新客未跟进', '流转未跟进', '已跟进'];
const LEAD_LEVEL_FILTERS = ['O类', 'A类', 'B类', 'C类', 'D类'];
// CRM 后端 customerState 是列表筛选分组，不是卡片上的实际客户状态。
const CUSTOMER_STATE_FILTERS = ['在职', '已签约', '已流失'];

const TAB_CONFIG = [
  { key: '全部', label: '全部' }, { key: '新客', label: '新客' }, { key: '流转', label: '流转' }, { key: '已跟进', label: '已跟进' }, { key: '已签约', label: '已签约' },
] as const;
const LEAD_BADGE_STYLE: Record<string, { color: string; background: string }> = {
  O类: { color: '#7a5310', background: 'linear-gradient(135deg, #ffe9a9, #d9a52d)' }, A类: { color: '#bd3e48', background: '#ffeaed' }, B类: { color: '#b86b16', background: '#fff1df' }, C类: { color: '#2671ba', background: '#e8f3ff' }, D类: { color: '#687384', background: '#edf0f3' },
};

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return <section style={{ padding: '16px 16px 0' }}><div style={{ color: '#25313d', fontSize: 15, fontWeight: 600, marginBottom: 10 }}>{title}</div>{children}</section>;
}

function FilterSelector({ options, value = [], onChange, columns = 3 }: { options: string[]; value?: string[]; onChange: (values: string[]) => void; columns?: number }) {
  return <Selector multiple columns={columns} options={options.map((item) => ({ label: item, value: item }))} value={value} onChange={onChange} />;
}

function statusQuery(status: string) {
  if (status === '已签约') return { contractStatus: '已签约' };
  if (status === '新客') return { followUpStatus: '新客未跟进' };
  if (status === '流转') return { followUpStatus: '流转未跟进' };
  if (status === '已跟进') return { followUpStatus: '已跟进' };
  return {};
}

function customerStatusBadge(customer: Customer) {
  const label = customer.contractStatus || '待定';
  const styles: Record<string, { color: string; background: string }> = {
    已签约: { color: '#389e0d', background: '#f6ffed' },
    匹配中: { color: '#1677c8', background: '#e6f4ff' },
    已面试: { color: '#08979c', background: '#e6fffb' },
    流失客户: { color: '#cf1322', background: '#fff1f0' },
    已退款: { color: '#d46b08', background: '#fff7e6' },
    退款中: { color: '#d46b08', background: '#fff7e6' },
  };
  return { label, ...(styles[label] || { color: '#687384', background: '#f1f3f5' }) };
}

function followUpAccent(status?: string | null, dealStatus?: string | null) {
  const combinedStatus = `${status || ''}${dealStatus || ''}`;
  if (/(已签约|已成交|成交|已报名)/.test(combinedStatus)) return '#8e5bd9';
  return status && !status.includes('未跟进') ? '#158F82' : '#e5484d';
}

function CustomerCard({ customer, onOpen, onQuickFollowUp, onMore }: { customer: Customer; onOpen: () => void; onQuickFollowUp: () => void; onMore: () => void }) {
  const level = LEAD_BADGE_STYLE[customer.leadLevel || ''] || LEAD_BADGE_STYLE.D类;
  const state = customerStatusBadge(customer);
  const ownerInactive = customer.assignedToUser && (customer.assignedToUser.active === false || customer.assignedToUser.isActive === false || !!customer.assignedToUser.leftAt);
  const owner = `${displayUser(customer.assignedToUser, '未分配')}${ownerInactive ? '（离职）' : ''}`;
  return <div onClick={onOpen} style={{ width: '100%', boxSizing: 'border-box', background: '#fff', borderRadius: 16, padding: 16, boxShadow: `inset 0 4px 0 ${followUpAccent(customer.followUpStatus, customer.contractStatus)}, 0 2px 12px rgba(0,0,0,0.04)`, cursor: 'pointer' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ minWidth: 0, flex: 1, overflow: 'hidden', color: '#1a1a1a', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 17, fontWeight: 700 }}>{customer.name || '未命名客户'}{customer.isUrgent && <span aria-label="紧急客户" title="紧急客户" style={{ marginLeft: 6, fontSize: 14 }}>🚨</span>}{customer.isStarred && <span aria-label="已星标" title="已星标" style={{ marginLeft: 6, color: '#d9a52d', fontSize: 14 }}>★</span>}</span><span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, minHeight: 22, padding: '2px 9px', borderRadius: 20, color: state.color, background: state.background, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{state.label}</span></div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}><span style={{ color: '#158F82', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{customer.customerId || '未生成客户编号'}</span><span style={{ ...level, borderRadius: 20, padding: '2px 7px', fontSize: 11, whiteSpace: 'nowrap' }}>{customer.leadLevel === 'O类' ? '⭐ ' : ''}{customer.leadLevel || '未分级'}</span></div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12, color: '#666', fontSize: 13 }}>
      <span>电话 {customer.phone || '-'}</span><span>微信 {customer.wechatId || '-'}</span>
      <span>负责人 {owner}</span><span>来源 {customer.leadSource || '-'}</span>
      <span style={{ gridColumn: '1 / -1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>服务品类 {customer.serviceCategory || '-'}</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f5f5f5', color: '#999', fontSize: 12 }}><span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.followUpStatus || '暂无跟进记录'}<span style={{ marginLeft: 8, color: '#a0a8b2' }}>{fmtDate(customer.createdAt)}</span></span><div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 14, fontSize: 13 }}><a href={customer.phone ? `tel:${customer.phone}` : undefined} onClick={(event) => event.stopPropagation()} style={{ color: '#158F82', textDecoration: 'none' }}>拨打</a><span onClick={(event) => { event.stopPropagation(); onQuickFollowUp(); }} style={{ color: '#158F82' }}>跟进</span><span onClick={(event) => { event.stopPropagation(); onMore(); }} style={{ color: '#687384' }}>更多</span></div></div>
  </div>;
}

export function CustomerListView({ onOpen, onQuickFollowUp, onCreate, canCreate }: CustomerListViewProps) {
  const navigate = useNavigate();
  const canCreateContract = usePermission('contract:create');
  const canEdit = usePermission('customer:edit');
  const currentRole = useAuthStore((state) => state.user?.role);
  const canAssign = canEdit && ['admin', 'manager', 'operator', 'dispatch'].includes(normalizeRole(currentRole));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('全部');
  const [filters, setFilters] = useState<CustomerFilters>({});
  const [filterVisible, setFilterVisible] = useState(false);
  const [draftFilters, setDraftFilters] = useState<CustomerFilters>({});
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [importVisible, setImportVisible] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success?: number; fail?: number; errors?: string[] } | null>(null);
  const [moreCustomer, setMoreCustomer] = useState<Customer | null>(null);
  const [assignmentCustomer, setAssignmentCustomer] = useState<Customer | null>(null);
  const [selectedAssignee, setSelectedAssignee] = useState<string[]>([]);
  const [assignmentReason, setAssignmentReason] = useState('');
  const [loadingAssignableUsers, setLoadingAssignableUsers] = useState(false);
  const [assigningCustomer, setAssigningCustomer] = useState(false);
  const [aiVisible, setAiVisible] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiParsing, setAiParsing] = useState(false);
  const fetchPage = useCallback(
    async (page: number, limit: number) => {
      const res = await customerService.getCustomers({
        page, limit, search: search || undefined,
        ...filters,
        ...statusQuery(status),
      });
      return { list: res.customers || [], total: res.total || 0 };
    }, [search, status, filters],
  );
  const { items, hasMore, error, loadMore, refresh } = useInfiniteList<Customer>(fetchPage, 10);
  useEffect(() => {
    refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, filters]);

  useEffect(() => {
    if (!filterVisible || assignableUsers.length > 0) return;
    let cancelled = false;
    customerService.getAssignableUsers().then((users) => {
      if (!cancelled) setAssignableUsers(users);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [assignableUsers.length, filterVisible]);

  useEffect(() => {
    const { followUpStatuses: _followUpStatuses, ...baseFilters } = filters;
    let cancelled = false;
    Promise.all(TAB_CONFIG.map(async ({ key }) => [key, (await customerService.getCustomers({ page: 1, limit: 1, search: search || undefined, ...baseFilters, ...statusQuery(key) })).total || 0] as const)).then((counts) => {
      if (!cancelled) setTabCounts(Object.fromEntries(counts));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [filters, search]);

  const selectedFilterCount = Object.values(filters).filter((value) => Array.isArray(value) ? value.length > 0 : !!value).length;
  const ownerOptions = assignableUsers.map((user) => ({
    id: user._id,
    label: user.username && user.username !== displayUser(user) ? `${displayUser(user)}（${user.username}）` : displayUser(user),
  }));
  const updateDraft = (key: keyof CustomerFilters, value: CustomerFilters[keyof CustomerFilters]) => setDraftFilters((previous) => ({ ...previous, [key]: Array.isArray(value) && value.length === 0 ? undefined : value }));
  const openFilter = () => { setDraftFilters(filters); setFilterVisible(true); };
  const applyFilters = () => { setFilters(draftFilters); setFilterVisible(false); };
  const resetFilters = () => { setDraftFilters({}); setFilters({}); setFilterVisible(false); };
  const downloadTemplate = () => {
    const header = '姓名,电话,线索来源,客户状态,线索等级,微信号,需求品类,薪资预算,家庭人口,地址';
    const example = '张三,13800138000,美团,待定,A类,wx123,月嫂,8000,3,杭州市西湖区';
    const url = URL.createObjectURL(new Blob([`\ufeff${header}\n${example}`], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = '客户导入模板.csv'; link.click(); URL.revokeObjectURL(url);
  };
  const importExcel = async (file?: File) => {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) { Toast.show({ icon: 'fail', content: '只支持 .xlsx 或 .xls 文件' }); return; }
    setImporting(true); setImportResult(null);
    try { const formData = new FormData(); formData.append('file', file); const response = await apiService.upload<any>('/customers/import-excel', formData); if (!response?.success) throw new Error(response?.message || '导入失败'); setImportResult(response.data || {}); Toast.show({ icon: 'success', content: response.message || '导入完成' }); refresh().catch(() => {}); } catch (error: any) { Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '导入失败' }); } finally { setImporting(false); }
  };

  const toggleStar = async (customer: Customer) => {
    try { await customerService.updateStar(customer._id, !customer.isStarred); Toast.show({ icon: 'success', content: customer.isStarred ? '已取消星标' : '已加入星标' }); refresh().catch(() => {}); } catch (error: any) { Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '星标更新失败' }); }
  };
  const showMoreActions = (customer: Customer) => setMoreCustomer(customer);
  const openAssignment = (customer: Customer) => {
    setMoreCustomer(null);
    setAssignmentCustomer(customer);
    setSelectedAssignee([]);
    setAssignmentReason('');
    if (assignableUsers.length > 0) return;
    setLoadingAssignableUsers(true);
    customerService.getAssignableUsers().then(setAssignableUsers).catch((error: any) => {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '获取可分配人员失败' });
    }).finally(() => setLoadingAssignableUsers(false));
  };
  const submitAssignment = async () => {
    if (!assignmentCustomer || !selectedAssignee[0]) { Toast.show({ content: '请选择负责人' }); return; }
    setAssigningCustomer(true);
    try {
      await customerService.assignCustomer(assignmentCustomer._id, selectedAssignee[0], assignmentReason.trim() || undefined);
      Toast.show({ icon: 'success', content: '客户分配成功' });
      setAssignmentCustomer(null);
      refresh().catch(() => {});
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '客户分配失败' });
    } finally {
      setAssigningCustomer(false);
    }
  };
  const parseCustomerWithAI = async () => {
    const text = aiText.trim();
    if (text.length < 5) { Toast.show({ content: '请先输入至少 5 个字符的客户信息' }); return; }
    setAiParsing(true);
    try {
      const parsed = await customerService.parseCustomer(text);
      setAiVisible(false);
      setAiText('');
      onCreate(mapParsedCustomerToForm(parsed));
      Toast.show({ icon: 'success', content: 'AI 解析完成，请确认客户信息' });
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || 'AI 解析失败，请稍后重试' });
    } finally {
      setAiParsing(false);
    }
  };

  return <div style={{ background: '#f5f7fa', minHeight: '100vh' }}>
    <div style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 8px rgba(24, 39, 75, 0.05)' }}>
      <NavBar back={null} right={canCreate ? <Button size="small" fill="none" color="primary" onClick={() => setAiVisible(true)} style={{ color: '#158F82', fontWeight: 600, padding: '0 2px' }}><UserSetOutline fontSize={17} /> AI快速创建</Button> : undefined} style={{ fontWeight: 700, '--height': '48px' }}>客户列表</NavBar>
      <div style={{ padding: '4px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ flex: 1 }}><SearchBar placeholder="搜索姓名、电话或微信号" value={search} onChange={setSearch} onSearch={setSearch} style={{ '--border-radius': '10px', '--background': '#f3f6f6' }} /></div><Button size="small" fill="outline" color="primary" onClick={openFilter} style={{ borderRadius: 10, height: 36, padding: '0 10px' }}>筛选{selectedFilterCount ? ` · ${selectedFilterCount}` : ''}</Button></div>
      <Tabs activeKey={status} onChange={setStatus} style={{ '--title-font-size': '13px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        {TAB_CONFIG.map(({ key, label }) => <Tabs.Tab title={`${label} ${tabCounts[key] ?? '—'}`} key={key} />)}
      </Tabs>
    </div>
    <PullToRefresh onRefresh={refresh}><div style={{ padding: '12px 16px 84px' }}>
      {selectedFilterCount > 0 && <div style={{ color: '#158F82', fontSize: 12, marginBottom: 10 }}>已应用 {selectedFilterCount} 项筛选条件 · 下拉可刷新</div>}
      {error && items.length === 0 ? <ErrorBlock status="default" title="加载失败" description="下拉刷新重试" /> : items.length === 0 && !hasMore ? <Empty description="暂无客户" /> : <VirtualList items={items} estimateSize={146} getKey={(c) => c._id} renderItem={(c) => <CustomerCard customer={c} onOpen={() => onOpen(c._id)} onQuickFollowUp={() => onQuickFollowUp(c._id)} onMore={() => showMoreActions(c)} />} />}
      <InfiniteScroll loadMore={loadMore} hasMore={hasMore}>{hasMore ? <DotLoading /> : items.length > 0 ? <span style={{ color: '#999', fontSize: 12 }}>已到底部</span> : ''}</InfiniteScroll>
    </div></PullToRefresh>
    {canCreate && <button type="button" aria-label="创建客户" onClick={() => onCreate()} style={{ position: 'fixed', right: 16, bottom: 'calc(62px + env(safe-area-inset-bottom))', zIndex: 15, display: 'inline-flex', alignItems: 'center', gap: 5, height: 44, padding: '0 16px', border: 'none', borderRadius: 24, color: '#fff', background: '#158F82', boxShadow: '0 5px 16px rgba(21,143,130,.28)', font: 'inherit', fontSize: 14, fontWeight: 700 }}><AddOutline fontSize={20} /><span>创建客户</span></button>}
    {canCreate && <Popup visible={aiVisible} onMaskClick={() => !aiParsing && setAiVisible(false)} bodyStyle={{ borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '20px 16px calc(24px + env(safe-area-inset-bottom))' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}><div style={{ fontSize: 18, fontWeight: 700, color: '#1e2a35' }}>AI快速创建客户</div><span onClick={() => !aiParsing && setAiVisible(false)} style={{ color: '#8993a4', fontSize: 22, lineHeight: 1 }}>×</span></div>
      <div style={{ color: '#7a8696', fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>粘贴微信、电话或客户需求信息，AI 会自动识别并填入客户创建表单。</div>
      <TextArea value={aiText} onChange={setAiText} placeholder="例如：张女士 13812345678，抖音来的，需要住家育儿嫂，预算 8000-10000，三月底上户" rows={7} maxLength={3000} showCount />
      <div style={{ marginTop: 10, color: '#9aa5b1', fontSize: 12 }}>姓名未识别时，将自动生成“客户来源+随机数字”的客户姓名。</div>
      <Button block color="primary" loading={aiParsing} disabled={aiParsing} onClick={parseCustomerWithAI} style={{ marginTop: 18, borderRadius: 24, height: 46, fontWeight: 600 }}>开始 AI 解析</Button>
    </Popup>}
    <Popup visible={importVisible} onMaskClick={() => !importing && setImportVisible(false)} bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: '20px 16px 32px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><span style={{ fontSize: 18, fontWeight: 700 }}>批量导入客户</span><span onClick={() => !importing && setImportVisible(false)} style={{ fontSize: 22, color: '#8993a4' }}>×</span></div>{importResult ? <div style={{ padding: 14, borderRadius: 10, background: '#f5f7fa', lineHeight: 1.8 }}><div>成功导入：<b style={{ color: '#158F82' }}>{importResult.success || 0}</b> 条</div><div>导入失败：<b style={{ color: '#d9535d' }}>{importResult.fail || 0}</b> 条</div>{(importResult.errors || []).slice(0, 3).map((message, index) => <div key={index} style={{ color: '#d9535d', fontSize: 12 }}>{message}</div>)}</div> : <div style={{ color: '#657084', fontSize: 14, lineHeight: 1.7 }}>上传 Excel 文件（.xlsx / .xls），请使用模板中的字段列名。</div>}<div style={{ display: 'flex', gap: 12, marginTop: 20 }}><Button block onClick={downloadTemplate}>下载模板</Button><label style={{ flex: 1 }}><Button block color="primary" loading={importing} disabled={importing} style={{ width: '100%' }}>{importResult ? '再次上传' : '选择 Excel 文件'}</Button><input type="file" accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { importExcel(event.target.files?.[0]); event.currentTarget.value = ''; }} style={{ display: 'none' }} /></label></div></Popup>
    {moreCustomer && <Popup visible onMaskClick={() => setMoreCustomer(null)} bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: '24px 16px' }}>
      <div style={{ marginBottom: 24, textAlign: 'center', fontSize: 16, fontWeight: 500, color: '#333' }}>更多操作</div>
      <Grid columns={4} gap={[16, 24]}>
        <Grid.Item onClick={() => { setMoreCustomer(null); onOpen(moreCustomer._id); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#666', marginBottom: 8 }}><EyeOutline /></div><div style={{ fontSize: 12, color: '#333', textAlign: 'center' }}>查看详情</div>
        </Grid.Item>
        <Grid.Item onClick={() => { setMoreCustomer(null); onQuickFollowUp(moreCustomer._id); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#666', marginBottom: 8 }}><UserContactOutline /></div><div style={{ fontSize: 12, color: '#333', textAlign: 'center' }}>跟进客户</div>
        </Grid.Item>
        {canEdit && <Grid.Item onClick={() => { setMoreCustomer(null); toggleStar(moreCustomer); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: moreCustomer.isStarred ? '#fff7e3' : '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: moreCustomer.isStarred ? '#d9a52d' : '#666', marginBottom: 8 }}>★</div><div style={{ fontSize: 12, color: '#333', textAlign: 'center' }}>{moreCustomer.isStarred ? '取消星标' : '加入星标'}</div>
        </Grid.Item>}
        {canEdit && <Grid.Item onClick={() => { setMoreCustomer(null); onOpen(moreCustomer._id); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: moreCustomer.isUrgent ? '#fff1f0' : '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 700, color: moreCustomer.isUrgent ? '#ff4d4f' : '#666', marginBottom: 8 }}>!</div><div style={{ fontSize: 12, color: '#333', textAlign: 'center' }}>{moreCustomer.isUrgent ? '管理紧急' : '标记紧急'}</div>
        </Grid.Item>}
        {canCreateContract && <Grid.Item onClick={() => { const customer = moreCustomer; setMoreCustomer(null); navigate('/contracts', { state: { createForCustomer: customer } }); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#666', marginBottom: 8 }}><FileOutline /></div><div style={{ fontSize: 12, color: '#333', textAlign: 'center' }}>创建合同</div>
        </Grid.Item>}
        {canAssign && <Grid.Item onClick={() => openAssignment(moreCustomer)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#eaf7f4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#158F82', marginBottom: 8 }}><UserContactOutline /></div><div style={{ fontSize: 12, color: '#333', textAlign: 'center' }}>分配客户</div>
        </Grid.Item>}
      </Grid>
      <div style={{ marginTop: 32 }}><Button block shape="rounded" onClick={() => setMoreCustomer(null)} style={{ background: '#f5f7fa', color: '#666', border: 'none' }}>取消</Button></div>
    </Popup>}
    {assignmentCustomer && <Popup visible onMaskClick={() => !assigningCustomer && setAssignmentCustomer(null)} bodyStyle={{ borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '20px 16px 32px', maxHeight: '80vh', overflowY: 'auto' }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>分配客户</div>
      <div style={{ color: '#7a8696', fontSize: 13, marginBottom: 16 }}>将「{assignmentCustomer.name || '该客户'}」分配给指定负责人</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>选择负责人 <span style={{ color: '#ff4d4f' }}>*</span></div>
      {loadingAssignableUsers ? <div style={{ padding: '14px 0', textAlign: 'center' }}><DotLoading color="primary" /></div> : assignableUsers.length > 0 ? <Selector columns={2} options={assignableUsers.map((user) => ({ label: `${displayUser(user)}（${user.role || '未知'}）`, value: user._id }))} value={selectedAssignee} onChange={setSelectedAssignee} /> : <div style={{ color: '#9aa5b1', fontSize: 13, padding: '8px 0' }}>暂无可分配人员</div>}
      <div style={{ fontSize: 14, fontWeight: 600, margin: '18px 0 10px' }}>分配备注 <span style={{ color: '#9aa5b1', fontWeight: 400 }}>（可选）</span></div>
      <TextArea value={assignmentReason} onChange={setAssignmentReason} maxLength={200} placeholder="请输入分配原因或备注" showCount />
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}><Button block fill="outline" disabled={assigningCustomer} onClick={() => setAssignmentCustomer(null)}>取消</Button><Button block color="primary" loading={assigningCustomer} disabled={!selectedAssignee[0] || assigningCustomer} onClick={submitAssignment}>确认分配</Button></div>
    </Popup>}
    <Popup visible={filterVisible} onMaskClick={() => setFilterVisible(false)} bodyStyle={{ height: '86vh', borderTopLeftRadius: 20, borderTopRightRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f7f9f9' }}><NavBar back={null} right={<span onClick={() => setFilterVisible(false)} style={{ color: '#6b7280' }}>关闭</span>} style={{ background: '#fff', fontWeight: 700 }}>筛选客户</NavBar><div style={{ overflowY: 'auto', flex: 1, paddingBottom: 16 }}><FilterSection title="线索等级（可多选）"><FilterSelector options={LEAD_LEVEL_FILTERS} value={draftFilters.leadLevels} onChange={(value) => updateDraft('leadLevels', value)} /></FilterSection><FilterSection title="跟进状态（可多选）"><FilterSelector options={FOLLOW_UP_FILTERS} value={draftFilters.followUpStatuses} onChange={(value) => updateDraft('followUpStatuses', value)} /></FilterSection><FilterSection title="线索来源（可多选）"><FilterSelector options={LEAD_SOURCES} value={draftFilters.leadSources} onChange={(value) => updateDraft('leadSources', value)} /></FilterSection><FilterSection title="需求品类（可多选）"><FilterSelector options={CUSTOMER_FILTER_SERVICE_CATEGORIES} value={draftFilters.serviceCategories} onChange={(value) => updateDraft('serviceCategories', value)} /></FilterSection><FilterSection title="客户状态（可多选）"><FilterSelector options={CUSTOMER_STATE_FILTERS} value={draftFilters.customerStates} onChange={(value) => updateDraft('customerStates', value)} /></FilterSection><FilterSection title="归属人（可多选）"><FilterSelector options={ownerOptions.map((owner) => owner.label)} value={(draftFilters.assignedToIds || []).map((id) => ownerOptions.find((owner) => owner.id === id)?.label).filter((label): label is string => !!label)} onChange={(labels) => updateDraft('assignedToIds', labels.map((label) => ownerOptions.find((owner) => owner.label === label)?.id).filter((id): id is string => !!id))} /></FilterSection><FilterSection title="快捷筛选"><FilterSelector options={['紧急客户', '我的星标']} value={[...(draftFilters.isUrgent ? ['紧急客户'] : []), ...(draftFilters.isStarred ? ['我的星标'] : [])]} onChange={(values) => { updateDraft('isUrgent', values.includes('紧急客户')); updateDraft('isStarred', values.includes('我的星标')); }} columns={2} /></FilterSection><FilterSection title="创建时间"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input aria-label="创建开始日期" type="date" value={draftFilters.createdStartDate || ''} onChange={(event) => updateDraft('createdStartDate', event.target.value)} style={{ minWidth: 0, flex: 1, border: '1px solid #dfe5e8', borderRadius: 8, padding: '9px 8px', background: '#fff', color: '#374151' }} /><span style={{ color: '#9aa5b1' }}>至</span><input aria-label="创建结束日期" type="date" value={draftFilters.createdEndDate || ''} onChange={(event) => updateDraft('createdEndDate', event.target.value)} style={{ minWidth: 0, flex: 1, border: '1px solid #dfe5e8', borderRadius: 8, padding: '9px 8px', background: '#fff', color: '#374151' }} /></div></FilterSection></div><div style={{ display: 'flex', gap: 10, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: '#fff', borderTop: '1px solid #edf0f2' }}><Button block fill="outline" onClick={resetFilters}>重置</Button><Button block color="primary" onClick={applyFilters}>应用筛选{Object.values(draftFilters).filter((value) => Array.isArray(value) ? value.length : !!value).length ? ` · ${Object.values(draftFilters).filter((value) => Array.isArray(value) ? value.length : !!value).length}` : ''}</Button></div></Popup>
  </div>;
}