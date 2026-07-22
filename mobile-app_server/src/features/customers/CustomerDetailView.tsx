import { useEffect, useState } from 'react';
import { Button, DotLoading, ErrorBlock, NavBar, Popup, Space, Tabs, TextArea, Toast } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '../../hooks/usePermission';
import { useApi } from '../../hooks/useApi';
import { customerService } from '../../services/customerService';
import { fmtDate, fmtDateTime, fmtMoney } from '../../pages/_shared';
import { CACHE_TIME } from '../../lib/queryClient';
import type { Customer } from '../../types';
import { CustomerFollowUps } from './CustomerFollowUps';
import { cardStyle, displayUser, subtleText } from './constants';
import type { DetailRow } from './types';

function DetailCard({ title, rows }: { title: string; rows: DetailRow[] }) {
  return <section style={{ ...cardStyle, padding: 16, marginBottom: 12 }}><div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 12 }}>{title}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>{rows.map((row) => <div key={row.label} style={{ gridColumn: row.wide ? '1 / -1' : undefined, padding: '10px 12px', borderRadius: 10, background: '#f7f8fa', minWidth: 0 }}><div style={{ color: '#8a93a5', fontSize: 12, marginBottom: 4 }}>{row.label}</div><div style={{ ...subtleText, color: '#333', wordBreak: 'break-word', whiteSpace: row.wide ? 'pre-wrap' : undefined }}>{row.value || '-'}</div></div>)}</div></section>;
}

interface CustomerDetailViewProps { id: string; onBack: () => void; onEdit: () => void; canEdit: boolean; openFollowUpOnMount?: boolean; }

export function CustomerDetailView({ id, onBack, onEdit, canEdit, openFollowUpOnMount }: CustomerDetailViewProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [quickFollowUpToken, setQuickFollowUpToken] = useState(0);
  const [releaseVisible, setReleaseVisible] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');
  const [releasing, setReleasing] = useState(false);
  const [urgentVisible, setUrgentVisible] = useState(false);
  const [urgentReason, setUrgentReason] = useState('');
  const [savingUrgency, setSavingUrgency] = useState(false);
  const [pushingToAunties, setPushingToAunties] = useState(false);
  const navigate = useNavigate();
  const canCreateContract = usePermission('contract:create');
  const { data, loading, error, run } = useApi<Customer>(customerService.getCustomerById, { cacheKey: (customerId: string) => ['customer', customerId], staleTime: CACHE_TIME.detail.staleTime, gcTime: CACHE_TIME.detail.gcTime });
  useEffect(() => { run(id).catch(() => {}); }, [id, run]);
  useEffect(() => { if (openFollowUpOnMount) { setActiveTab('followUps'); setQuickFollowUpToken((value) => value + 1); } }, [openFollowUpOnMount]);
  const openQuickFollowUp = () => {
    if (!canEdit) { Toast.show({ icon: 'fail', content: '您没有新增跟进权限' }); return; }
    setActiveTab('followUps');
    setQuickFollowUpToken((value) => value + 1);
  };
  const createContract = () => {
    if (!data) return;
    if (!canCreateContract) { Toast.show({ icon: 'fail', content: '您没有创建合同权限' }); return; }
    navigate('/contracts', { state: { createForCustomer: data } });
  };
  const releaseToPool = async () => {
    if (!releaseReason.trim()) { Toast.show({ content: '请填写释放原因' }); return; }
    setReleasing(true);
    try {
      await customerService.releaseToPool(id, releaseReason.trim());
      await run(id);
      setReleaseReason(''); setReleaseVisible(false);
      Toast.show({ icon: 'success', content: '客户已释放至公海' });
    } catch (error: any) { Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '释放失败，请重试' }); } finally { setReleasing(false); }
  };
  const updateUrgency = async (isUrgent: boolean) => {
    if (isUrgent && !urgentReason.trim()) { Toast.show({ content: '请填写紧急原因' }); return; }
    setSavingUrgency(true);
    try {
      await customerService.updateUrgency(id, isUrgent, urgentReason.trim() || undefined);
      await run(id);
      setUrgentReason(''); setUrgentVisible(false);
      Toast.show({ icon: 'success', content: isUrgent ? '已标记紧急客户' : '已取消紧急标记' });
    } catch (error: any) { Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '紧急状态更新失败' }); } finally { setSavingUrgency(false); }
  };
  const toggleStar = async () => {
    if (!data) return;
    try { await customerService.updateStar(id, !data.isStarred); await run(id); Toast.show({ icon: 'success', content: data.isStarred ? '已取消星标' : '已加入星标' }); } catch (error: any) { Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '星标更新失败' }); }
  };
  const pushToAunties = async () => {
    setPushingToAunties(true);
    try { await customerService.pushToAunties(id); Toast.show({ icon: 'success', content: '已发布至阿姨接单大厅' }); } catch (error: any) { Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '发布失败，请检查客户需求品类' }); } finally { setPushingToAunties(false); }
  };
  return <div style={{ background: '#f5f7fa', minHeight: '100vh', paddingBottom: 'calc(126px + env(safe-area-inset-bottom))' }}>
    <NavBar onBack={onBack} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }} right={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%', gap: 12 }}>{canEdit && data ? <button type="button" onClick={onEdit} style={{ width: 40, height: 32, padding: 0, border: 'none', background: 'transparent', color: '#158F82', font: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>编辑</button> : null}{canEdit && data && !data.inPublicPool ? <button type="button" onClick={() => setReleaseVisible(true)} style={{ width: 40, height: 32, padding: 0, border: 'none', background: 'transparent', color: '#158F82', font: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>释放</button> : null}</div>}>客户详情</NavBar>
    {loading && !data && <div style={{ textAlign: 'center', padding: 24 }}><DotLoading color="primary" /></div>}
    {error && !data && <ErrorBlock status="default" title="加载失败" description="请返回后重试" style={{ padding: 24 }} />}
    {data && <><div style={{ padding: '16px 16px 0' }}><div style={{ position: 'relative', borderRadius: 16, padding: 18, color: '#fff', background: 'linear-gradient(135deg, #158F82, #27aea0)', boxShadow: '0 4px 14px rgba(21,143,130,.2)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 12, fontFamily: 'monospace', opacity: .92 }}>{data.customerId || data._id}</span><span style={{ marginLeft: 'auto', padding: '3px 9px', borderRadius: 16, background: 'rgba(255,255,255,.2)', fontSize: 12, fontWeight: 600 }}>{data.contractStatus || '待定'}</span></div><div style={{ marginTop: 9, fontSize: 21, fontWeight: 700 }}>{data.name}{data.isUrgent && <span aria-label="紧急客户" style={{ marginLeft: 7, fontSize: 17 }}>🚨</span>}{data.isStarred && <span aria-label="已星标" style={{ marginLeft: 7, color: '#ffe08a', fontSize: 18 }}>★</span>}</div><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingRight: 46, fontSize: 13, opacity: .94 }}><span>{data.phone || '-'}</span><span>·　{data.serviceCategory || data.followUpStatus || '未填写服务需求'}</span></div><button type="button" aria-label="拨打电话" onClick={() => { if (!data.phone) { Toast.show({ content: '该客户未填写联系电话' }); return; } window.location.href = `tel:${data.phone}`; }} style={{ position: 'absolute', right: 18, bottom: 12, width: 40, height: 40, padding: 0, border: '1px solid rgba(255,255,255,.7)', borderRadius: 20, background: 'rgba(255,255,255,.2)', color: '#fff', fontSize: 17, lineHeight: 1, cursor: 'pointer' }}>📞</button></div></div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ background: '#fff', '--title-font-size': '14px' }}><Tabs.Tab title="概览" key="overview" /><Tabs.Tab title="服务需求" key="requirements" /><Tabs.Tab title="管理" key="management" /><Tabs.Tab title="跟进" key="followUps" /></Tabs>
      <div style={{ padding: 12 }}>
        {activeTab === 'overview' && <><DetailCard title="📋 基础信息" rows={[{ label: '客户编号', value: data.customerId || data._id }, { label: '微信号', value: data.wechatId || '-' }, { label: '身份证号', value: data.idCardNumber || '-' }, { label: '线索来源', value: data.leadSource || '-' }, { label: '居住地址', value: data.address || '-', wide: true }, { label: '家庭人口', value: data.familySize != null ? `${data.familySize} 人` : '-' }, { label: '成交金额', value: <span style={{ color: '#FF8F1F', fontWeight: 600 }}>{fmtMoney(data.dealAmount)}</span> }]} /><DetailCard title="📝 备注" rows={[{ label: '备注信息', value: data.remarks || '-', wide: true }]} /></>}
        {activeTab === 'requirements' && <><DetailCard title="🎯 服务与家庭" rows={[{ label: '需求品类', value: data.serviceCategory || '-' }, { label: '薪资预算', value: <span style={{ color: '#FF8F1F', fontWeight: 600 }}>{fmtMoney(data.salaryBudget)}</span> }, { label: '休息方式', value: data.restSchedule || '-' }, { label: '期望上户日期', value: data.expectedStartDate ? fmtDate(data.expectedStartDate) : '-' }, { label: '预产期', value: data.expectedDeliveryDate ? fmtDate(data.expectedDeliveryDate) : '-' }, { label: '服务天数', value: data.serviceDays != null ? `${data.serviceDays} 天` : '-' }, { label: '家庭面积', value: data.homeArea != null ? `${data.homeArea} ㎡` : '-' }, { label: '家庭人口', value: data.familySize != null ? `${data.familySize} 人` : '-' }, { label: '服务地址', value: data.address || '-', wide: true }]} /><DetailCard title="👤 阿姨要求" rows={[{ label: '年龄要求', value: data.ageRequirement || '-' }, { label: '性别要求', value: data.genderRequirement || '-' }, { label: '籍贯要求', value: data.originRequirement || '-' }, { label: '学历要求', value: data.educationRequirement || '-' }, { label: '工作时间', value: data.needWorkingHours || '-' }, { label: '服务周期', value: data.needServicePeriod || '-' }, { label: '工作内容', value: data.needWorkContent || '-', wide: true }, { label: '需求备注', value: data.needRemarks || '-', wide: true }]} /></>}
        {activeTab === 'management' && <><DetailCard title="⚙️ 归属与系统信息" rows={[{ label: '当前负责人', value: displayUser(data.assignedToUser, data.assignedTo) }, { label: '分配时间', value: data.assignedAt ? fmtDateTime(data.assignedAt) : '-' }, { label: '分配人', value: displayUser(data.assignedByUser, data.assignedBy) }, { label: '分配备注', value: data.assignmentReason || '-' }, { label: '线索状态', value: data.followUpStatus || '已跟进' }, { label: '紧急状态', value: data.isUrgent ? `紧急${data.urgentReason ? `：${data.urgentReason}` : ''}` : '正常' }, { label: '流转次数', value: `${data.transferCount || 0} 次` }, { label: '公海状态', value: data.inPublicPool ? '在公海' : '非公海' }, { label: '冻结状态', value: data.isFrozen ? `已冻结${data.frozenReason ? `：${data.frozenReason}` : ''}` : '正常' }, { label: '创建人', value: displayUser(data.createdByUser, data.createdBy) }, { label: '创建时间', value: data.createdAt ? fmtDateTime(data.createdAt) : '-' }, { label: '最后更新人', value: displayUser(data.lastUpdatedByUser, data.lastUpdatedBy) }, { label: '最后更新时间', value: data.updatedAt ? fmtDateTime(data.updatedAt) : '-' }]} />{canEdit && !data.inPublicPool && <Space block direction="vertical"><Button block fill="outline" color="primary" onClick={toggleStar} style={{ borderRadius: 22 }}>{data.isStarred ? '取消个人星标' : '加入个人星标'}</Button><Button block fill="outline" color={data.isUrgent ? 'warning' : 'danger'} onClick={() => data.isUrgent ? updateUrgency(false) : setUrgentVisible(true)} style={{ borderRadius: 22 }}>{data.isUrgent ? '取消紧急标记' : '标记紧急客户'}</Button><Button block color="primary" loading={pushingToAunties} disabled={pushingToAunties} onClick={pushToAunties} style={{ borderRadius: 22 }}>发布至阿姨接单大厅</Button><Button block fill="outline" color="danger" onClick={() => setReleaseVisible(true)} style={{ borderRadius: 22 }}>释放线索至公海</Button></Space>}</>}
        {activeTab === 'followUps' && <div style={{ ...cardStyle, overflow: 'hidden' }}><CustomerFollowUps customerId={id} canEdit={canEdit} openFormToken={quickFollowUpToken} /></div>}
      </div>
      {(canEdit || canCreateContract) && <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(50px + env(safe-area-inset-bottom))', zIndex: 90, padding: '8px 16px', background: 'rgba(255,255,255,.97)', boxShadow: '0 -3px 12px rgba(0,0,0,.08)', display: 'flex', gap: 8 }}>{canEdit && <Button size="small" fill="outline" color="primary" onClick={openQuickFollowUp} style={{ flex: 1, height: 42, borderRadius: 22 }}>添加跟进</Button>}{canCreateContract && <Button size="small" color="primary" onClick={createContract} style={{ flex: 1, height: 42, borderRadius: 22 }}>发起合同</Button>}</div>}
    </>}
    <Popup visible={releaseVisible} onMaskClick={() => !releasing && setReleaseVisible(false)} bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: '20px 16px 32px' }}><div style={{ fontSize: 18, fontWeight: 700, color: '#1e2a35' }}>释放线索至公海</div><div style={{ margin: '10px 0 16px', color: '#b5474f', fontSize: 13, lineHeight: 1.6 }}>释放后将取消当前负责人并进入公海；仅负责人或管理员可执行，操作会保留审计记录。</div><TextArea value={releaseReason} onChange={setReleaseReason} placeholder="请填写释放原因" rows={3} maxLength={200} showCount /><div style={{ display: 'flex', gap: 10, marginTop: 20 }}><Button block disabled={releasing} onClick={() => setReleaseVisible(false)}>取消</Button><Button block color="danger" loading={releasing} disabled={releasing} onClick={releaseToPool}>确认释放</Button></div></Popup>
    <Popup visible={urgentVisible} onMaskClick={() => !savingUrgency && setUrgentVisible(false)} bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: '20px 16px 32px' }}><div style={{ fontSize: 18, fontWeight: 700, color: '#1e2a35' }}>标记紧急客户</div><div style={{ margin: '10px 0 16px', color: '#b5474f', fontSize: 13, lineHeight: 1.6 }}>紧急标记会在列表显示红色边框和告警图标，并保留操作原因及审计记录。</div><TextArea value={urgentReason} onChange={setUrgentReason} placeholder="请填写紧急原因" rows={3} maxLength={200} showCount /><div style={{ display: 'flex', gap: 10, marginTop: 20 }}><Button block disabled={savingUrgency} onClick={() => setUrgentVisible(false)}>取消</Button><Button block color="danger" loading={savingUrgency} disabled={savingUrgency} onClick={() => updateUrgency(true)}>确认标记</Button></div></Popup>
  </div>;
}