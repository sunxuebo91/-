import { useCallback, useEffect, useState } from 'react';
import { Button, Dialog, DotLoading, Empty, ErrorBlock, InfiniteScroll, Input, NavBar, Popup, PullToRefresh, SearchBar, Selector, TextArea, Toast } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import { useInfiniteList, fmtDateTime } from './_shared';
import { auntBlacklistService } from '../services/auntBlacklistService';
import { usePermission } from '../hooks/usePermission';
import { useAuthStore } from '../stores/auth';
import type { BlacklistRecord, BlacklistStatus } from '../types';

const REASONS: Record<string, string> = { fraud: '诈骗/欺骗', serious_complaint: '严重投诉', work_quality: '工作质量恶劣', contract_breach: '严重违约', other: '其他' };
const errorText = (error: any, fallback: string) => error?.response?.data?.message || error?.message || fallback;

export default function BlacklistManagement() {
  const navigate = useNavigate();
  const canEdit = usePermission('blacklist:edit');
  const isAdmin = useAuthStore((state) => state.roles.includes('admin'));
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<BlacklistStatus | undefined>('active');
  const [editing, setEditing] = useState<BlacklistRecord | null>(null);
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [releaseTarget, setReleaseTarget] = useState<BlacklistRecord | null>(null);
  const [releaseReason, setReleaseReason] = useState('');
  const [saving, setSaving] = useState(false);
  const fetchPage = useCallback(async (page: number, pageSize: number) => {
    const data = await auntBlacklistService.list({ page, pageSize, keyword: keyword.trim() || undefined, status });
    return { list: data.items || [], total: data.total || 0 };
  }, [keyword, status]);
  const { items, hasMore, error, loadMore, refresh } = useInfiniteList<BlacklistRecord>(fetchPage, 12, { cacheKey: ['aunt-blacklist', keyword, status] });
  useEffect(() => { refresh().catch(() => {}); }, [refresh]);
  const saveEdit = async () => {
    if (!editing || !reason.trim()) return;
    setSaving(true);
    try { await auntBlacklistService.update(editing._id!, { reason: reason.trim(), remarks: remarks.trim() || undefined }); Toast.show({ icon: 'success', content: '黑名单记录已更新' }); setEditing(null); await refresh(); }
    catch (error: any) { Toast.show({ icon: 'fail', content: errorText(error, '更新失败') }); } finally { setSaving(false); }
  };
  const release = async () => {
    if (!releaseTarget || releaseReason.trim().length < 2) return;
    const confirmed = await Dialog.confirm({ title: '确认释放', content: `释放 ${releaseTarget.name} 后将不再拦截该阿姨，是否继续？`, confirmText: '确认释放' });
    if (!confirmed) return;
    setSaving(true);
    try { await auntBlacklistService.release(releaseTarget._id!, releaseReason.trim()); Toast.show({ icon: 'success', content: '已释放黑名单' }); setReleaseTarget(null); setReleaseReason(''); await refresh(); }
    catch (error: any) { Toast.show({ icon: 'fail', content: errorText(error, '释放失败') }); } finally { setSaving(false); }
  };
  return <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
    <NavBar onBack={() => navigate(-1)} style={{ background: '#fff', fontWeight: 700 }}>阿姨黑名单</NavBar>
    <div style={{ padding: '10px 16px', background: '#fff' }}><SearchBar value={keyword} onChange={setKeyword} onSearch={setKeyword} placeholder="搜索姓名、手机号或身份证号" /></div>
    <div style={{ padding: '10px 16px', background: '#fff' }}><Selector options={[{ label: '生效中', value: 'active' }, { label: '已释放', value: 'released' }]} value={status ? [status] : []} onChange={(value) => setStatus(value[0] as BlacklistStatus)} /></div>
    <PullToRefresh onRefresh={refresh}><div style={{ padding: '12px 16px 40px' }}>{error && !items.length ? <ErrorBlock status="default" title="加载失败" /> : !items.length && !hasMore ? <Empty description="暂无黑名单记录" /> : items.map((item) => <div key={item._id} style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderLeft: `4px solid ${item.status === 'active' ? '#e5484d' : '#aab4be'}` }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{item.name}</strong><span style={{ color: item.status === 'active' ? '#d9363e' : '#7a8696', fontSize: 12 }}>{item.status === 'active' ? '生效中' : '已释放'}</span></div><div style={{ marginTop: 7, fontSize: 13, color: '#526170' }}>{REASONS[item.reasonType] || item.reasonType} · {item.reason}</div><div style={{ marginTop: 5, color: '#7a8696', fontSize: 12 }}>{item.phone || '未留手机号'}　{item.operatorName ? `录入：${item.operatorName}` : ''}</div><div style={{ marginTop: 5, color: '#a0aab5', fontSize: 11 }}>{fmtDateTime(item.createdAt || '')}</div>{item.status === 'active' && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>{canEdit && <Button size="small" fill="none" onClick={() => { setEditing(item); setReason(item.reason); setRemarks(item.remarks || ''); }}>编辑</Button>}{isAdmin && <Button size="small" color="danger" fill="outline" onClick={() => setReleaseTarget(item)}>释放</Button>}</div>}</div>)}<InfiniteScroll hasMore={hasMore} loadMore={loadMore}>{hasMore ? <DotLoading /> : null}</InfiniteScroll></div></PullToRefresh>
    <Popup visible={!!editing} onMaskClick={() => !saving && setEditing(null)} bodyStyle={{ borderRadius: '18px 18px 0 0', padding: 18 }}><h3>编辑黑名单原因</h3><Input value={reason} onChange={setReason} placeholder="原因" /><div style={{ marginTop: 12 }}><TextArea value={remarks} onChange={setRemarks} placeholder="备注（可选）" /></div><Button block color="primary" loading={saving} disabled={!reason.trim()} onClick={saveEdit} style={{ marginTop: 16 }}>保存</Button></Popup>
    <Popup visible={!!releaseTarget} onMaskClick={() => !saving && setReleaseTarget(null)} bodyStyle={{ borderRadius: '18px 18px 0 0', padding: 18 }}><h3>释放黑名单</h3><TextArea value={releaseReason} onChange={setReleaseReason} placeholder="请输入释放原因（至少 2 个字）" /><Button block color="danger" loading={saving} disabled={releaseReason.trim().length < 2} onClick={release} style={{ marginTop: 16 }}>确认释放</Button></Popup>
  </div>;
}