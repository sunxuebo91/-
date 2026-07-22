import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Dialog,
  DotLoading,
  Empty,
  ErrorBlock,
  InfiniteScroll,
  Input,
  NavBar,
  Picker,
  Popup,
  PullToRefresh,
  Selector,
  Tag,
  TextArea,
  Toast,
} from 'antd-mobile';
import { AddOutline, FilterOutline } from 'antd-mobile-icons';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '../../hooks/usePermission';
import { financeService } from '../../services/financeService';
import { useAuthStore } from '../../stores/auth';
import type {
  FinanceCategory,
  FinanceOwner,
  FinanceRecord,
  FinanceRecordInput,
  FinanceSummary,
  FinanceType,
} from '../../types/finance';
import { useInfiniteList } from '../../pages/_shared';

type Filters = {
  type?: FinanceType;
  categoryId?: string;
  ownerId?: string;
  keyword: string;
  startDate?: string;
  endDate?: string;
};

type EditorDraft = {
  type: FinanceType;
  categoryId: string;
  projectName: string;
  amount: string;
  ownerId: string;
  occurredAt: string;
  remark: string;
};

const INITIAL_SUMMARY: FinanceSummary = { totalIncome: 0, totalExpense: 0, profit: 0 };
const TYPE_OPTIONS = [{ label: '收入', value: 'income' }, { label: '支出', value: 'expense' }];

const dateText = (value?: string) => (value ? value.slice(0, 10) : '-');
const money = (value?: number) => `¥${Number(value || 0).toFixed(2)}`;
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const monthStart = () => {
  const date = new Date();
  return localDate(new Date(date.getFullYear(), date.getMonth(), 1));
};
const errorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') return response.data.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

function ChoiceField({ label, value, options, placeholder, onChange }: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const current = options.find((option) => option.value === value);
  return <><button type="button" onClick={() => setVisible(true)} style={{ width: '100%', minHeight: 48, padding: '0 14px', border: 0, borderBottom: '1px solid #eef1f4', color: '#1f2937', background: '#fff', font: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ color: '#475569' }}>{label}</span><span style={{ maxWidth: '62%', overflow: 'hidden', color: current ? '#1f2937' : '#94a3b8', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.label || placeholder}</span></button><Picker columns={[options]} visible={visible} value={value ? [value] : []} onClose={() => setVisible(false)} onConfirm={(values) => { const next = values[0]; if (typeof next === 'string') onChange(next); }} /></>;
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return <div style={{ minWidth: 0, flex: 1, padding: '14px 10px', textAlign: 'center' }}><div style={{ overflow: 'hidden', color, fontSize: 16, fontWeight: 700, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{money(value)}</div><div style={{ marginTop: 5, color: '#778291', fontSize: 12 }}>{label}</div></div>;
}

function RecordEditor({ record, categories, owners, onClose, onSaved }: {
  record: FinanceRecord | null;
  categories: FinanceCategory[];
  owners: FinanceOwner[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const user = useAuthStore((state) => state.user);
  const defaultOwnerId = user?._id || user?.id || '';
  const [draft, setDraft] = useState<EditorDraft>(() => ({
    type: record?.type || 'income', categoryId: record?.categoryId || '', projectName: record?.projectName || '', amount: record ? String(record.amount) : '', ownerId: record?.ownerId || defaultOwnerId, occurredAt: dateText(record?.occurredAt) === '-' ? localDate(new Date()) : dateText(record?.occurredAt), remark: record?.remark || '',
  }));
  const [dateVisible, setDateVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const categoryOptions = categories.filter((category) => category.type === draft.type).map((category) => ({ label: category.name, value: category._id }));
  const ownerOptions = owners.map((owner) => ({ label: owner.name || owner.username || '未命名', value: owner._id }));
  const update = <K extends keyof EditorDraft>(key: K, value: EditorDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const amount = Number(draft.amount);
    if (!draft.categoryId || !draft.projectName.trim() || !draft.ownerId || !draft.occurredAt || !Number.isFinite(amount) || amount < 0) {
      Toast.show({ icon: 'fail', content: '请完整填写收支项目、名称、金额、负责人和发生时间' });
      return;
    }
    const input: FinanceRecordInput = { type: draft.type, categoryId: draft.categoryId, projectName: draft.projectName.trim(), amount, ownerId: draft.ownerId, occurredAt: draft.occurredAt, remark: draft.remark.trim() || undefined };
    setSaving(true);
    try {
      if (record) await financeService.updateRecord(record._id, input); else await financeService.createRecord(input);
      Toast.show({ icon: 'success', content: record ? '已更新财务记录' : '已新增财务记录' });
      await onSaved();
      onClose();
    } catch (error) {
      Toast.show({ icon: 'fail', content: errorMessage(error, '保存失败') });
    } finally { setSaving(false); }
  };
  return <Popup visible onMaskClick={onClose} onClose={onClose} bodyStyle={{ minHeight: '70vh', borderRadius: '20px 20px 0 0', background: '#f5f7fa' }}><div style={{ padding: '16px 16px calc(18px + env(safe-area-inset-bottom))' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}><b style={{ fontSize: 18 }}>{record ? '编辑财务记录' : '新增财务记录'}</b><Button size="mini" fill="none" onClick={onClose}>取消</Button></div><section style={{ overflow: 'hidden', borderRadius: 16, background: '#fff' }}><div style={{ padding: '12px 14px', borderBottom: '1px solid #eef1f4' }}><div style={{ marginBottom: 8, color: '#475569', fontSize: 14 }}>收支类型</div><Selector columns={2} options={TYPE_OPTIONS} value={[draft.type]} onChange={(values) => { const type = values[0] as FinanceType | undefined; if (type) setDraft((current) => ({ ...current, type, categoryId: '' })); }} /></div><ChoiceField label="收支项目" value={draft.categoryId} options={categoryOptions} placeholder="请选择" onChange={(value) => update('categoryId', value)} /><div style={{ padding: '8px 14px', borderBottom: '1px solid #eef1f4' }}><Input value={draft.projectName} onChange={(value) => update('projectName', value)} placeholder="项目名称，如：张三-服务费" clearable /></div><div style={{ padding: '8px 14px', borderBottom: '1px solid #eef1f4' }}><Input value={draft.amount} onChange={(value) => update('amount', value)} placeholder="金额（元）" type="number" clearable /></div><ChoiceField label="负责人" value={draft.ownerId} options={ownerOptions} placeholder={ownerOptions.length ? '请选择' : '暂无可选负责人'} onChange={(value) => update('ownerId', value)} /><button type="button" onClick={() => setDateVisible(true)} style={{ width: '100%', minHeight: 48, padding: '0 14px', border: 0, borderBottom: '1px solid #eef1f4', color: '#1f2937', background: '#fff', font: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ color: '#475569' }}>发生时间</span><span>{draft.occurredAt}</span></button><div style={{ padding: '10px 14px' }}><TextArea value={draft.remark} onChange={(value) => update('remark', value)} placeholder="备注（选填）" autoSize={{ minRows: 2, maxRows: 4 }} /></div></section><Button block color="primary" loading={saving} onClick={save} style={{ height: 46, marginTop: 16, borderRadius: 12, fontWeight: 600 }}>保存</Button></div><DatePicker visible={dateVisible} precision="day" value={new Date(`${draft.occurredAt}T00:00:00`)} onClose={() => setDateVisible(false)} onConfirm={(date) => { update('occurredAt', localDate(date)); setDateVisible(false); }} /></Popup>;
}

export default function FinancePage() {
  const navigate = useNavigate();
  const canCreate = usePermission('finance:create');
  const canEdit = usePermission('finance:edit');
  const canDelete = usePermission('finance:delete');
  const canViewUsers = usePermission('user:view');
  const [filters, setFilters] = useState<Filters>({ keyword: '', startDate: monthStart(), endDate: localDate(new Date()) });
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [owners, setOwners] = useState<FinanceOwner[]>([]);
  const [summary, setSummary] = useState<FinanceSummary>(INITIAL_SUMMARY);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [filterVisible, setFilterVisible] = useState(false);
  const [detail, setDetail] = useState<FinanceRecord | null>(null);
  const [editor, setEditor] = useState<FinanceRecord | null | undefined>(undefined);
  const queryKey = `${filters.type || ''}|${filters.categoryId || ''}|${filters.ownerId || ''}|${filters.keyword}|${filters.startDate || ''}|${filters.endDate || ''}`;
  const fetchPage = useCallback(async (page: number, pageSize: number) => {
    const result = await financeService.listRecords({ ...filters, keyword: filters.keyword.trim() || undefined, page, pageSize });
    return { list: result.items, total: result.total };
  }, [filters]);
  const { items, hasMore, error, loadMore, refresh } = useInfiniteList(fetchPage, 20);
  const refreshAll = useCallback(async () => { await refresh(); }, [refresh]);

  useEffect(() => { refresh().catch(() => undefined); }, [refresh, queryKey]);
  useEffect(() => {
    let active = true;
    const loadChoices = async () => {
      try { const next = await financeService.getCategories(); if (active) setCategories(next); } catch { if (active) setCategories([]); }
      if (canViewUsers) {
        try { const next = await financeService.getOwners(); if (active) setOwners(next); } catch { if (active) setOwners([]); }
      }
    };
    loadChoices().catch(() => undefined);
    return () => { active = false; };
  }, [canViewUsers]);
  useEffect(() => {
    let active = true;
    setSummaryLoading(true);
    financeService.getSummary({ startDate: filters.startDate, endDate: filters.endDate, ownerId: filters.ownerId }).then((next) => { if (active) setSummary(next); }).catch(() => { if (active) setSummary(INITIAL_SUMMARY); }).finally(() => { if (active) setSummaryLoading(false); });
    return () => { active = false; };
  }, [filters.endDate, filters.ownerId, filters.startDate]);

  const categoryOptions = useMemo(() => categories.map((category) => ({ label: category.name, value: category._id })), [categories]);
  const ownerOptions = useMemo(() => owners.map((owner) => ({ label: owner.name || owner.username || '未命名', value: owner._id })), [owners]);
  const setMonth = () => setFilters((current) => ({ ...current, startDate: monthStart(), endDate: localDate(new Date()) }));
  const clearFilters = () => setFilters({ keyword: '', startDate: undefined, endDate: undefined });
  const deleteRecord = async (record: FinanceRecord) => {
    const confirmed = await Dialog.confirm({ content: `确定删除“${record.projectName}”吗？` });
    if (!confirmed) return;
    try { await financeService.removeRecord(record._id); Toast.show({ icon: 'success', content: '已删除' }); setDetail(null); await refreshAll(); } catch (error) { Toast.show({ icon: 'fail', content: errorMessage(error, '删除失败') }); }
  };
  return <div style={{ minHeight: '100vh', background: '#f5f7fa' }}><NavBar onBack={() => navigate(-1)} right={<div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><FilterOutline fontSize={22} onClick={() => setFilterVisible(true)} />{canCreate && <AddOutline fontSize={24} onClick={() => setEditor(null)} />}</div>} style={{ background: '#fff', fontWeight: 700 }}>财务流水</NavBar><div style={{ padding: '12px 16px 100px' }}><section style={{ overflow: 'hidden', borderRadius: 16, background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}><div style={{ display: 'flex', borderBottom: '1px solid #eef1f4' }}>{summaryLoading ? <div style={{ width: '100%', padding: 22, textAlign: 'center' }}><DotLoading color="primary" /></div> : <><Metric label="总收入" value={summary.totalIncome} color="#16856f" /><Metric label="总支出" value={summary.totalExpense} color="#d9363e" /><Metric label="盈亏" value={summary.profit} color={summary.profit >= 0 ? '#158f82' : '#d9363e'} /></>}</div><div style={{ display: 'flex', gap: 8, padding: 10 }}><Button size="small" color={filters.startDate ? 'primary' : 'default'} fill={filters.startDate ? 'solid' : 'outline'} onClick={setMonth}>本月</Button><Button size="small" fill="outline" onClick={clearFilters}>全部</Button><div style={{ flex: 1, minWidth: 0 }}><Input value={filters.keyword} onChange={(keyword) => setFilters((current) => ({ ...current, keyword }))} placeholder="项目名称 / 备注" clearable /></div></div></section><PullToRefresh onRefresh={refreshAll}><div style={{ minHeight: '56vh', paddingTop: 12 }}>{error && !items.length ? <ErrorBlock status="default" title="加载失败" description={errorMessage(error, '请检查网络后重试')}><Button size="small" color="primary" onClick={() => refreshAll().catch(() => undefined)}>重新加载</Button></ErrorBlock> : !items.length && !hasMore ? <Empty description="暂无财务记录" /> : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{items.map((record) => <button key={record._id} type="button" onClick={() => setDetail(record)} style={{ width: '100%', padding: 14, border: 0, borderRadius: 16, background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.04)', color: '#1f2937', font: 'inherit', textAlign: 'left' }}><div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}><div style={{ minWidth: 0 }}><div style={{ overflow: 'hidden', fontSize: 16, fontWeight: 600, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.projectName}</div><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}><Tag color={record.type === 'income' ? 'success' : 'danger'} fill="outline">{record.type === 'income' ? '收入' : '支出'}</Tag><span style={{ overflow: 'hidden', color: '#697586', fontSize: 12, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.categoryName}</span></div></div><div style={{ flexShrink: 0, color: record.type === 'income' ? '#16856f' : '#d9363e', fontSize: 17, fontWeight: 700 }}>{record.type === 'income' ? '+' : '-'}{money(record.amount)}</div></div><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12, color: '#8893a3', fontSize: 12 }}><span>{dateText(record.occurredAt)}</span><span>{record.ownerName || '-'}</span></div></button>)}</div>}<InfiniteScroll loadMore={loadMore} hasMore={hasMore}>{hasMore ? <DotLoading color="primary" /> : items.length ? <span style={{ color: '#98a2b3', fontSize: 12 }}>已到底部</span> : null}</InfiniteScroll></div></PullToRefresh></div><Popup visible={!!detail} onMaskClick={() => setDetail(null)} onClose={() => setDetail(null)} bodyStyle={{ borderRadius: '20px 20px 0 0', background: '#f5f7fa' }}>{detail && <div style={{ padding: '16px 16px calc(18px + env(safe-area-inset-bottom))' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}><div><div style={{ fontSize: 18, fontWeight: 700 }}>{detail.projectName}</div><div style={{ marginTop: 6, color: detail.type === 'income' ? '#16856f' : '#d9363e', fontSize: 22, fontWeight: 700 }}>{detail.type === 'income' ? '+' : '-'}{money(detail.amount)}</div></div><Tag color={detail.type === 'income' ? 'success' : 'danger'}>{detail.type === 'income' ? '收入' : '支出'}</Tag></div><section style={{ overflow: 'hidden', borderRadius: 16, background: '#fff' }}>{[['收支项目', detail.categoryName], ['负责人', detail.ownerName], ['发生时间', dateText(detail.occurredAt)], ['来源', detail.source === 'system' ? '系统同步' : '手动录入'], ['操作人', detail.createdByName || '-'], ['备注', detail.remark || '-']].map(([label, value], index, rows) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, minHeight: 48, padding: '0 14px', alignItems: 'center', borderBottom: index === rows.length - 1 ? 0 : '1px solid #eef1f4' }}><span style={{ color: '#697586', fontSize: 14 }}>{label}</span><span style={{ maxWidth: '65%', color: '#1f2937', fontSize: 14, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span></div>)}</section>{(canEdit || canDelete) && <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>{canEdit && <Button block color="primary" fill="outline" onClick={() => { setEditor(detail); setDetail(null); }}>编辑</Button>}{canDelete && <Button block color="danger" fill="outline" onClick={() => deleteRecord(detail)}>删除</Button>}</div>}</div>}</Popup><Popup visible={filterVisible} onMaskClick={() => setFilterVisible(false)} onClose={() => setFilterVisible(false)} bodyStyle={{ borderRadius: '20px 20px 0 0', background: '#f5f7fa' }}><div style={{ padding: '16px 16px calc(18px + env(safe-area-inset-bottom))' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}><b style={{ fontSize: 18 }}>筛选财务流水</b><Button size="mini" fill="none" onClick={() => setFilterVisible(false)}>关闭</Button></div><section style={{ overflow: 'hidden', borderRadius: 16, background: '#fff' }}><div style={{ padding: '12px 14px', borderBottom: '1px solid #eef1f4' }}><div style={{ marginBottom: 8, color: '#475569', fontSize: 14 }}>收支类型</div><Selector columns={3} options={[{ label: '全部', value: '' }, ...TYPE_OPTIONS]} value={[filters.type || '']} onChange={(values) => setFilters((current) => ({ ...current, type: (values[0] as FinanceType) || undefined, categoryId: undefined }))} /></div><ChoiceField label="收支项目" value={filters.categoryId || ''} options={[{ label: '全部', value: '' }, ...categoryOptions]} placeholder="全部" onChange={(value) => setFilters((current) => ({ ...current, categoryId: value || undefined }))} />{canViewUsers && <ChoiceField label="负责人" value={filters.ownerId || ''} options={[{ label: '全部', value: '' }, ...ownerOptions]} placeholder="全部" onChange={(value) => setFilters((current) => ({ ...current, ownerId: value || undefined }))} />}</section><Button block color="primary" onClick={() => setFilterVisible(false)} style={{ height: 46, marginTop: 16, borderRadius: 12 }}>查看结果</Button></div></Popup>{editor !== undefined && <RecordEditor record={editor} categories={categories} owners={owners} onClose={() => setEditor(undefined)} onSaved={refreshAll} />}</div>;
}