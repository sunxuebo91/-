import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DotLoading,
  Empty,
  ErrorBlock,
  InfiniteScroll,
  Input,
  NavBar,
  Popup,
  PullToRefresh,
  SearchBar,
  Selector,
  Switch,
  Tabs,
  TextArea,
  Toast,
} from 'antd-mobile';
import { AddOutline, DeleteOutline, MoreOutline } from 'antd-mobile-icons';
import { useInfiniteList, fmtDate, fmtDateTime, fmtMoney } from './_shared';
import { usePermission } from '../hooks/usePermission';
import { useAuthStore } from '../stores/auth';
import { trainingLeadService } from '../services/modules';
import type { LeadUser, TrainingLead, TrainingLeadFollowUp, TrainingLeadInput, TrainingLeadQuery } from '../types/modules';
import { TrainingContractForm } from './TrainingContractForm';

const STATUS_OPTIONS = ['新客未跟进', '流转未跟进', '未跟进', '7天未跟进', '15天未跟进', '跟进中', '已到店', '已报名', '已结业', '无效线索'];
const SOURCE_OPTIONS = ['美团', '抖音', '快手', '小红书', '转介绍', '幼亲舒', 'BOSS直聘', '其他'];
const POSITION_OPTIONS = ['育婴师', '母婴护理师', '养老护理员', '住家保姆', '其他'];
const TRAINING_TYPE_OPTIONS = ['月嫂', '育儿嫂', '保姆', '护老', '师资'];
const COURSE_OPTIONS = ['高级母婴护理师', '高级催乳师', '高级产后修复师', '月子餐营养师', '高级育婴师', '早教指导师', '辅食营养师', '小儿推拿师', '高级养老护理师', '早教精英班'];
const INTENTION_OPTIONS = ['高', '中', '低'];
const GRADE_OPTIONS = ['A', 'B', 'C', 'D', 'O'];
const RESULT_OPTIONS: Record<string, string[]> = {
  电话: ['已接通', '未接通', '关机', '停机', '拒接', '忙线'],
  微信: ['已回复', '未回复', '已读未回', '已拉黑'],
  到店: ['已到店', '未到店', '爽约'],
  其他: ['成功', '失败'],
};
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  新客未跟进: { bg: '#fff1f0', text: '#d9363e' }, '15天未跟进': { bg: '#fff1f0', text: '#d9363e' },
  '7天未跟进': { bg: '#fff7e8', text: '#d46b08' }, 流转未跟进: { bg: '#fffbe6', text: '#ad6800' }, 未跟进: { bg: '#fffbe6', text: '#ad6800' },
  跟进中: { bg: '#f2fbf9', text: '#158F82' }, 已到店: { bg: '#e6f7ff', text: '#1677c8' },
  已报名: { bg: '#e6f4ff', text: '#1668dc' }, 已结业: { bg: '#f9f0ff', text: '#722ed1' }, 无效线索: { bg: '#f5f5f5', text: '#777' },
};
const RESULT_COLORS: Record<string, string> = { 已接通: '#158F82', 已回复: '#158F82', 已到店: '#158F82', 成功: '#158F82', 未接通: '#d9363e', 拒接: '#d9363e', 已拉黑: '#d9363e', 未到店: '#d9363e', 爽约: '#d9363e', 失败: '#d9363e' };

const userName = (value?: LeadUser | string): string => typeof value === 'string' ? value : value?.name || value?.username || '-';
const idOf = (lead: TrainingLead): string => lead._id || lead.id || '';
const stateOf = (lead: TrainingLead): string => lead.leadStatus || lead.status || '-';
const errorText = (error: any, fallback: string): string => error?.response?.data?.message || error?.message || fallback;
const followUpAccent = (status?: string): string => {
  if (status && /(已签约|已成交|成交|已报名)/.test(status)) return '#8e5bd9';
  return status && !status.includes('未跟进') ? '#158F82' : '#e5484d';
};

function Pill({ text, color }: { text?: string | null; color?: string }) {
  if (!text) return null;
  const style = STATUS_COLORS[text] || { bg: '#eef7f6', text: color || '#158F82' };
  return <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 22, padding: '2px 9px', borderRadius: 20, background: style.bg, color: style.text, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{text}</span>;
}

function InfoGrid({ rows }: { rows: Array<{ label: string; value?: React.ReactNode; wide?: boolean }> }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
    {rows.map((row) => <div key={row.label} style={{ gridColumn: row.wide ? '1 / -1' : undefined, padding: '10px 12px', borderRadius: 10, background: '#f7f8fa', minWidth: 0 }}><div style={{ color: '#8a93a5', fontSize: 12, marginBottom: 4 }}>{row.label}</div><div style={{ color: '#333', fontSize: 14, fontWeight: 500, wordBreak: 'break-word', whiteSpace: row.wide ? 'pre-wrap' : undefined }}>{row.value || '-'}</div></div>)}
  </div>;
}

type Filters = Omit<TrainingLeadQuery, 'page' | 'pageSize'>;
const EMPTY_FILTERS: Filters = {};

function FiltersPopup({ visible, initial, onClose, onApply }: { visible: boolean; initial: Filters; onClose: () => void; onApply: (value: Filters) => void }) {
  const [value, setValue] = useState<Filters>(initial);
  useEffect(() => { if (visible) setValue(initial); }, [initial, visible]);
  const set = <K extends keyof Filters>(key: K, next: Filters[K]) => setValue((current) => ({ ...current, [key]: next || undefined }));
  return <Popup visible={visible} onMaskClick={onClose} bodyStyle={{ maxHeight: '82vh', overflowY: 'auto', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '20px 16px 32px' }}>
    <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 18 }}>筛选学员线索</div>
    <FilterSection label="线索状态"><Selector options={STATUS_OPTIONS.map((item) => ({ label: item, value: item }))} value={value.status ? [value.status] : []} onChange={(next) => set('status', next[0])} /></FilterSection>
    <FilterSection label="线索来源"><Selector columns={3} options={SOURCE_OPTIONS.map((item) => ({ label: item, value: item }))} value={value.leadSource ? [value.leadSource] : []} onChange={(next) => set('leadSource', next[0])} /></FilterSection>
    <FilterSection label="培训类型"><Selector columns={3} options={TRAINING_TYPE_OPTIONS.map((item) => ({ label: item, value: item }))} value={value.trainingType ? [value.trainingType] : []} onChange={(next) => set('trainingType', next[0])} /></FilterSection>
    <FilterSection label="最近跟进结果"><Selector columns={3} options={Object.values(RESULT_OPTIONS).flat().map((item) => ({ label: item, value: item }))} value={value.lastFollowUpResult ? [value.lastFollowUpResult] : []} onChange={(next) => set('lastFollowUpResult', next[0])} /></FilterSection>
    <FilterSection label="是否报征"><Selector options={[{ label: '全部', value: 'all' }, { label: '已报征', value: 'yes' }, { label: '未报征', value: 'no' }]} value={value.isReported === undefined ? ['all'] : [value.isReported ? 'yes' : 'no']} onChange={(next) => set('isReported', next[0] === 'all' ? undefined : next[0] === 'yes')} /></FilterSection>
    <FilterSection label="创建日期"><div style={{ display: 'flex', gap: 10 }}><input type="date" value={value.startDate || ''} onChange={(event) => set('startDate', event.target.value)} style={dateInputStyle} /><input type="date" value={value.endDate || ''} onChange={(event) => set('endDate', event.target.value)} style={dateInputStyle} /></div></FilterSection>
    <div style={{ display: 'flex', gap: 10, marginTop: 24 }}><Button block onClick={() => { setValue(EMPTY_FILTERS); onApply(EMPTY_FILTERS); onClose(); }}>重置</Button><Button block color="primary" onClick={() => { onApply(value); onClose(); }}>应用筛选</Button></div>
  </Popup>;
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) { return <section style={{ marginBottom: 20 }}><div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 10 }}>{label}</div>{children}</section>; }
const dateInputStyle = { flex: 1, minWidth: 0, height: 38, border: 'none', borderRadius: 8, padding: '0 8px', background: '#f7f8fa', color: '#333' };

function LeadList({ onOpen, onCreate, canCreate }: { onOpen: (id: string) => void; onCreate: () => void; canCreate: boolean }) {
  const [input, setInput] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterVisible, setFilterVisible] = useState(false);
  const fetchPage = useCallback((page: number, pageSize: number) => trainingLeadService.list({ page, pageSize, ...filters }), [filters]);
  const { items, hasMore, error, loadMore, refresh } = useInfiniteList<TrainingLead>(fetchPage, 20);
  useEffect(() => { refresh().catch(() => {}); }, [filters, refresh]);
  const applySearch = (search: string) => setFilters((current) => ({ ...current, search: search.trim() || undefined }));
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== 'search' && value !== undefined && value !== '');
  return <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
    <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', boxShadow: '0 1px 8px rgba(24, 39, 75, 0.05)' }}>
      <NavBar back={null} style={{ background: '#fff', fontWeight: 600 }}>学员线索</NavBar>
      <div style={{ padding: '8px 16px 12px', background: '#fff', display: 'flex', gap: 10 }}><SearchBar placeholder="姓名、手机、微信号、学员编号" value={input} onChange={setInput} onSearch={applySearch} style={{ flex: 1, '--border-radius': '20px', '--background': '#f5f7fa' }} /><Button size="small" fill={hasFilters ? 'solid' : 'outline'} color="primary" onClick={() => setFilterVisible(true)} style={{ borderRadius: 20 }}>筛选</Button></div>
      <Tabs activeKey={filters.status || 'all'} onChange={(status) => setFilters((current) => ({ ...current, status: status === 'all' ? undefined : status }))} style={{ background: '#fff', '--title-font-size': '13px' }}><Tabs.Tab title="全部" key="all" /><Tabs.Tab title="待跟进" key="新客未跟进" /><Tabs.Tab title="跟进中" key="跟进中" /><Tabs.Tab title="已报名" key="已报名" /></Tabs>
    </div>
    <PullToRefresh onRefresh={refresh}><div style={{ padding: '12px 16px 84px' }}>
      {error && items.length === 0 ? <ErrorBlock status="default" title="加载失败" description="下拉刷新重试" /> : items.length === 0 && !hasMore ? <Empty description="暂无线索" /> : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{items.map((lead) => <LeadCard key={idOf(lead)} lead={lead} onClick={() => { const id = idOf(lead); if (id) onOpen(id); }} />)}</div>}
      <InfiniteScroll loadMore={loadMore} hasMore={hasMore}>{hasMore ? <DotLoading color="primary" /> : items.length ? <span style={{ color: '#999', fontSize: 12 }}>已到底部</span> : ''}</InfiniteScroll>
    </div></PullToRefresh>
    {canCreate && <button type="button" aria-label="创建学员" onClick={onCreate} style={{ position: 'fixed', right: 16, bottom: 'calc(62px + env(safe-area-inset-bottom))', zIndex: 15, display: 'inline-flex', alignItems: 'center', gap: 5, height: 44, padding: '0 16px', border: 'none', borderRadius: 24, color: '#fff', background: '#158F82', boxShadow: '0 5px 16px rgba(21,143,130,.28)', font: 'inherit', fontSize: 14, fontWeight: 700 }}><AddOutline fontSize={20} /><span>创建学员</span></button>}
    <FiltersPopup visible={filterVisible} initial={filters} onClose={() => setFilterVisible(false)} onApply={setFilters} />
  </div>;
}

function LeadCard({ lead, onClick }: { lead: TrainingLead; onClick: () => void }) {
  const owner = userName(lead.assignedTo) !== '-' ? userName(lead.assignedTo) : userName(lead.studentOwner);
  return <button type="button" onClick={onClick} style={{ width: '100%', textAlign: 'left', border: 'none', background: '#fff', borderRadius: 16, padding: 16, boxShadow: `inset 0 4px 0 ${followUpAccent(stateOf(lead))}, 0 2px 12px rgba(0,0,0,0.04)`, font: 'inherit', color: '#1a1a1a' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ minWidth: 0, flex: 1, fontWeight: 700, fontSize: 17 }}>{lead.name || '未命名学员'}</span><Pill text={stateOf(lead)} /></div>
    <div style={{ marginTop: 6, color: '#158F82', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{lead.studentId || '未生成学员编号'}</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12, fontSize: 13, color: '#666' }}><span>电话 {lead.phone || '-'}</span><span>跟进人 {owner}</span><span>来源 {lead.leadSource || '-'}</span><span>意向 {lead.intentionLevel || '-'}</span></div>
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 7, color: '#999', fontSize: 12 }}>{lead.lastFollowUpResult ? <Pill text={lead.lastFollowUpResult} color={RESULT_COLORS[lead.lastFollowUpResult]} /> : <span>暂无跟进记录</span>}<span style={{ marginLeft: 'auto' }}>{fmtDateTime(lead.createdAt)}</span></div>
  </button>;
}

function LeadDetail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const canEdit = usePermission('training-lead:edit');
  const canDelete = usePermission('training-lead:delete');
  const canCreateContract = usePermission('contract:create');
  const role = useAuthStore((state) => state.user?.role);
  const isManager = ['系统管理员', 'admin', '经理', 'manager'].includes(role || '');
  const [lead, setLead] = useState<TrainingLead>();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [followUpVisible, setFollowUpVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [contractVisible, setContractVisible] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const load = useCallback(async () => { try { setLoading(true); setLead(await trainingLeadService.get(id)); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '获取线索详情失败') }); } finally { setLoading(false); } }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!isManager) return; trainingLeadService.getOperationLogs(id).then(setLogs).catch(() => setLogs([])); }, [id, isManager]);
  const changePool = async () => { if (!lead) return; try { if (lead.inPublicPool) await trainingLeadService.claim(id); else await trainingLeadService.release(id); Toast.show({ icon: 'success', content: lead.inPublicPool ? '认领成功' : '已释放到公海池' }); await load(); onChanged(); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '操作失败') }); } };
  const remove = (): void => { void Dialog.confirm({ content: '确认删除此学员线索吗？删除后无法恢复。', onConfirm: async () => { try { await trainingLeadService.remove(id); Toast.show({ icon: 'success', content: '已删除' }); onChanged(); onBack(); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '删除失败') }); } } }); };
  if (loading && !lead) return <div style={{ textAlign: 'center', padding: 40 }}><DotLoading color="primary" /></div>;
  if (!lead) return <><NavBar onBack={onBack} style={{ background: '#fff' }}>线索详情</NavBar><ErrorBlock status="empty" title="线索不存在" /></>;
  if (contractVisible) return <TrainingContractForm lead={lead} onBack={() => setContractVisible(false)} onDone={() => { void load(); onChanged(); }} />;
  const owner = userName(lead.assignedTo) !== '-' ? userName(lead.assignedTo) : userName(lead.studentOwner);
  const openContract = () => { if (lead.inPublicPool) { Toast.show({ content: '请先认领线索再发起合同' }); return; } setContractVisible(true); };
  const callLead = () => { const phone = lead.phone?.trim(); if (!phone) { Toast.show({ content: '该学员未填写手机号' }); return; } window.location.href = `tel:${phone}`; };
  return <div style={{ minHeight: '100vh', background: '#f5f7fa', paddingBottom: 'calc(126px + env(safe-area-inset-bottom))' }}><NavBar onBack={onBack} right={(canEdit || canDelete) ? <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{canEdit && <><button type="button" onClick={() => setEditorVisible(true)} style={navActionStyle}>编辑</button><button type="button" onClick={() => { void changePool(); }} style={navActionStyle}>{lead.inPublicPool ? '认领' : '释放'}</button></>}{canDelete && <button type="button" aria-label="更多操作" onClick={() => setMoreVisible(true)} style={moreActionStyle}><MoreOutline fontSize={22} /></button>}</span> : null} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}>线索详情</NavBar>
    <div style={{ padding: '16px 16px 0' }}><div style={{ borderRadius: 16, padding: 18, color: '#fff', background: 'linear-gradient(135deg, #158F82, #27aea0)', boxShadow: '0 4px 14px rgba(21,143,130,.2)' }}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ fontSize: 12, fontFamily: 'monospace', opacity: .92 }}>{lead.studentId || '未生成学员编号'}</span><span style={{ marginLeft: 'auto', padding: '3px 9px', borderRadius: 16, background: 'rgba(255,255,255,.2)', fontSize: 12, fontWeight: 600 }}>{stateOf(lead)}</span></div><div style={{ marginTop: 9, fontSize: 21, fontWeight: 700 }}>{lead.name}</div><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, opacity: .94 }}><span>{lead.phone || '-'}</span><button type="button" aria-label="拨打电话" onClick={(event) => { event.stopPropagation(); callLead(); }} style={callButtonStyle}>📞</button><span>·　{lead.consultPosition || '未填写咨询职位'}</span></div></div></div>
    <Tabs activeKey={tab} onChange={setTab} style={{ marginTop: 12, background: '#fff', '--title-font-size': '14px' }}><Tabs.Tab title="概览" key="overview" /><Tabs.Tab title={`跟进 (${lead.followUps?.length || 0})`} key="follow" /><Tabs.Tab title="管理" key="manage" /></Tabs>
    <div style={{ padding: 16 }}>{tab === 'overview' && <Overview lead={lead} owner={owner} />}{tab === 'follow' && <FollowUps items={lead.followUps || []} />}{tab === 'manage' && <Management lead={lead} owner={owner} logs={logs} showLogs={isManager} />}</div>
    {(canEdit || canCreateContract) && <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(50px + env(safe-area-inset-bottom))', zIndex: 90, padding: '8px 16px', background: 'rgba(255,255,255,.97)', boxShadow: '0 -3px 12px rgba(0,0,0,.08)', display: 'flex', gap: 8 }}>{canEdit && <Button size="small" fill="outline" color="primary" onClick={() => setFollowUpVisible(true)} style={{ ...detailActionStyle, flex: 1 }}>添加跟进</Button>}{canCreateContract && <Button size="small" color="primary" onClick={openContract} style={{ ...detailActionStyle, flex: 1 }}>发起合同</Button>}</div>}
    <Popup visible={moreVisible} onMaskClick={() => setMoreVisible(false)} bodyStyle={{ borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '12px 16px calc(16px + env(safe-area-inset-bottom))' }}><div style={{ color: '#8a93a5', fontSize: 13, padding: '4px 4px 10px' }}>更多操作</div><Button block fill="none" color="danger" onClick={() => { setMoreVisible(false); remove(); }} style={moreDeleteStyle}><DeleteOutline /> 删除线索</Button><Button block onClick={() => setMoreVisible(false)} style={{ height: 42, borderRadius: 12, marginTop: 8 }}>取消</Button></Popup>
    <FollowUpPopup visible={followUpVisible} leadName={lead.name || ''} onClose={() => setFollowUpVisible(false)} onSubmit={async (data) => { await trainingLeadService.createFollowUp(id, data); await load(); onChanged(); }} />
    <LeadEditor visible={editorVisible} lead={lead} onClose={() => setEditorVisible(false)} onSaved={async (data) => { await trainingLeadService.update(id, data); setEditorVisible(false); await load(); onChanged(); }} />
  </div>;
}

function Overview({ lead, owner }: { lead: TrainingLead; owner: string }) { return <><Section title="基本信息"><InfoGrid rows={[{ label: '学员编号', value: lead.studentId }, { label: '线索状态', value: <Pill text={stateOf(lead)} /> }, { label: '客户姓名', value: lead.name }, { label: '电话号码', value: lead.phone }, { label: '性别', value: lead.gender }, { label: '年龄', value: lead.age != null ? `${lead.age}岁` : undefined }, { label: '微信号', value: lead.wechatId }, { label: '咨询职位', value: lead.consultPosition }, { label: '渠道来源', value: lead.leadSource }, { label: '意向程度', value: lead.intentionLevel }, { label: '线索等级', value: lead.leadGrade ? <Pill text={lead.leadGrade} /> : undefined }, { label: '是否报征', value: lead.isReported ? '是' : '否' }, { label: '所在地区', value: lead.address, wide: true }, { label: '意向课程', value: lead.intendedCourses?.join('、'), wide: true }, { label: '已报证书', value: lead.reportedCertificates?.join('、'), wide: true }]}/></Section><Section title="费用与时间"><InfoGrid rows={[{ label: '期望开课时间', value: lead.expectedStartDate ? fmtDate(lead.expectedStartDate) : undefined }, { label: '是否网课', value: lead.isOnlineCourse ? '是' : '否' }, { label: '预算金额', value: fmtMoney(lead.budget) }, { label: '报课金额', value: fmtMoney(lead.courseAmount) }, { label: '服务费金额', value: fmtMoney(lead.serviceFeeAmount) }, { label: '最后跟进时间', value: lead.lastFollowUpAt ? fmtDateTime(lead.lastFollowUpAt) : undefined }]}/></Section><Section title="人员与备注"><InfoGrid rows={[{ label: '录入人', value: userName(lead.createdBy) }, { label: '跟进人', value: owner }, { label: '学员归属', value: userName(lead.studentOwner) }, { label: '创建时间', value: fmtDateTime(lead.createdAt) }, { label: '备注信息', value: lead.remarks, wide: true }]}/></Section></>; }
function FollowUps({ items }: { items: TrainingLeadFollowUp[] }) { return <Section title="跟进记录"><div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{items.length === 0 ? <Empty description="暂未添加跟进记录" imageStyle={{ width: 70 }} /> : items.map((item, index) => <div key={item._id || index} style={{ position: 'relative', paddingLeft: 18, paddingBottom: 2, borderLeft: index === items.length - 1 ? 'none' : '2px solid #d9f0ed' }}><span style={{ position: 'absolute', left: -6, top: 2, width: 10, height: 10, borderRadius: 10, background: RESULT_COLORS[item.followUpResult] || '#158F82' }} /><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><b style={{ fontSize: 14 }}>{item.type}</b><Pill text={item.followUpResult} color={RESULT_COLORS[item.followUpResult]} /><span style={{ marginLeft: 'auto', color: '#999', fontSize: 11 }}>{fmtDateTime(item.createdAt)}</span></div><div style={{ marginTop: 8, color: '#333', fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{item.content}</div><div style={{ marginTop: 7, color: '#8a93a5', fontSize: 12 }}>跟进人：{userName(item.createdBy)}{item.nextFollowUpDate ? `　下次跟进：${fmtDateTime(item.nextFollowUpDate)}` : ''}</div></div>)}</div></Section>; }
function Management({ lead, owner, logs, showLogs }: { lead: TrainingLead; owner: string; logs: Record<string, unknown>[]; showLogs: boolean }) { return <><Section title="线索管理"><InfoGrid rows={[{ label: '公海状态', value: lead.inPublicPool ? '已进入公海池' : '当前持有' }, { label: '当前跟进人', value: owner }, { label: '最近跟进结果', value: lead.lastFollowUpResult }, { label: '更新时间', value: fmtDateTime(lead.updatedAt) }]}/></Section>{lead.linkedLeads?.length ? <Section title="关联线索"><div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{lead.linkedLeads.map((item) => <div key={idOf(item)} style={{ padding: 12, borderRadius: 10, background: '#f7f8fa' }}><b>{item.name}</b><span style={{ marginLeft: 8, color: '#777', fontSize: 13 }}>{item.studentId || item.phone}</span></div>)}</div></Section> : null}{showLogs && <Section title="操作日志"><div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{logs.length ? logs.map((log, index) => <div key={String(log._id || index)} style={{ padding: '10px 0', borderBottom: '1px solid #f1f1f1' }}><b style={{ fontSize: 14 }}>{String(log.operationName || '系统操作')}</b><div style={{ color: '#777', fontSize: 12, marginTop: 4 }}>{String(log.operatorName || log.operatorId || '-')}　{fmtDateTime(String(log.operatedAt || log.createdAt || ''))}</div></div>) : <span style={{ color: '#999', fontSize: 13 }}>暂无操作日志</span>}</div></Section>}</>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: '0 2px 12px rgba(0,0,0,.03)' }}><div style={{ fontSize: 15, fontWeight: 700, marginBottom: 13 }}>{title}</div>{children}</section>; }

function FollowUpPopup({ visible, leadName, onClose, onSubmit }: { visible: boolean; leadName: string; onClose: () => void; onSubmit: (data: { type: string; followUpResult: string; content: string; nextFollowUpDate?: string }) => Promise<void> }) {
  const [type, setType] = useState('电话'); const [result, setResult] = useState(''); const [content, setContent] = useState(''); const [nextDate, setNextDate] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => { if (visible) { setType('电话'); setResult(''); setContent(''); setNextDate(''); } }, [visible]);
  const submit = async () => { if (!result || !content.trim()) { Toast.show({ content: '请选择跟进结果并填写跟进内容' }); return; } setSaving(true); try { await onSubmit({ type, followUpResult: result, content: content.trim(), nextFollowUpDate: nextDate ? new Date(nextDate).toISOString() : undefined }); Toast.show({ icon: 'success', content: '跟进记录已添加' }); onClose(); } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, '添加跟进失败') }); } finally { setSaving(false); } };
  return <Popup visible={visible} onMaskClick={() => !saving && onClose()} bodyStyle={{ maxHeight: '86vh', overflowY: 'auto', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '20px 16px 32px' }}><div style={{ fontSize: 18, fontWeight: 700 }}>添加跟进 · {leadName}</div><div style={{ marginTop: 18 }}><FilterSection label="跟进方式"><Selector options={Object.keys(RESULT_OPTIONS).map((item) => ({ label: item, value: item }))} value={[type]} onChange={(next) => { setType(next[0] || '电话'); setResult(''); }} /></FilterSection><FilterSection label="跟进结果"><Selector columns={3} options={(RESULT_OPTIONS[type] || []).map((item) => ({ label: item, value: item }))} value={result ? [result] : []} onChange={(next) => setResult(next[0] || '')} /></FilterSection><FilterSection label="跟进内容"><TextArea value={content} onChange={setContent} placeholder="请详细描述本次跟进情况…" rows={5} maxLength={1000} showCount /></FilterSection><FilterSection label="下次跟进时间（可选）"><input type="datetime-local" value={nextDate} onChange={(event) => setNextDate(event.target.value)} style={{ ...dateInputStyle, width: '100%' }} /></FilterSection></div><div style={{ display: 'flex', gap: 10, marginTop: 24 }}><Button block disabled={saving} onClick={onClose}>取消</Button><Button block color="primary" loading={saving} onClick={submit}>提交跟进</Button></div></Popup>;
}

function LeadEditor({ visible, lead, onClose, onSaved }: { visible: boolean; lead?: TrainingLead; onClose: () => void; onSaved: (data: TrainingLeadInput) => Promise<void> }) {
  const [form, setForm] = useState<TrainingLeadInput>(emptyLeadForm);
  const [openSections, setOpenSections] = useState({ basic: true, training: true, more: false });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setForm({
      name: lead?.name || '', phone: lead?.phone || '', gender: lead?.gender || undefined, age: lead?.age,
      wechatId: lead?.wechatId || undefined, idCardNumber: lead?.idCardNumber || undefined,
      consultPosition: lead?.consultPosition || undefined, leadSource: lead?.leadSource || undefined,
      trainingType: lead?.trainingType || undefined, intendedCourses: lead?.intendedCourses || [],
      reportedCertificates: lead?.reportedCertificates || [], intentionLevel: lead?.intentionLevel || undefined,
      leadGrade: lead?.leadGrade || undefined, expectedStartDate: lead?.expectedStartDate?.slice(0, 10) || undefined,
      budget: lead?.budget, courseAmount: lead?.courseAmount, serviceFeeAmount: lead?.serviceFeeAmount,
      isOnlineCourse: lead?.isOnlineCourse || false, address: lead?.address || undefined,
      isReported: lead?.isReported || false, remarks: lead?.remarks || undefined,
    });
    setOpenSections({ basic: true, training: false, more: false });
  }, [lead, visible]);
  const setField = <K extends keyof TrainingLeadInput>(key: K, value: TrainingLeadInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setNumber = (key: 'age' | 'budget' | 'courseAmount' | 'serviceFeeAmount') => (value: string) => setField(key, value.trim() === '' ? undefined : Number(value));
  const setMulti = (key: 'intendedCourses' | 'reportedCertificates') => (value: string[]) => setField(key, value);
  const toggle = (key: keyof typeof openSections) => setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  const countFilled = (keys: Array<keyof TrainingLeadInput>) => keys.filter((key) => {
    const value = form[key];
    return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== '' && value !== false;
  }).length;
  const save = async () => {
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (!name || !phone) { Toast.show({ content: '请填写客户姓名和手机号' }); return; }
    if (!/^1[3-9]\d{9}$/.test(phone)) { Toast.show({ content: '手机号格式不正确' }); return; }
    if (form.age != null && (!Number.isInteger(form.age) || form.age < 0 || form.age > 120)) { Toast.show({ content: '年龄请输入0到120的整数' }); return; }
    if (form.idCardNumber && !/(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/.test(form.idCardNumber.trim())) { Toast.show({ content: '身份证号格式不正确' }); return; }
    setSaving(true);
    try {
      await onSaved({ ...form, name, phone, wechatId: form.wechatId?.trim() || undefined, idCardNumber: form.idCardNumber?.trim() || undefined, address: form.address?.trim() || undefined, remarks: form.remarks?.trim() || undefined, intendedCourses: form.intendedCourses?.length ? form.intendedCourses : undefined, reportedCertificates: form.reportedCertificates?.length ? form.reportedCertificates : undefined });
      Toast.show({ icon: 'success', content: lead ? '线索资料已保存' : '学员线索创建成功' });
    } catch (error) { Toast.show({ icon: 'fail', content: errorText(error, lead ? '保存失败' : '创建失败') }); } finally { setSaving(false); }
  };
  const basicFilled = countFilled(['name', 'phone', 'wechatId', 'gender', 'age', 'consultPosition', 'idCardNumber']);
  const trainingFilled = countFilled(['intentionLevel', 'leadGrade', 'trainingType', 'expectedStartDate', 'intendedCourses', 'reportedCertificates', 'budget', 'courseAmount', 'serviceFeeAmount', 'isOnlineCourse']);
  const moreFilled = countFilled(['leadSource', 'isReported', 'address', 'remarks']);
  return <Popup visible={visible} onMaskClick={() => !saving && onClose()} bodyStyle={editorPopupStyle}>
    <div style={editorShellStyle}>
      <div style={editorHeaderStyle}>
        <div style={editorHandleStyle} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={editorTitleIconStyle}>✦</span><div><div style={{ color: '#172b2a', fontSize: 19, fontWeight: 700 }}>{lead ? '编辑学员线索' : '新建学员线索'}</div><div style={editorHintStyle}>先填核心信息，其他资料可稍后补充</div></div></div><button type="button" onClick={onClose} style={editorCloseStyle} aria-label="关闭">×</button></div>
        <div style={editorProgressStyle}><span style={editorProgressActiveStyle}>01 基本信息</span><i /><span>02 培训意向</span><i /><span>03 补充资料</span></div>
      </div>
      <div style={editorContentStyle}>
        <LeadFormSection step="01" title="基本信息" description="姓名、联系方式和身份信息" filled={basicFilled} total={7} open={openSections.basic} onToggle={() => toggle('basic')}>
          <LeadField label="客户姓名" required><Input value={form.name} onChange={(value) => setField('name', value)} placeholder="请输入客户姓名" style={editorInputStyle as any} /></LeadField>
          <LeadField label="手机号" required><Input value={form.phone} onChange={(value) => setField('phone', value)} placeholder="请输入11位手机号" type="tel" style={editorInputStyle as any} /></LeadField>
          <div style={editorFieldGrid}><LeadField label="微信号"><Input value={form.wechatId || ''} onChange={(value) => setField('wechatId', value)} placeholder="选填" style={editorInputStyle as any} /></LeadField><LeadField label="年龄"><Input value={form.age == null ? '' : String(form.age)} onChange={setNumber('age')} placeholder="选填" type="number" style={editorInputStyle as any} /></LeadField></div>
          <LeadField label="性别"><Selector columns={3} options={['男', '女', '其他'].map((item) => ({ label: item, value: item }))} value={form.gender ? [form.gender] : []} onChange={(next) => setField('gender', next[0] || undefined)} style={selectorStyle as any} /></LeadField>
          <LeadField label="咨询职位"><Selector columns={3} options={POSITION_OPTIONS.map((item) => ({ label: item, value: item }))} value={form.consultPosition ? [form.consultPosition] : []} onChange={(next) => setField('consultPosition', next[0] || undefined)} style={selectorStyle as any} /></LeadField>
          <LeadField label="身份证号"><Input value={form.idCardNumber || ''} onChange={(value) => setField('idCardNumber', value)} placeholder="选填 · 15或18位" maxLength={18} style={editorInputStyle as any} /></LeadField>
        </LeadFormSection>
        <LeadFormSection step="02" title="状态与培训信息" description="课程意向、开课时间和费用" filled={trainingFilled} total={10} open={openSections.training} onToggle={() => toggle('training')}>
          <div style={editorFieldGrid}><LeadField label="意向程度"><Selector columns={3} options={INTENTION_OPTIONS.map((item) => ({ label: item, value: item }))} value={form.intentionLevel ? [form.intentionLevel] : []} onChange={(next) => setField('intentionLevel', next[0] || undefined)} style={selectorStyle as any} /></LeadField><LeadField label="线索等级"><Selector columns={3} options={GRADE_OPTIONS.map((item) => ({ label: item, value: item }))} value={form.leadGrade ? [form.leadGrade] : []} onChange={(next) => setField('leadGrade', next[0] || undefined)} style={selectorStyle as any} /></LeadField></div>
          <LeadField label="培训类型"><Selector columns={3} options={TRAINING_TYPE_OPTIONS.map((item) => ({ label: item, value: item }))} value={form.trainingType ? [form.trainingType] : []} onChange={(next) => setField('trainingType', next[0] || undefined)} style={selectorStyle as any} /></LeadField>
          <LeadField label="期望开课时间"><input type="date" value={form.expectedStartDate || ''} onChange={(event) => setField('expectedStartDate', event.target.value || undefined)} style={editorDateStyle} /></LeadField>
          <LeadField label="意向课程"><Selector multiple columns={2} options={COURSE_OPTIONS.map((item) => ({ label: item, value: item }))} value={form.intendedCourses || []} onChange={setMulti('intendedCourses')} style={selectorStyle as any} /></LeadField>
          <LeadField label="已报证书"><Selector multiple columns={2} options={COURSE_OPTIONS.map((item) => ({ label: item, value: item }))} value={form.reportedCertificates || []} onChange={setMulti('reportedCertificates')} style={selectorStyle as any} /></LeadField>
          <div style={editorFieldGrid}><LeadField label="预算金额"><Input value={form.budget == null ? '' : String(form.budget)} onChange={setNumber('budget')} placeholder="选填" type="number" style={editorInputStyle as any} /></LeadField><LeadField label="报课金额"><Input value={form.courseAmount == null ? '' : String(form.courseAmount)} onChange={setNumber('courseAmount')} placeholder="选填" type="number" style={editorInputStyle as any} /></LeadField></div>
          <LeadField label="服务费金额"><Input value={form.serviceFeeAmount == null ? '' : String(form.serviceFeeAmount)} onChange={setNumber('serviceFeeAmount')} placeholder="选填" type="number" style={editorInputStyle as any} /></LeadField>
          <div style={editorSwitchRow}><div><div style={{ fontSize: 14, fontWeight: 600, color: '#243b3a' }}>是否网课</div><div style={editorHintStyle}>开启后标记为线上课程</div></div><Switch checked={!!form.isOnlineCourse} onChange={(checked) => setField('isOnlineCourse', checked)} /></div>
        </LeadFormSection>
        <LeadFormSection step="03" title="其他信息" description="来源、地区和备注" filled={moreFilled} total={4} open={openSections.more} onToggle={() => toggle('more')}>
          <LeadField label="线索来源"><Selector columns={3} options={SOURCE_OPTIONS.map((item) => ({ label: item, value: item }))} value={form.leadSource ? [form.leadSource] : []} onChange={(next) => setField('leadSource', next[0] || undefined)} style={selectorStyle as any} /></LeadField>
          <div style={editorSwitchRow}><div><div style={{ fontSize: 14, fontWeight: 600, color: '#243b3a' }}>是否报征</div><div style={editorHintStyle}>与 CRM「是否报征」保持一致</div></div><Switch checked={!!form.isReported} onChange={(checked) => setField('isReported', checked)} /></div>
          <LeadField label="所在地区"><Input value={form.address || ''} onChange={(value) => setField('address', value)} placeholder="请输入所在地区" style={editorInputStyle as any} /></LeadField>
          <LeadField label="备注信息"><TextArea value={form.remarks || ''} onChange={(value) => setField('remarks', value)} placeholder="记录特殊需求或沟通重点（选填）" rows={3} maxLength={500} showCount style={editorTextAreaStyle as any} /></LeadField>
        </LeadFormSection>
      </div>
      <div style={editorFooterStyle}><Button block fill="outline" disabled={saving} onClick={onClose} style={editorActionStyle}>取消</Button><Button block color="primary" loading={saving} onClick={() => { void save(); }} style={editorActionStyle}>{lead ? '保存线索' : '创建线索'}</Button></div>
    </div>
  </Popup>;
}

function LeadFormSection({ step, title, description, filled, total, open, onToggle, children }: { step: string; title: string; description: string; filled: number; total: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <section style={editorSectionStyle}><button type="button" onClick={onToggle} style={editorSectionHeaderStyle}><span style={editorStepStyle}>{step}</span><span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}><span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#1f3533' }}>{title}</span><span style={editorHintStyle}>{description}</span></span><span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}><span style={editorCountStyle}>{filled ? `${filled}/${total}` : '选填'}</span><span style={{ color: '#158F82', fontSize: 18, lineHeight: 1 }}>{open ? '⌃' : '⌄'}</span></span></button>{open && <div style={editorSectionBodyStyle}>{children}</div>}</section>;
}

function LeadField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div style={{ minWidth: 0 }}><div style={editorFieldLabelStyle}>{label}{required && <span style={{ color: '#ff3141', marginLeft: 3 }}>*</span>}</div>{children}</div>;
}

const emptyLeadForm: TrainingLeadInput = { name: '', phone: '', intendedCourses: [], reportedCertificates: [], isOnlineCourse: false, isReported: false };
const editorPopupStyle = { height: 'min(92vh, 760px)', maxHeight: '92vh', overflow: 'hidden', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 0, background: '#f5f7fa' };
const editorShellStyle = { display: 'flex', flexDirection: 'column' as const, height: '100%', minHeight: 0 };
const editorHeaderStyle = { flexShrink: 0, padding: '10px 16px 14px', background: '#fff', boxShadow: '0 2px 12px rgba(24, 62, 59, .06)', zIndex: 1 };
const editorHandleStyle = { width: 36, height: 4, borderRadius: 99, margin: '0 auto 12px', background: '#d6e3e1' };
const editorTitleIconStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 12, color: '#fff', background: 'linear-gradient(135deg, #158F82, #27aea0)', fontSize: 18, boxShadow: '0 4px 10px rgba(21,143,130,.22)' };
const editorProgressStyle = { display: 'flex', alignItems: 'center', gap: 7, marginTop: 16, color: '#9aa9a7', fontSize: 11, fontWeight: 600 };
const editorProgressActiveStyle = { color: '#158F82' };
const editorContentStyle = { flex: 1, minHeight: 0, overflowY: 'auto' as const, padding: '12px 14px 16px' };
const editorFooterStyle = { flexShrink: 0, display: 'flex', gap: 10, padding: '10px 16px calc(10px + env(safe-area-inset-bottom))', background: 'rgba(255,255,255,.98)', boxShadow: '0 -3px 14px rgba(24, 62, 59, .08)' };
const editorSectionStyle = { background: '#fff', borderRadius: 18, boxShadow: '0 3px 14px rgba(24, 62, 59, .045)', overflow: 'hidden', marginBottom: 10 };
const editorSectionHeaderStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', minHeight: 70, padding: '12px 14px', border: 0, background: 'linear-gradient(180deg, #ffffff 0%, #fbfdfd 100%)', font: 'inherit', cursor: 'pointer' };
const editorStepStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, flexShrink: 0, borderRadius: 11, color: '#158F82', background: '#eaf7f4', fontSize: 11, fontWeight: 700 };
const editorSectionBodyStyle = { display: 'flex', flexDirection: 'column' as const, gap: 15, padding: '2px 14px 18px' };
const editorFieldLabelStyle = { color: '#334b49', fontSize: 13, fontWeight: 650, marginBottom: 7 };
const editorInputStyle = { '--background-color': '#f1f4f4', '--border-radius': '12px', '--placeholder-color': '#9aa9a7', minHeight: 44, padding: '0 12px', border: '1px solid #e2e9e8', fontSize: 14 };
const editorTextAreaStyle = { background: '#f1f4f4', '--placeholder-color': '#9aa9a7', border: '1px solid #e2e9e8', borderRadius: 12, padding: 12, fontSize: 14 };
const editorFieldGrid = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 };
const editorDateStyle = { width: '100%', height: 44, boxSizing: 'border-box' as const, border: '1px solid #e2e9e8', borderRadius: 12, padding: '0 12px', background: '#f1f4f4', color: '#263238', fontSize: 14 };
const selectorStyle = { '--border-radius': '12px', '--checked-color': 'rgba(21,143,130,.1)', '--checked-text-color': '#158F82', '--checked-border': '1.5px solid #158F82', '--padding': '10px 5px', '--gap': '7px' };
const editorSwitchRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 12px', borderRadius: 12, background: '#f4faf8' };
const editorHintStyle = { color: '#8a93a5', fontSize: 12, lineHeight: 1.5, marginTop: 3 };
const editorCountStyle = { color: '#158F82', background: '#eaf7f4', borderRadius: 20, padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap' as const };
const editorCloseStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, border: 0, borderRadius: 16, background: '#f1f6f5', color: '#58706d', font: 'inherit', fontSize: 22, lineHeight: 1, padding: 0 };
const editorActionStyle = { height: 44, borderRadius: 22, fontSize: 14, fontWeight: 600 };

const navActionStyle = { border: 'none', background: 'transparent', color: '#158F82', font: 'inherit', fontSize: 14, fontWeight: 600 };
const moreActionStyle = { ...navActionStyle, display: 'inline-flex', alignItems: 'center', padding: 0 };
const callButtonStyle = { width: 28, height: 28, padding: 0, border: '1px solid rgba(255,255,255,.55)', borderRadius: 14, background: 'rgba(255,255,255,.18)', color: '#fff', fontSize: 15, lineHeight: 1, cursor: 'pointer' };
const detailActionStyle = { height: 38, borderRadius: 20, fontSize: 14 };
const moreDeleteStyle = { height: 46, borderRadius: 12, justifyContent: 'flex-start', padding: '0 12px', fontSize: 15 };

export default function TrainingLeadsPage() {
  const canCreate = usePermission('training-lead:create');
  const [view, setView] = useState<{ type: 'list' } | { type: 'detail'; id: string }>({ type: 'list' });
  const [createVisible, setCreateVisible] = useState(false);
  const [listKey, setListKey] = useState(0);
  if (view.type === 'detail') return <LeadDetail id={view.id} onBack={() => setView({ type: 'list' })} onChanged={() => setListKey((key) => key + 1)} />;
  return <><LeadList key={listKey} canCreate={canCreate} onOpen={(id) => setView({ type: 'detail', id })} onCreate={() => setCreateVisible(true)} /><LeadEditor visible={createVisible} onClose={() => setCreateVisible(false)} onSaved={async (data) => { await trainingLeadService.create(data); setCreateVisible(false); setListKey((key) => key + 1); }} /></>;
}