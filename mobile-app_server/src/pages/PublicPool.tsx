import { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, Dialog, DotLoading, Empty, ErrorBlock, InfiniteScroll, Input, NavBar, Popup, PullToRefresh, SearchBar, Selector, Toast } from 'antd-mobile';
import { useInfiniteList, fmtDate } from './_shared';
import { usePermission } from '../hooks/usePermission';
import { customerService } from '../services/customerService';
import type { Customer, PublicPoolStatistics } from '../types';

type AssignableUser = { _id: string; name: string; username: string; role: string };

function errorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || error?.message || fallback;
}

export default function PublicPool() {
  const canClaim = usePermission('customer:pool-claim');
  const canAssign = usePermission('customer:pool-assign');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statistics, setStatistics] = useState<PublicPoolStatistics | null>(null);
  const [assignVisible, setAssignVisible] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchPage = useCallback(async (page: number, limit: number) => {
    const result = await customerService.getPublicPoolCustomers({ page, limit, search: search || undefined });
    return { list: result.customers || [], total: result.total || 0 };
  }, [search]);
  const { items, hasMore, error, loadMore, refresh } = useInfiniteList<Customer>(fetchPage, 10, { cacheKey: ['customer-public-pool', search] });

  const refreshAll = useCallback(async () => {
    const [poolStats] = await Promise.all([
      customerService.getPublicPoolStatistics(),
      refresh(),
    ]);
    setStatistics(poolStats);
    setSelectedIds([]);
  }, [refresh]);

  useEffect(() => {
    refreshAll().catch(() => {});
  }, [refreshAll]);

  const toggleSelected = (id: string) => setSelectedIds((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  const claimSelected = async () => {
    if (!selectedIds.length || submitting) return;
    const confirmed = await Dialog.confirm({ title: '确认认领', content: `确定认领已选择的 ${selectedIds.length} 位客户吗？`, confirmText: '确认认领', cancelText: '取消' });
    if (!confirmed) return;
    setSubmitting(true);
    try {
      const result = await customerService.claimPublicPoolCustomers(selectedIds);
      Toast.show({ icon: result.failed ? 'fail' : 'success', content: `领取完成：成功 ${result.success} 个，失败 ${result.failed} 个` });
      await refreshAll();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: errorMessage(error, '领取失败，请重试') });
    } finally {
      setSubmitting(false);
    }
  };
  const openAssign = async () => {
    if (!selectedIds.length) return;
    try {
      if (!assignableUsers.length) setAssignableUsers(await customerService.getAssignableUsers());
      setAssignVisible(true);
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: errorMessage(error, '负责人列表加载失败') });
    }
  };
  const assignSelected = async () => {
    if (!assignedTo[0] || submitting) return;
    setSubmitting(true);
    try {
      const result = await customerService.assignPublicPoolCustomers(selectedIds, assignedTo[0], reason.trim() || undefined);
      Toast.show({ icon: result.failed ? 'fail' : 'success', content: `分配完成：成功 ${result.success} 个，失败 ${result.failed} 个` });
      setAssignVisible(false); setAssignedTo([]); setReason('');
      await refreshAll();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: errorMessage(error, '分配失败，请重试') });
    } finally {
      setSubmitting(false);
    }
  };

  return <div style={{ minHeight: '100vh', background: '#f5f7fa', paddingBottom: 74 }}>
    <NavBar back={null} style={{ background: '#fff', fontWeight: 700 }}>客户公海</NavBar>
    <div style={{ padding: '10px 16px', background: '#fff' }}><SearchBar placeholder="搜索姓名或电话" value={search} onChange={setSearch} onSearch={setSearch} style={{ '--border-radius': '10px', '--background': '#f3f6f6' }} /></div>
    {statistics && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '10px 16px' }}>{[['公海客户', statistics.total], ['今日进入', statistics.todayEntered], ['今日认领', statistics.todayClaimed]].map(([label, value]) => <div key={String(label)} style={{ background: '#fff', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}><div style={{ color: '#7a8696', fontSize: 11 }}>{label}</div><strong style={{ display: 'block', color: '#158F82', fontSize: 18, marginTop: 3 }}>{value}</strong></div>)}</div>}
    <PullToRefresh onRefresh={refreshAll}><div style={{ padding: '2px 16px 88px' }}>
      {error && items.length === 0 ? <ErrorBlock status="default" title="加载失败" description="下拉刷新重试" /> : items.length === 0 && !hasMore ? <Empty description="暂无公海客户" /> : items.map((customer) => <label key={customer._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fff', borderRadius: 14, padding: 12, marginBottom: 10, border: selectedIds.includes(customer._id) ? '1px solid #158F82' : '1px solid #edf1f2' }}><Checkbox checked={selectedIds.includes(customer._id)} onChange={() => toggleSelected(customer._id)} /><div style={{ minWidth: 0, flex: 1 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong style={{ color: '#1e2a35' }}>{customer.name}</strong><span style={{ color: '#158F82', background: '#eaf7f4', borderRadius: 999, padding: '2px 7px', fontSize: 11 }}>{customer.serviceCategory || '待定'}</span></div><div style={{ marginTop: 6, color: '#607087', fontSize: 12 }}>📱 {customer.phone || '-'}　预算 {customer.salaryBudget == null ? '-' : `¥${customer.salaryBudget}`}</div><div style={{ marginTop: 4, color: '#7a8696', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {customer.address || '未填写服务地址'}</div><div style={{ marginTop: 7, color: '#9aa5b1', fontSize: 11 }}>进入公海：{fmtDate(customer.publicPoolEntryTime || customer.updatedAt)}</div></div></label>)}
      <InfiniteScroll loadMore={loadMore} hasMore={hasMore}>{hasMore ? <DotLoading /> : items.length > 0 ? <span style={{ color: '#999', fontSize: 12 }}>已到底部</span> : ''}</InfiniteScroll>
    </div></PullToRefresh>
    {selectedIds.length > 0 && <div style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 20, display: 'flex', gap: 8, padding: 10, background: '#fff', borderRadius: 14, boxShadow: '0 8px 24px rgba(24,39,75,0.16)' }}><span style={{ alignSelf: 'center', color: '#607087', fontSize: 12, whiteSpace: 'nowrap' }}>已选 {selectedIds.length}</span>{canClaim && <Button block color="primary" loading={submitting} disabled={submitting} onClick={claimSelected}>认领</Button>}{canAssign && <Button block fill="outline" color="primary" disabled={submitting} onClick={openAssign}>分配</Button>}</div>}
    <Popup visible={assignVisible} onMaskClick={() => !submitting && setAssignVisible(false)} bodyStyle={{ borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '20px 16px 32px' }}><div style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>分配 {selectedIds.length} 位客户</div><Selector columns={2} options={assignableUsers.map((user) => ({ label: user.name || user.username, value: user._id }))} value={assignedTo} onChange={setAssignedTo} /><div style={{ marginTop: 14 }}><Input value={reason} onChange={setReason} placeholder="分配原因（可选）" clearable /></div><div style={{ display: 'flex', gap: 10, marginTop: 20 }}><Button block disabled={submitting} onClick={() => setAssignVisible(false)}>取消</Button><Button block color="primary" loading={submitting} disabled={!assignedTo[0] || submitting} onClick={assignSelected}>确认分配</Button></div></Popup>
  </div>;
}