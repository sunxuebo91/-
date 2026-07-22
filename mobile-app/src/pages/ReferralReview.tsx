import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Dialog,
  DotLoading,
  Empty,
  ErrorBlock,
  InfiniteScroll,
  NavBar,
  Popup,
  PullToRefresh,
  SearchBar,
  Selector,
  Tabs,
  TextArea,
  Toast,
} from 'antd-mobile';
import { fmtDate, fmtDateTime, fmtMoney, jobTypeText, useInfiniteList } from './_shared';
import { useAuthStore } from '../stores/auth';
import { referralService } from '../services/modules';
import type { ReferralResume, Referrer } from '../types/modules';

const REVIEW_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending_review: { label: '待审核', color: '#d97706', bg: '#fff4df' },
  approved: { label: '已通过', color: '#16856f', bg: '#e5f6f0' },
  rejected: { label: '已拒绝', color: '#e5484d', bg: '#ffebec' },
  activated: { label: '已激活', color: '#b45309', bg: '#fff7d6' },
};

const RESUME_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending_review: { label: '待审核', color: '#d97706', bg: '#fff4df' },
  rejected: { label: '已拒绝', color: '#e5484d', bg: '#ffebec' },
  following_up: { label: '推荐中', color: '#2b72cb', bg: '#eaf3ff' },
  contracted: { label: '已签单', color: '#16856f', bg: '#e5f6f0' },
  onboarded: { label: '已上户', color: '#16856f', bg: '#e5f6f0' },
  reward_pending: { label: '返费待审核', color: '#9333ea', bg: '#f5e9ff' },
  reward_approved: { label: '返费待打款', color: '#b45309', bg: '#fff4df' },
  reward_paid: { label: '返费已打款', color: '#315ca8', bg: '#eaf1ff' },
  invalid: { label: '未录用', color: '#7a8696', bg: '#eef1f4' },
  activated: { label: '已激活', color: '#b45309', bg: '#fff7d6' },
  released: { label: '已释放', color: '#16856f', bg: '#e5f6f0' },
};

const REFERRER_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending_approval: { label: '待审批', color: '#d97706', bg: '#fff4df' },
  approved: { label: '已通过', color: '#16856f', bg: '#e5f6f0' },
  rejected: { label: '已拒绝', color: '#e5484d', bg: '#ffebec' },
};

const cardStyle = {
  background: '#fff',
  borderRadius: 16,
  padding: 16,
  boxShadow: '0 2px 12px rgba(0,0,0,.04)',
};

const referralActionClass = (tone: 'primary' | 'neutral' | 'danger') =>
  `referral-action-button ${tone}`;

const pillStyle = (status?: string, map: Record<string, { label: string; color: string; bg: string }> = RESUME_STATUS) => {
  const item = map[status || ''] || { label: status || '-', color: '#7a8696', bg: '#eef1f4' };
  return <span style={{ flexShrink: 0, padding: '3px 9px', borderRadius: 20, color: item.color, background: item.bg, fontSize: 11, fontWeight: 600 }}>{item.label}</span>;
};

const row = (label: string, value?: unknown) => (
  <div key={label} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f0f2f4' }}>
    <span style={{ width: 76, flexShrink: 0, color: '#8a93a5', fontSize: 12 }}>{label}</span>
    <span style={{ flex: 1, color: '#344054', fontSize: 13, textAlign: 'right', wordBreak: 'break-all' }}>{value == null || value === '' ? '-' : String(value)}</span>
  </div>
);

type ReviewTab = 'pending' | 'processed' | 'activated';
type MainTab = 'resume' | 'referrer';
type ReviewPopup = { kind: 'resume' | 'referrer'; id: string; name: string } | null;
type StatusTarget = { id: string; name: string; current: string } | null;
type RewardTarget = { id: string; name: string; action: 'approve' | 'reject' | 'markPaid' } | null;

export default function ReferralReview() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const staffId = user?.id || user?._id || '';
  const isAdmin = roles.includes('admin');
  const canSeeAllReferrers = isAdmin || roles.includes('operator');

  const [mainTab, setMainTab] = useState<MainTab>('resume');
  const [reviewTab, setReviewTab] = useState<ReviewTab>('pending');
  const [referrerStatus, setReferrerStatus] = useState('pending_approval');
  const [referrerSearch, setReferrerSearch] = useState('');
  const [resumeDetail, setResumeDetail] = useState<ReferralResume | null>(null);
  const [referrerDetail, setReferrerDetail] = useState<Referrer | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewPopup, setReviewPopup] = useState<ReviewPopup>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [statusTarget, setStatusTarget] = useState<StatusTarget>(null);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [rewardTarget, setRewardTarget] = useState<RewardTarget>(null);
  const [rewardRemark, setRewardRemark] = useState('');
  const [acting, setActing] = useState(false);

  const reviewStatus = reviewTab === 'pending' ? 'pending_review' : reviewTab;
  const fetchResumes = useCallback((page: number, limit: number) => referralService.listAssignedReferrals({
    staffId,
    isAdmin: String(isAdmin),
    reviewStatus,
    page,
    pageSize: limit,
  }), [isAdmin, reviewStatus, staffId]);
  const fetchReferrers = useCallback((page: number, limit: number) => referralService.listReferrers({
    approvalStatus: referrerStatus,
    search: referrerSearch.trim() || undefined,
    sourceStaffId: canSeeAllReferrers ? undefined : staffId,
    page,
    pageSize: limit,
  }), [canSeeAllReferrers, referrerSearch, referrerStatus, staffId]);

  const resumes = useInfiniteList<ReferralResume>(fetchResumes, 10, { cacheKey: ['referral-review', reviewStatus], staleTime: 15_000 });
  const referrers = useInfiniteList<Referrer>(fetchReferrers, 10, { cacheKey: ['referrer-review', referrerStatus, referrerSearch], staleTime: 15_000 });
  const refreshResumes = resumes.refresh;
  const refreshReferrers = referrers.refresh;

  useEffect(() => {
    if (mainTab === 'resume' && staffId) void refreshResumes().catch(() => {});
  }, [mainTab, refreshResumes, reviewStatus, staffId]);
  useEffect(() => {
    if (mainTab === 'referrer' && staffId) void refreshReferrers().catch(() => {});
  }, [mainTab, refreshReferrers, referrerSearch, referrerStatus, staffId]);

  const openResumeDetail = async (record: ReferralResume) => {
    setResumeDetail(record);
    const id = record._id || record.id;
    if (!id) return;
    setDetailLoading(true);
    try {
      const detail = await referralService.getReferralDetail(id);
      setResumeDetail(detail);
    } catch {
      // 列表数据足够展示时保留当前详情，避免因详情接口失败阻断审核。
    } finally {
      setDetailLoading(false);
    }
  };

  const resumeId = (record: ReferralResume) => record._id || record.id || '';
  const referrerId = (record: Referrer) => record._id || record.id || '';
  // 列表可由运营查看全量，但审批动作必须与后端一致：管理员或来源员工才可操作。
  const canReviewThisReferrer = (record: Referrer) => isAdmin || record.sourceStaffId === staffId;

  const submitResumeReview = async (result: 'approve' | 'reject', id: string, note?: string) => {
    if (!staffId) return;
    setActing(true);
    try {
      await referralService.reviewReferral(staffId, isAdmin, id, result, note);
      Toast.show({ icon: 'success', content: result === 'approve' ? '推荐简历已通过' : '推荐简历已拒绝' });
      setReviewPopup(null);
      setReviewNote('');
      setResumeDetail(null);
      await resumes.refresh();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '审核失败' });
    } finally {
      setActing(false);
    }
  };

  const submitReferrerReview = async (result: 'approve' | 'reject', id: string, reason?: string) => {
    if (!staffId) return;
    setActing(true);
    try {
      if (result === 'approve') await referralService.approveReferrer(staffId, id);
      else await referralService.rejectReferrer(staffId, id, reason || '');
      Toast.show({ icon: 'success', content: result === 'approve' ? '推荐人审批已通过' : '推荐人申请已拒绝' });
      setReviewPopup(null);
      setReviewNote('');
      setReferrerDetail(null);
      await referrers.refresh();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '审批失败' });
    } finally {
      setActing(false);
    }
  };

  const confirmResumeApprove = async (record: ReferralResume) => {
    const ok = await Dialog.confirm({ title: '确认通过审核？', content: `通过后「${record.name || '该候选人'}」将进入推荐跟进流程。`, confirmText: '确认通过', cancelText: '暂不操作' });
    if (ok) await submitResumeReview('approve', resumeId(record));
  };

  const confirmReferrerApprove = async (record: Referrer) => {
    const ok = await Dialog.confirm({ title: '确认通过推荐人申请？', content: `通过后「${record.name || '该申请人'}」即可录入推荐阿姨信息。`, confirmText: '确认通过', cancelText: '暂不操作' });
    if (ok) await submitReferrerReview('approve', referrerId(record));
  };

  const submitStatus = async () => {
    if (!statusTarget || !selectedStatus[0] || !staffId) return;
    setActing(true);
    try {
      await referralService.updateReferralStatus(staffId, isAdmin, statusTarget.id, selectedStatus[0]);
      Toast.show({ icon: 'success', content: '跟进状态已更新' });
      setStatusTarget(null);
      await resumes.refresh();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '状态更新失败' });
    } finally {
      setActing(false);
    }
  };

  const releaseResume = async (record: ReferralResume) => {
    const id = resumeId(record);
    const ok = await Dialog.confirm({ title: '释放到简历库？', content: `将「${record.name || '该候选人'}」创建到简历库，后续推荐跟进仍保留。`, confirmText: '确认释放', cancelText: '取消' });
    if (!ok || !staffId) return;
    setActing(true);
    try {
      await referralService.releaseToResumeLibrary(staffId, isAdmin, id);
      Toast.show({ icon: 'success', content: '已释放到简历库' });
      setResumeDetail(null);
      await resumes.refresh();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '释放失败' });
    } finally {
      setActing(false);
    }
  };

  const submitReward = async () => {
    if (!rewardTarget || !staffId) return;
    if (rewardTarget.action === 'reject' && !rewardRemark.trim()) {
      Toast.show({ content: '驳回返费时必须填写原因' });
      return;
    }
    setActing(true);
    try {
      await referralService.processReward(staffId, isAdmin, rewardTarget.id, rewardTarget.action, rewardRemark.trim() || undefined);
      Toast.show({ icon: 'success', content: rewardTarget.action === 'markPaid' ? '已标记打款' : rewardTarget.action === 'approve' ? '返费审核已通过' : '返费申请已驳回' });
      setRewardTarget(null);
      setRewardRemark('');
      setResumeDetail(null);
      await resumes.refresh();
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '返费操作失败' });
    } finally {
      setActing(false);
    }
  };

  const statusOptions = useMemo(() => {
    if (!statusTarget) return [];
    if (statusTarget.current === 'following_up') return [{ label: '标记为未录用', value: 'invalid' }];
    if (statusTarget.current === 'contracted') return [{ label: '标记为已上户', value: 'onboarded' }];
    if (statusTarget.current === 'onboarded') return [{ label: '发起返费审核', value: 'reward_pending' }];
    return [];
  }, [statusTarget]);

  const resumeActions = (record: ReferralResume, compact = false) => {
    const id = resumeId(record);
    const pending = record.reviewStatus === 'pending_review';
    const canUpdate = record.reviewStatus === 'approved' && ['following_up', 'contracted', 'onboarded'].includes(record.status || '');
    const canRelease = ['approved', 'following_up'].includes(record.status || '') && !record.linkedResumeId;
    const canReward = record.status === 'reward_pending' || (record.status === 'onboarded' && record.rewardStatus === 'pending');
    const canPay = record.status === 'reward_approved';
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: compact ? 10 : 14 }} onClick={(event) => event.stopPropagation()}>
        {pending && <><Button size="small" fill="solid" className={referralActionClass('primary')} onClick={() => { void confirmResumeApprove(record); }} disabled={acting}>通过</Button><Button size="small" fill="solid" className={referralActionClass('danger')} onClick={() => { setReviewPopup({ kind: 'resume', id, name: record.name || '该候选人' }); setReviewNote(''); }} disabled={acting}>拒绝</Button></>}
        {canUpdate && <Button size="small" fill="solid" className={referralActionClass('neutral')} onClick={() => { setStatusTarget({ id, name: record.name || '该候选人', current: record.status || '' }); setSelectedStatus([]); }} disabled={acting}>更新状态</Button>}
        {canRelease && <Button size="small" fill="solid" className={referralActionClass('neutral')} onClick={() => { void releaseResume(record); }} disabled={acting}>释放到简历库</Button>}
        {canReward && <><Button size="small" fill="solid" className={referralActionClass('primary')} onClick={() => { setRewardTarget({ id, name: record.name || '该候选人', action: 'approve' }); setRewardRemark(''); }} disabled={acting}>返费通过</Button><Button size="small" fill="solid" className={referralActionClass('danger')} onClick={() => { setRewardTarget({ id, name: record.name || '该候选人', action: 'reject' }); setRewardRemark(''); }} disabled={acting}>返费驳回</Button></>}
        {canPay && <Button size="small" fill="solid" className={referralActionClass('primary')} onClick={() => { setRewardTarget({ id, name: record.name || '该候选人', action: 'markPaid' }); setRewardRemark(''); }} disabled={acting}>确认打款</Button>}
      </div>
    );
  };

  const resumeList = () => {
    const { items, hasMore, error, loadMore } = resumes;
    return <PullToRefresh onRefresh={resumes.refresh}><div style={{ padding: '12px 16px 84px' }}>{error && !items.length ? <ErrorBlock status="default" title="加载失败" description="下拉刷新重试" /> : !items.length && !hasMore ? <Empty description={reviewTab === 'pending' ? '暂无待审核简历' : '暂无记录'} /> : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{items.map((record, index) => <div key={resumeId(record) || index} style={cardStyle} onClick={() => { void openResumeDetail(record); }} role="button" tabIndex={0}><div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}><div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 17 }}>{record.name || '未命名候选人'}</b><div style={{ marginTop: 5, color: '#667085', fontSize: 13 }}>{record.phone || '-'}{record.serviceType ? `　·　${jobTypeText(record.serviceType)}` : ''}</div></div>{pillStyle(record.reviewStatus, REVIEW_STATUS)}</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0f2f4' }}><span style={{ color: '#667085', fontSize: 12 }}>推荐人：{record.referrerName || '-'}</span><span style={{ marginLeft: 'auto' }}>{pillStyle(record.status)}</span></div>{record.reviewDeadlineAt && <div style={{ marginTop: 8, color: new Date(record.reviewDeadlineAt) < new Date() ? '#e5484d' : '#8a93a5', fontSize: 12 }}>审核截止：{fmtDateTime(record.reviewDeadlineAt)}</div>}{resumeActions(record, true)}</div>)}</div>}<InfiniteScroll loadMore={loadMore} hasMore={hasMore}>{hasMore ? <DotLoading color="primary" /> : items.length ? <span style={{ color: '#999', fontSize: 12 }}>已到底部</span> : ''}</InfiniteScroll></div></PullToRefresh>;
  };

  const referrerList = () => {
    const { items, hasMore, error, loadMore } = referrers;
    return <PullToRefresh onRefresh={referrers.refresh}><div style={{ padding: '12px 16px 84px' }}><div style={{ marginBottom: 10 }}><SearchBar value={referrerSearch} onChange={setReferrerSearch} onSearch={() => { void referrers.refresh(); }} placeholder="搜索姓名或手机号" style={{ '--border-radius': '20px', '--background': '#f5f7fa' }} /></div><Selector options={[{ label: '待审批', value: 'pending_approval' }, { label: '已通过', value: 'approved' }, { label: '已拒绝', value: 'rejected' }]} value={[referrerStatus]} onChange={(value) => setReferrerStatus(value[0] || 'pending_approval')} columns={3} style={{ '--border-radius': '10px', '--checked-color': 'rgba(21,143,130,.08)', '--checked-text-color': '#158F82', '--padding': '8px 0', marginBottom: 12 } as any} />{error && !items.length ? <ErrorBlock status="default" title="加载失败" description="下拉刷新重试" /> : !items.length && !hasMore ? <Empty description="暂无推荐人记录" /> : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{items.map((record, index) => { const canAct = canReviewThisReferrer(record) && record.approvalStatus === 'pending_approval'; return <div key={referrerId(record) || index} style={cardStyle} onClick={() => setReferrerDetail(record)} role="button" tabIndex={0}><div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}><div style={{ flex: 1 }}><b style={{ fontSize: 17 }}>{record.name || '未命名推荐人'}</b><div style={{ color: '#667085', fontSize: 13, marginTop: 5 }}>{record.phone || '-'}{record.sourceStaffName ? `　·　来源员工 ${record.sourceStaffName}` : ''}</div></div>{pillStyle(record.approvalStatus, REFERRER_STATUS)}</div><div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0f2f4', color: '#667085', fontSize: 12 }}><span>推荐 {record.totalReferrals ?? record.referralCount ?? 0} 条</span><span>上户 {record.onboardedCount ?? 0} 条</span><span style={{ marginLeft: 'auto' }}>{fmtDate(record.createdAt)}</span></div>{canAct && <div style={{ display: 'flex', gap: 8, marginTop: 12 }} onClick={(event) => event.stopPropagation()}><Button size="small" fill="solid" className={referralActionClass('primary')} onClick={() => { void confirmReferrerApprove(record); }} disabled={acting}>通过</Button><Button size="small" fill="solid" className={referralActionClass('danger')} onClick={() => { setReviewPopup({ kind: 'referrer', id: referrerId(record), name: record.name || '该推荐人' }); setReviewNote(''); }} disabled={acting}>拒绝</Button></div>}</div>; })}</div>}<InfiniteScroll loadMore={loadMore} hasMore={hasMore}>{hasMore ? <DotLoading color="primary" /> : items.length ? <span style={{ color: '#999', fontSize: 12 }}>已到底部</span> : ''}</InfiniteScroll></div></PullToRefresh>;
  };

  return <div style={{ minHeight: '100vh', background: '#f5f7fa' }}><NavBar onBack={() => navigate(-1)} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 20, fontWeight: 700 }}>推荐管理</NavBar><Tabs activeKey={mainTab} onChange={(key) => setMainTab(key as MainTab)} style={{ background: '#fff' }}><Tabs.Tab title="简历审核" key="resume" /><Tabs.Tab title="推荐人审核" key="referrer" /></Tabs>{mainTab === 'resume' ? <><Tabs activeKey={reviewTab} onChange={(key) => setReviewTab(key as ReviewTab)} style={{ background: '#fff', '--title-font-size': '13px' }}><Tabs.Tab title="待审核" key="pending" /><Tabs.Tab title="已处理" key="processed" /><Tabs.Tab title="已激活" key="activated" /></Tabs>{resumeList()}</> : referrerList()}

    <Popup visible={!!reviewPopup} onMaskClick={() => !acting && setReviewPopup(null)} bodyStyle={{ borderRadius: '18px 18px 0 0', padding: 18 }}><h3 style={{ margin: '0 0 10px' }}>{reviewPopup?.kind === 'resume' ? '拒绝推荐简历' : '拒绝推荐人申请'}</h3><div style={{ color: '#667085', fontSize: 13, marginBottom: 10 }}>对象：{reviewPopup?.name || '-'}</div><TextArea value={reviewNote} onChange={setReviewNote} placeholder="请输入拒绝原因（必填）" rows={4} maxLength={200} showCount /><Button block color="danger" loading={acting} disabled={!reviewNote.trim()} onClick={() => { if (!reviewPopup) return; void (reviewPopup.kind === 'resume' ? submitResumeReview('reject', reviewPopup.id, reviewNote.trim()) : submitReferrerReview('reject', reviewPopup.id, reviewNote.trim())); }} style={{ marginTop: 16, height: 44, borderRadius: 22 }}>确认拒绝</Button></Popup>

    <Popup visible={!!statusTarget} onMaskClick={() => !acting && setStatusTarget(null)} bodyStyle={{ borderRadius: '18px 18px 0 0', padding: 18 }}><h3 style={{ margin: '0 0 8px' }}>更新跟进状态</h3><div style={{ color: '#667085', fontSize: 13, marginBottom: 12 }}>当前：{RESUME_STATUS[statusTarget?.current || '']?.label || statusTarget?.current || '-'} · {statusTarget?.name || '-'}</div><Selector options={statusOptions} value={selectedStatus} onChange={setSelectedStatus} columns={statusOptions.length > 1 ? 2 : 1} style={{ '--border-radius': '12px', '--checked-color': 'rgba(21,143,130,.08)', '--checked-text-color': '#158F82' } as any} /><Button block color="primary" loading={acting} disabled={!selectedStatus[0]} onClick={() => { void submitStatus(); }} style={{ marginTop: 16, height: 44, borderRadius: 22 }}>确认更新</Button></Popup>

    <Popup visible={!!rewardTarget} onMaskClick={() => !acting && setRewardTarget(null)} bodyStyle={{ borderRadius: '18px 18px 0 0', padding: 18 }}><h3 style={{ margin: '0 0 8px' }}>{rewardTarget?.action === 'markPaid' ? '确认返费已打款' : rewardTarget?.action === 'approve' ? '通过返费申请' : '驳回返费申请'}</h3><div style={{ color: '#667085', fontSize: 13, marginBottom: 12 }}>对象：{rewardTarget?.name || '-'}</div><TextArea value={rewardRemark} onChange={setRewardRemark} placeholder={rewardTarget?.action === 'reject' ? '请输入驳回原因（必填）' : '备注（可选）'} rows={3} maxLength={200} showCount /><Button block color={rewardTarget?.action === 'reject' ? 'danger' : 'primary'} loading={acting} disabled={rewardTarget?.action === 'reject' && !rewardRemark.trim()} onClick={() => { void submitReward(); }} style={{ marginTop: 16, height: 44, borderRadius: 22 }}>确认操作</Button></Popup>

    <Popup visible={!!resumeDetail} onMaskClick={() => !detailLoading && setResumeDetail(null)} bodyStyle={{ height: '86vh', display: 'flex', flexDirection: 'column', borderRadius: '18px 18px 0 0', background: '#f5f7fa' }}><div style={{ padding: '18px 16px 14px', background: '#fff', fontSize: 18, fontWeight: 700 }}>推荐简历详情</div>{resumeDetail && <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>{detailLoading && <div style={{ textAlign: 'center', padding: 12 }}><DotLoading color="primary" /></div>}<section style={cardStyle}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b style={{ fontSize: 19 }}>{resumeDetail.name || '-'}</b>{pillStyle(resumeDetail.reviewStatus, REVIEW_STATUS)}</div>{row('手机号', resumeDetail.phone)}{row('工种', jobTypeText(resumeDetail.serviceType))}{row('身份证号', resumeDetail.idCard)}{row('从业经验', resumeDetail.experience)}{row('推荐人', resumeDetail.referrerName)}{row('推荐人电话', resumeDetail.referrerPhone)}{row('整体状态', RESUME_STATUS[resumeDetail.status || '']?.label || resumeDetail.status)}{row('审核备注', resumeDetail.reviewNote)}{row('提交时间', fmtDateTime(resumeDetail.createdAt))}{resumeDetail.contractSignedAt && row('签单时间', fmtDate(resumeDetail.contractSignedAt))}{resumeDetail.onboardedAt && row('上户时间', fmtDate(resumeDetail.onboardedAt))}{resumeDetail.rewardAmount != null && row('预计返费', fmtMoney(resumeDetail.rewardAmount))}</section>{resumeDetail.contract && <section style={{ ...cardStyle, marginTop: 12 }}><b style={{ fontSize: 15 }}>合同记录</b>{row('订单编号', resumeDetail.contract.orderNumber)}{row('服务费', fmtMoney(resumeDetail.contract.serviceFee))}{row('阿姨工资', resumeDetail.contract.nannySalary == null ? '-' : `${fmtMoney(resumeDetail.contract.nannySalary)}/月`)}{row('上户时间', fmtDate(resumeDetail.contract.onboardDate))}</section>}{resumeActions(resumeDetail)}</div>}</Popup>

    <Popup visible={!!referrerDetail} onMaskClick={() => setReferrerDetail(null)} bodyStyle={{ borderRadius: '18px 18px 0 0', padding: 18 }}><h3 style={{ margin: '0 0 12px' }}>推荐人详情</h3>{referrerDetail && <><section style={cardStyle}>{row('姓名', referrerDetail.name)}{row('手机号', referrerDetail.phone)}{row('微信号', referrerDetail.wechatId)}{row('来源员工', referrerDetail.sourceStaffName)}{row('审批状态', REFERRER_STATUS[referrerDetail.approvalStatus || '']?.label || referrerDetail.approvalStatus)}{row('推荐数量', referrerDetail.totalReferrals ?? referrerDetail.referralCount)}{row('成功上户', referrerDetail.onboardedCount)}{row('累计返费', fmtMoney(referrerDetail.totalRewardAmount))}{row('注册时间', fmtDateTime(referrerDetail.createdAt))}{referrerDetail.rejectedReason && row('拒绝原因', referrerDetail.rejectedReason)}</section>{canReviewThisReferrer(referrerDetail) && referrerDetail.approvalStatus === 'pending_approval' && <div style={{ display: 'flex', gap: 8, marginTop: 14 }}><Button block color="primary" onClick={() => { void confirmReferrerApprove(referrerDetail); }}>通过</Button><Button block color="danger" fill="outline" onClick={() => { setReviewPopup({ kind: 'referrer', id: referrerId(referrerDetail), name: referrerDetail.name || '该推荐人' }); setReviewNote(''); }}>拒绝</Button></div>}</>}</Popup>
  </div>;
}