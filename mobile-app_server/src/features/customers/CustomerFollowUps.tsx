import { useCallback, useEffect, useState } from 'react';
import { Button, DotLoading, Empty, Form, NavBar, Popup, SearchBar, Selector, Space, Tag, TextArea, Toast } from 'antd-mobile';
import { customerService } from '../../services/customerService';
import { resumeService } from '../../services/resumeService';
import { fmtDateTime } from '../../pages/_shared';
import { FOLLOW_UP_RESULTS, FOLLOW_UP_TYPES } from './constants';
import type { CustomerFollowUp, RecommendedWorker } from './types';

interface CustomerFollowUpsProps { customerId: string; canEdit: boolean; openFormToken?: number; }

export function CustomerFollowUps({ customerId, canEdit, openFormToken }: CustomerFollowUpsProps) {
  const [followUps, setFollowUps] = useState<CustomerFollowUp[]>([]);
  const [fuLoading, setFuLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [workers, setWorkers] = useState<RecommendedWorker[]>([]);
  const [workerKeyword, setWorkerKeyword] = useState('');
  const [workerLoading, setWorkerLoading] = useState(false);
  const [workerPickerVisible, setWorkerPickerVisible] = useState(false);
  const [selectedWorkers, setSelectedWorkers] = useState<RecommendedWorker[]>([]);
  const [fuForm] = Form.useForm();
  const loadFollowUps = useCallback(async () => {
    setFuLoading(true);
    try { setFollowUps(await customerService.getFollowUps(customerId)); } catch { setFollowUps([]); } finally { setFuLoading(false); }
  }, [customerId]);
  useEffect(() => { loadFollowUps(); }, [loadFollowUps]);
  useEffect(() => { if (openFormToken) setShowForm(true); }, [openFormToken]);
  const resetForm = () => { fuForm.resetFields(); setNextFollowUpDate(''); setSelectedWorkers([]); };
  const closeForm = () => { if (submitting) return; resetForm(); setShowForm(false); };
  const searchWorkers = async (keyword = workerKeyword) => {
    setWorkerLoading(true);
    try {
      const page = await resumeService.getPage({ page: 1, pageSize: 20, keyword: keyword.trim() || undefined });
      setWorkers((page.items || []).map((worker) => ({ _id: worker._id || worker.id || '', name: worker.name, jobType: worker.jobType, expectedSalary: worker.expectedSalary, experienceYears: worker.experienceYears })).filter((worker) => worker._id));
    } catch (error: any) { Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '加载阿姨库失败' }); } finally { setWorkerLoading(false); }
  };
  const onSubmit = async (values: Record<string, unknown>) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await customerService.createFollowUp(customerId, {
        type: Array.isArray(values.type) ? values.type[0] as string : values.type as string,
        content: values.content as string,
        result: Array.isArray(values.result) ? values.result[0] as string : values.result as string | undefined,
        nextFollowUpDate: nextFollowUpDate || undefined,
        recommendedWorkerIds: selectedWorkers.map((worker) => worker._id),
      });
      await loadFollowUps();
      Toast.show({ icon: 'success', content: '跟进记录已添加' });
      resetForm(); setShowForm(false);
    } catch (error: any) { Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '添加失败，请重试' }); } finally { setSubmitting(false); }
  };
  const typeLabel = (type: string) => FOLLOW_UP_TYPES.find((item) => item.value === type)?.label || type || '-';
  const resultLabel = (result?: string) => FOLLOW_UP_RESULTS.find((item) => item.value === result)?.label;
  return <><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 8px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}><span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>跟进时间线（{followUps.length}）</span>{canEdit && <span style={{ color: '#158F82', fontSize: 14, fontWeight: 500, cursor: 'pointer' }} onClick={() => !submitting && setShowForm(true)}>+ 新增跟进</span>}</div>
    <div style={{ padding: '16px' }}>{fuLoading ? <div style={{ textAlign: 'center', padding: 24 }}><DotLoading color="primary" /></div> : followUps.length === 0 ? <Empty description="暂无跟进记录" imageStyle={{ width: 60 }} /> : followUps.map((f, index) => <div key={f._id || index} style={{ position: 'relative', paddingLeft: 24, paddingBottom: index === followUps.length - 1 ? 0 : 18, borderLeft: index === followUps.length - 1 ? '1px solid transparent' : '1px solid #cfe9e5' }}><span style={{ position: 'absolute', left: -6, top: 2, width: 11, height: 11, borderRadius: '50%', background: index === 0 ? '#158F82' : '#8ecbc3', border: '2px solid #fff', boxShadow: '0 0 0 1px #b9ddd8' }} /><div style={{ background: index === 0 ? '#f0faf8' : '#f7f8fa', borderRadius: 10, padding: '10px 12px' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}><span style={{ fontSize: 12, color: '#788395' }}>{fmtDateTime(f.createdAt || '')} · {f.createdBy?.name || f.createdBy?.username || '—'}</span><Tag color="primary" fill="outline" style={{ borderRadius: 4 }}>{typeLabel(f.type)}</Tag></div><div style={{ fontSize: 14, color: '#25313d', lineHeight: 1.55 }}>{f.content || '—'}</div>{resultLabel(f.result) && <div style={{ marginTop: 7 }}><Tag color={f.result === 'signed' ? 'success' : 'primary'} style={{ borderRadius: 4 }}>结果：{resultLabel(f.result)}</Tag></div>}{f.nextFollowUpDate && <div style={{ marginTop: 7, color: '#b86b16', fontSize: 12 }}>下次跟进：{fmtDateTime(f.nextFollowUpDate)}</div>}{(f.recommendedWorkerIds || []).length > 0 && <div style={{ marginTop: 7, color: '#267167', fontSize: 12 }}>推荐阿姨：{f.recommendedWorkerIds?.map((worker) => worker.name).join('、')}</div>}</div></div>)}</div>
    <Popup visible={showForm} onMaskClick={closeForm} onClose={closeForm} bodyStyle={{ maxHeight: '90vh', overflowY: 'auto', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32 }}><NavBar back={null} onBack={closeForm} style={{ background: '#fff' }}>新增跟进记录</NavBar><Form form={fuForm} onFinish={onSubmit} footer={<Space block direction="vertical"><Button block type="submit" color="primary" loading={submitting} disabled={submitting}>保存跟进</Button><Button block fill="outline" disabled={submitting} onClick={closeForm}>取消</Button></Space>}><Form.Item name="type" label="沟通方式" rules={[{ required: true, message: '请选择沟通方式' }]}><Selector columns={3} options={FOLLOW_UP_TYPES} /></Form.Item><Form.Item name="result" label="跟进结果" rules={[{ required: true, message: '请选择跟进结果' }]}><Selector columns={3} options={FOLLOW_UP_RESULTS} /></Form.Item><Form.Item name="content" label="跟进内容" rules={[{ required: true, message: '请输入跟进内容' }]}><TextArea placeholder="请记录本次沟通、客户需求和下一步计划" rows={4} maxLength={1000} showCount /></Form.Item><Form.Item label="下次跟进日期"><input aria-label="下次跟进日期" type="date" value={nextFollowUpDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setNextFollowUpDate(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px', border: '1px solid #ddd', borderRadius: 8 }} /></Form.Item><Form.Item label="推荐阿姨"><Button block fill="outline" onClick={() => { setWorkerPickerVisible(true); if (workers.length === 0) searchWorkers(); }}>从真实简历库选择</Button>{selectedWorkers.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{selectedWorkers.map((worker) => <span key={worker._id} onClick={() => setSelectedWorkers((items) => items.filter((item) => item._id !== worker._id))} style={{ color: '#267167', background: '#eaf7f4', borderRadius: 4, padding: '3px 6px', fontSize: 12, cursor: 'pointer' }}>{worker.name}{worker.jobType ? ` · ${worker.jobType}` : ''} ×</span>)}</div>}<div style={{ marginTop: 6, fontSize: 12, color: '#8993a4' }}>仅保存本次推荐人选，后续可在创建合同中继续选择。</div></Form.Item></Form></Popup>
    <Popup visible={workerPickerVisible} onMaskClick={() => setWorkerPickerVisible(false)} bodyStyle={{ height: '78vh', display: 'flex', flexDirection: 'column', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}><NavBar back={null} onBack={() => setWorkerPickerVisible(false)} style={{ background: '#fff' }}>选择推荐阿姨</NavBar><div style={{ padding: '0 16px 12px' }}><SearchBar value={workerKeyword} onChange={setWorkerKeyword} onSearch={() => searchWorkers()} placeholder="搜索姓名、手机号或工种" /></div><div style={{ flex: 1, overflowY: 'auto', background: '#f5f7fa', padding: 12 }}>{workerLoading ? <div style={{ textAlign: 'center', padding: 30 }}><DotLoading color="primary" /></div> : workers.length === 0 ? <Empty description="未找到可推荐阿姨" /> : workers.map((worker) => { const selected = selectedWorkers.some((item) => item._id === worker._id); return <div key={worker._id} onClick={() => setSelectedWorkers((items) => selected ? items.filter((item) => item._id !== worker._id) : [...items, worker])} style={{ background: '#fff', borderRadius: 10, padding: '12px', marginBottom: 8, border: selected ? '1px solid #158F82' : '1px solid transparent' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}><span>{worker.name}</span><span style={{ color: '#158F82', fontSize: 12 }}>{selected ? '已选择' : '选择'}</span></div><div style={{ marginTop: 5, color: '#687384', fontSize: 12 }}>{[worker.jobType, worker.expectedSalary ? `期望 ¥${worker.expectedSalary}` : '', worker.experienceYears != null ? `${worker.experienceYears} 年经验` : ''].filter(Boolean).join(' · ') || '简历信息待完善'}</div></div>; })}</div><div style={{ padding: 12, background: '#fff' }}><Button block color="primary" onClick={() => setWorkerPickerVisible(false)}>完成（{selectedWorkers.length}）</Button></div></Popup>
  </>;
}