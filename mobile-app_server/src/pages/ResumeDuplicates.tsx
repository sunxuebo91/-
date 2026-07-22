import { useCallback, useEffect, useState } from 'react';
import { Button, Dialog, DotLoading, Empty, ErrorBlock, InfiniteScroll, NavBar, Popup, PullToRefresh, Selector, Tabs, TextArea, Toast } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import { useInfiniteList, fmtDateTime } from './_shared';
import { resumeDedupService } from '../services/resumeDedupService';
import { usePermission } from '../hooks/usePermission';
import { useAuthStore } from '../stores/auth';
import type { DedupCandidateDetail, DedupCandidateListItem, DedupCandidateStatus } from '../types';

const errorText = (error: any, fallback: string) => error?.response?.data?.message || error?.message || fallback;
const resumeLabel = (resume: any, id: string) => `${resume?.name || '未知简历'}${resume?.phone ? ` · ${resume.phone}` : ` · ${id.slice(-6)}`}`;

export default function ResumeDuplicates() {
  const navigate = useNavigate();
  const canEdit = usePermission('resume:edit');
  const roles = useAuthStore((state) => state.roles);
  const canManage = roles.includes('admin') || roles.includes('manager');
  const [status, setStatus] = useState<DedupCandidateStatus>('pending');
  const [mergeDetail, setMergeDetail] = useState<DedupCandidateDetail | null>(null);
  const [keepId, setKeepId] = useState<string[]>([]);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const fetchPage = useCallback(async (page: number, pageSize: number) => {
    const data = await resumeDedupService.list({ page, pageSize, status });
    return { list: data.data || [], total: data.total || 0 };
  }, [status]);
  const { items, hasMore, error, loadMore, refresh } = useInfiniteList<DedupCandidateListItem>(fetchPage, 12, { cacheKey: ['resume-duplicates', status] });
  useEffect(() => { refresh().catch(() => {}); }, [refresh]);
  const act = async (action: () => Promise<unknown>, message: string) => { setSaving(true); try { await action(); Toast.show({ icon: 'success', content: message }); await refresh(); } catch (error: any) { Toast.show({ icon: 'fail', content: errorText(error, '操作失败') }); } finally { setSaving(false); } };
  const openMerge = async (item: DedupCandidateListItem) => { try { const detail = await resumeDedupService.detail(item._id); setMergeDetail(detail); setKeepId([detail.recommendedKeepResumeId]); setRemarks(''); } catch (error: any) { Toast.show({ icon: 'fail', content: errorText(error, '候选详情加载失败') }); } };
  const dismiss = async (item: DedupCandidateListItem) => { if (await Dialog.confirm({ title: '忽略重复候选', content: '确认这两份简历不是同一人？该记录将不再出现在待处理列表。', confirmText: '确认忽略' })) await act(() => resumeDedupService.dismiss(item._id), '已忽略候选对'); };
  const snooze = async (item: DedupCandidateListItem) => { if (await Dialog.confirm({ title: '暂缓审核', content: '暂缓 7 天后会重新出现在待处理列表。', confirmText: '暂缓 7 天' })) await act(() => resumeDedupService.snooze(item._id), '已暂缓 7 天'); };
  const merge = async () => { if (!mergeDetail || !keepId[0]) return; if (await Dialog.confirm({ title: '确认合并简历', content: '合并后另一份简历会归档，关联合同、推荐和黑名单将自动重定向。', confirmText: '确认合并' })) { await act(() => resumeDedupService.merge(mergeDetail.candidate._id, { keepResumeId: keepId[0], remarks: remarks.trim() || undefined }), '简历已合并'); setMergeDetail(null); } };
  return <div style={{ minHeight: '100vh', background: '#f5f7fa' }}><NavBar onBack={() => navigate(-1)} right={canManage ? <Button size="small" fill="none" onClick={() => act(() => resumeDedupService.scan(), '扫描任务已完成')}>扫描全库</Button> : null} style={{ background: '#fff', fontWeight: 700 }}>重复简历审核</NavBar><Tabs activeKey={status} onChange={(value) => setStatus(value as DedupCandidateStatus)}><Tabs.Tab title="待处理" key="pending" /><Tabs.Tab title="已合并" key="merged" /><Tabs.Tab title="已忽略" key="dismissed" /></Tabs><PullToRefresh onRefresh={refresh}><div style={{ padding: '12px 16px 40px' }}>{error && !items.length ? <ErrorBlock status="default" title="加载失败" /> : !items.length && !hasMore ? <Empty description="暂无候选记录" /> : items.map((item) => <div key={item._id} style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>相似度 {Math.round(item.similarity)}%</strong><span style={{ color: item.status === 'pending' ? '#d97706' : '#7a8696', fontSize: 12 }}>{item.status}</span></div><div style={{ marginTop: 8, fontSize: 13, color: '#344252' }}>A：{resumeLabel(item.resumeA, item.resumeIdA)}</div><div style={{ marginTop: 5, fontSize: 13, color: '#344252' }}>B：{resumeLabel(item.resumeB, item.resumeIdB)}</div><div style={{ marginTop: 7, color: '#7a8696', fontSize: 12 }}>{item.reason || '系统检测到相似字段'} · {fmtDateTime(item.createdAt)}</div>{item.status === 'pending' && canEdit && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}><Button size="small" fill="none" onClick={() => snooze(item)} disabled={saving}>暂缓</Button><Button size="small" fill="none" onClick={() => dismiss(item)} disabled={saving}>忽略</Button>{canManage && <Button size="small" color="primary" onClick={() => openMerge(item)} disabled={saving}>审核合并</Button>}</div>}</div>)}<InfiniteScroll hasMore={hasMore} loadMore={loadMore}>{hasMore ? <DotLoading /> : null}</InfiniteScroll></div></PullToRefresh><Popup visible={!!mergeDetail} onMaskClick={() => !saving && setMergeDetail(null)} bodyStyle={{ borderRadius: '18px 18px 0 0', padding: 18 }}><h3>选择保留简历</h3><div style={{ color: '#7a8696', fontSize: 12, marginBottom: 12 }}>{mergeDetail?.recommendedKeepReason || '请选择合并后保留的档案'}</div>{mergeDetail && <Selector options={[{ label: `保留 A：${resumeLabel(mergeDetail.resumeA, mergeDetail.candidate.resumeIdA)}`, value: mergeDetail.candidate.resumeIdA }, { label: `保留 B：${resumeLabel(mergeDetail.resumeB, mergeDetail.candidate.resumeIdB)}`, value: mergeDetail.candidate.resumeIdB }]} value={keepId} onChange={setKeepId} />}{mergeDetail && <div style={{ color: '#7a8696', fontSize: 12, marginTop: 12 }}>影响：合同 {mergeDetail.impact.contractsA + mergeDetail.impact.contractsB}、推荐 {mergeDetail.impact.referralsA + mergeDetail.impact.referralsB}、黑名单 {mergeDetail.impact.blacklistsA + mergeDetail.impact.blacklistsB}</div>}<div style={{ marginTop: 12 }}><TextArea value={remarks} onChange={setRemarks} placeholder="合并备注（可选）" /></div><Button block color="primary" loading={saving} disabled={!keepId[0]} onClick={merge} style={{ marginTop: 16 }}>确认合并</Button></Popup></div>;
}