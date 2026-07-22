import { useCallback, useEffect, useState } from 'react';
import { Button, DotLoading, Empty, Input, NavBar, Popup, SearchBar, Steps, Switch, Tag, Toast } from 'antd-mobile';
import { UserContactOutline } from 'antd-mobile-icons';
import { contractService } from '../services/contractService';
import { convertToChineseAmount, esignService } from '../services/esignService';
import { trainingLeadService } from '../services/modules';
import { DynamicField } from './Contract/DynamicField';
import type { ContractTemplate, NormalizedField } from '../types';
import type { TrainingLead } from '../types/modules';

const { Step } = Steps;
const COMPANY_NAME = '北京安得家政有限公司';
const COMPANY_ACCOUNT = 'ASIGN91110111MACJMD2R5J';

type Student = { name: string; phone: string; idCard: string; address: string };
type SignLink = { name?: string; account?: string; signUrl?: string; userType?: number };

function isStudentUserSuccess(code?: number) { return code === 100000 || code === 100074 || code === 100021; }
function isSignerSuccess(code?: number) { return code === 100000 || code === 100074; }
function errorText(result: { msg?: string; message?: string }) { return result.msg || result.message || '职培合同发起失败'; }
async function copySignLink(name: string, url: string) {
  const message = `尊敬${name}，合同已生成，请您点击链接签署${url}`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(message);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = message;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('copy failed');
    }
    Toast.show({ icon: 'success', content: '签署文案已复制，可发送给学员' });
  } catch {
    Toast.show({ icon: 'fail', content: '复制失败，请在合同详情中重试' });
  }
}

function fillTemplateFields(fields: NormalizedField[], current: Record<string, unknown>, student: Student, lead?: TrainingLead): Record<string, unknown> {
  const values = { ...current };
  const has = (field: NormalizedField, ...terms: string[]) => terms.some((term) => `${field.key}|${field.label}`.includes(term));
  for (const field of fields) {
    if (values[field.key] != null && values[field.key] !== '') continue;
    let value: unknown;
    if (has(field, '甲方姓名', '客户姓名')) value = COMPANY_NAME;
    else if (has(field, '甲方电话', '客户电话', '客户联系方式', '甲方联系电话')) value = '400-000-0000';
    else if (has(field, '学员姓名', '学生姓名', '劳动者姓名', '乙方姓名', '阿姨姓名')) value = student.name;
    else if (has(field, '学员电话', '学生电话', '学员联系方式', '劳动者电话', '乙方电话', '阿姨电话')) value = student.phone;
    else if (has(field, '学员身份证', '学生身份证', '劳动者身份证', '乙方身份证', '阿姨身份证')) value = student.idCard;
    else if (has(field, '学员地址', '学生地址', '联系地址')) value = student.address;
    else if (has(field, '报课金额')) value = lead?.courseAmount == null ? '' : String(lead.courseAmount);
    else if (has(field, '服务费')) value = lead?.serviceFeeAmount == null ? '' : String(lead.serviceFeeAmount);
    else if (has(field, '咨询职位')) value = lead?.consultPosition || '';
    else if (has(field, '意向课程', '培训课程', '多选1')) value = lead?.intendedCourses?.join('；') || '';
    if (value != null && value !== '') values[field.key] = value;
  }
  for (const field of fields) {
    if (!field.key.includes('大写') || values[field.key]) continue;
    const baseKey = field.key.replace('大写', '').trim();
    const baseValue = values[baseKey] ?? (field.key.includes('服务费') ? lead?.serviceFeeAmount : field.key.includes('报课') ? lead?.courseAmount : undefined);
    if (baseValue != null && baseValue !== '' && !Number.isNaN(Number(baseValue))) values[field.key] = convertToChineseAmount(String(baseValue));
  }
  return values;
}

function serializeTemplateParams(fields: NormalizedField[], values: Record<string, unknown>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (value == null || value === '') continue;
    params[field.key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  return params;
}

function templateAmount(fields: NormalizedField[], values: Record<string, unknown>, terms: string[]): number | undefined {
  const field = fields.find((item) => terms.some((term) => `${item.key}|${item.label}`.includes(term)));
  const raw = field ? values[field.key] : undefined;
  if (raw == null || raw === '') return undefined;
  const amount = Number(String(raw).replace(/[^\d.-]/g, ''));
  return Number.isFinite(amount) ? amount : undefined;
}

export function TrainingContractForm({ lead, onBack, onDone }: { lead?: TrainingLead; onBack: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [selectedLead, setSelectedLead] = useState<TrainingLead | undefined>(lead);
  const [student, setStudent] = useState<Student>({ name: lead?.name || '', phone: lead?.phone || '', idCard: lead?.idCardNumber || '', address: lead?.address || '' });
  const [paymentEnabled, setPaymentEnabled] = useState(true);
  const [leadPickerVisible, setLeadPickerVisible] = useState(false);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selected, setSelected] = useState<ContractTemplate>();
  const [fields, setFields] = useState<NormalizedField[]>([]);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [loadingFields, setLoadingFields] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signLinks, setSignLinks] = useState<SignLink[]>([]);

  const selectLead = (nextLead: TrainingLead) => {
    setSelectedLead(nextLead);
    setStudent({ name: nextLead.name || '', phone: nextLead.phone || '', idCard: nextLead.idCardNumber || '', address: nextLead.address || '' });
    setLeadPickerVisible(false);
    Toast.show({ icon: 'success', content: `已带入学员：${nextLead.name || nextLead.phone || '未命名学员'}` });
  };

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try { setTemplates(await esignService.getTemplates()); } catch { Toast.show({ icon: 'fail', content: '加载合同模板失败' }); } finally { setTemplatesLoading(false); }
  }, []);
  useEffect(() => { if (step === 1 && templates.length === 0) void loadTemplates(); }, [loadTemplates, step, templates.length]);

  const chooseTemplate = async (template: ContractTemplate) => {
    setSelected(template); setLoadingFields(true);
    try {
      const nextFields = await esignService.getTemplateFields(template.templateNo);
      setFields(nextFields);
      setParams((current) => fillTemplateFields(nextFields, current, student, selectedLead));
    } catch { Toast.show({ icon: 'fail', content: '加载模板字段失败' }); setFields([]); } finally { setLoadingFields(false); }
  };
  const nextStudent = () => {
    if (!student.name.trim() || !/^1[3-9]\d{9}$/.test(student.phone) || !student.idCard.trim()) {
      Toast.show({ content: '请填写学员姓名、正确手机号和身份证号' }); return;
    }
    setStep(1);
  };
  const submit = async () => {
    if (!selected) return;
    const filledParams = fillTemplateFields(fields, params, student, selectedLead);
    const missing = fields.filter((field) => field.required && !filledParams[field.key]);
    if (missing.length) { Toast.show({ content: `请填写：${missing.map((field) => field.label).join('、')}` }); return; }
    const finalParams = serializeTemplateParams(fields, filledParams);
    const courseAmount = selectedLead?.courseAmount ?? templateAmount(fields, filledParams, ['报课金额', '培训费', '培训金额', '课程金额']);
    const serviceFeeAmount = selectedLead?.serviceFeeAmount ?? templateAmount(fields, filledParams, ['服务费']);
    setSubmitting(true);
    try {
      // 先由后端领取职培统一编号；后续爱签、本地合同和签署链接共用该编号。
      const contractNo = await contractService.reserveContractNumber('training');
      const user = await esignService.addStudentUser({ name: student.name.trim(), mobile: student.phone, idCard: student.idCard.trim() });
      if (!isStudentUserSuccess(user.code)) throw new Error(errorText(user));
      const created = await esignService.createTrainingContract({ contractNo, contractName: selected.templateName || '安得家政培训合同', templateNo: selected.templateNo, templateParams: finalParams });
      if (created.code !== 100000) throw new Error(errorText(created));
      const local = await contractService.createContract({
        contractNumber: contractNo, orderCategory: 'training', customerName: student.name.trim(), customerPhone: student.phone,
        customerIdCard: student.idCard.trim(), customerAddress: student.address || undefined, trainingLeadId: selectedLead?._id || selectedLead?.id,
        courseAmount, serviceFeeAmount, intendedCourses: selectedLead?.intendedCourses,
        consultPosition: selectedLead?.consultPosition, esignContractNo: contractNo, esignStatus: '0', esignCreatedAt: new Date().toISOString(),
        esignTemplateNo: selected.templateNo, templateParams: finalParams, paymentEnabled,
      });
      const signer = await esignService.addTrainingSigners(contractNo, { account: student.phone, name: student.name.trim(), mobile: student.phone, signType: 'manual', validateType: 'sms' });
      if (!isSignerSuccess(signer.code)) throw new Error(errorText(signer));
      let signerData = signer.data;
      if (signer.code === 100074) {
        try { signerData = (await esignService.getTrainingContractStatus(contractNo)).data; } catch { Toast.show({ content: '签署方已存在，请稍后在合同详情查看签署链接' }); }
      }
      const links = Array.isArray(signerData?.signUser) ? signerData.signUser as SignLink[] : [];
      if (links.length) await contractService.updateContract(local._id, { esignSignUrls: JSON.stringify(links), esignStatus: '1' });
      setSignLinks(links); setStep(3); onDone(); Toast.show({ icon: 'success', content: '职培合同已发起' });
    } catch (error) { Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : '职培合同发起失败' }); } finally { setSubmitting(false); }
  };
  const setStudentField = (key: keyof Student) => (value: string) => setStudent((current) => ({ ...current, [key]: value }));
  const renderStudentStep = () => <div style={pageStyle}>
    <div style={sectionTitle}><span>学员资料</span><small>确认签署人身份与合同基础信息</small></div>
    <div style={cardStyle}>
      <div style={leadPickerCard}>
        <div style={leadPickerIcon}><UserContactOutline fontSize={22} /></div>
        <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 15 }}>{selectedLead ? '已选择学员线索' : '优先从学员线索选择'}</b><div style={hintStyle}>{selectedLead ? `${selectedLead.name || '未命名学员'} · ${selectedLead.phone || '暂无手机号'}` : '自动带入姓名、身份证、课程和费用，减少重复录入'}</div></div>
        <Button size="small" color="primary" fill="outline" onClick={() => setLeadPickerVisible(true)}>{selectedLead ? '更换' : '选择'}</Button>
      </div>
      {selectedLead && <div style={selectedLeadCard}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><b>{selectedLead.name || '未命名学员'}</b><Tag color="primary">线索已带入</Tag></div><div style={metaLine}>手机号 {selectedLead.phone || '-'}　·　来源 {selectedLead.leadSource || '-'}</div><div style={metaLine}>课程 {selectedLead.intendedCourses?.join('、') || '未填写'}　·　报课金额 {selectedLead.courseAmount == null ? '-' : `¥${selectedLead.courseAmount}`}</div></div>}
      <div style={formDivider} />
      <div style={fieldGrid}><Field label="学员姓名"><Input value={student.name} onChange={setStudentField('name')} placeholder="请输入真实姓名" /></Field><Field label="手机号"><Input value={student.phone} onChange={setStudentField('phone')} type="tel" placeholder="请输入签署手机号" /></Field></div>
      <Field label="身份证号"><Input value={student.idCard} onChange={setStudentField('idCard')} placeholder="用于爱签实名认证" /></Field>
      <Field label="联系地址（选填）"><Input value={student.address} onChange={setStudentField('address')} placeholder="请输入联系地址" /></Field>
      <div style={switchRow}><div><b>开启收款</b><div style={metaLine}>创建后可在合同详情生成收款码</div></div><Switch checked={paymentEnabled} onChange={setPaymentEnabled} /></div>
    </div>
    <Button block color="primary" onClick={nextStudent} style={{ ...primaryStyle, marginTop: 20 }}>下一步　选择合同模板</Button>
    <LeadPicker visible={leadPickerVisible} selectedId={selectedLead?._id || selectedLead?.id} onClose={() => setLeadPickerVisible(false)} onSelect={selectLead} />
  </div>;
  const renderTemplateStep = () => <div style={pageStyle}><div style={sectionTitle}><span>选择合同模板</span><small>请选择职培合同电子签模板</small></div>{templatesLoading ? <Loading /> : templates.length === 0 ? <div style={cardStyle}><Empty description="暂无可用合同模板" /></div> : <>{templates.map((template, index) => <button type="button" key={template.templateNo} onClick={() => void chooseTemplate(template)} style={{ ...templateStyle, borderColor: selected?.templateNo === template.templateNo ? '#158F82' : '#edf1f3', background: selected?.templateNo === template.templateNo ? '#eaf7f4' : '#fff' }}><span style={templateIndex}>{String(index + 1).padStart(2, '0')}</span><span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 15 }}>{template.templateName || template.templateNo}</b><small style={metaLine}>{selected?.templateNo === template.templateNo ? '已选择，可继续填写合同' : '点击选择此模板'}</small></span><Tag color={selected?.templateNo === template.templateNo ? 'primary' : 'default'}>{selected?.templateNo === template.templateNo ? '已选' : '选择'}</Tag></button>)}<div style={buttonRow}><Button block onClick={() => setStep(0)} style={secondaryStyle}>上一步</Button><Button block color="primary" disabled={!selected || loadingFields} onClick={() => setStep(2)} style={primaryStyle}>下一步　填写合同</Button></div></>}</div>;
  const renderFieldsStep = () => <div style={pageStyle}>{loadingFields ? <Loading /> : <><div style={sectionTitle}><span>确认合同内容</span><small>{selected?.templateName} · 带 * 的字段为必填</small></div><div style={cardStyle}>{fields.length ? fields.map((field) => <Field key={field.key} label={<>{field.label}{field.required && <span style={requiredMark}> *</span>}</>}><DynamicField field={field} value={params[field.key]} onChange={(value) => setParams((current) => ({ ...current, [field.key]: value }))} /></Field>) : <Empty description="该模板无需额外填写字段" />}</div><div style={buttonRow}><Button block onClick={() => setStep(1)} style={secondaryStyle}>上一步</Button><Button block color="primary" loading={submitting} onClick={() => void submit()} style={primaryStyle}>确认发起合同</Button></div></>}</div>;
  const renderSuccessStep = () => <div style={pageStyle}><div style={{ ...cardStyle, textAlign: 'center', paddingTop: 28 }}><div style={successIcon}>✓</div><div style={{ fontSize: 20, fontWeight: 700, color: '#158F82', marginTop: 12 }}>职培合同已发起</div><p style={hintStyle}>企业将自动签章，请复制签署文案发送给学员完成签署。</p>{signLinks.length ? signLinks.filter((item) => item.account !== COMPANY_ACCOUNT && item.signUrl).map((item, index) => <div key={item.account || index} style={{ ...linkStyle, textAlign: 'left' }}><b>乙方（学员）：{item.name || student.name}</b><span>{item.account || student.phone}</span><Button size="small" color="primary" onClick={() => void copySignLink(item.name || student.name, item.signUrl!)}>复制签署链接</Button></div>) : <p style={hintStyle}>签署链接生成中，请稍后在合同详情查看或重试获取。</p>}<Button block onClick={onBack} style={{ ...secondaryStyle, marginTop: 20 }}>返回职培合同列表</Button></div></div>;
  const content = step === 0 ? renderStudentStep() : step === 1 ? renderTemplateStep() : step === 2 ? renderFieldsStep() : renderSuccessStep();
  return <div style={{ minHeight: '100vh', background: '#f5f7fa' }}><NavBar onBack={onBack} style={{ background: '#fff', fontWeight: 700 }}>发起职培合同</NavBar><div style={heroStyle}><div style={{ fontSize: 20, fontWeight: 700 }}>创建职培合同</div><div style={{ marginTop: 5, fontSize: 12, opacity: .86 }}>完成资料、模板和签署信息后即可发起</div></div><div style={stepsCard}><Steps current={Math.min(step, 2)} style={{ '--title-font-size': '12px', '--icon-size': '20px' } as any}><Step title="学员资料" /><Step title="选择模板" /><Step title="确认签约" /></Steps></div>{content}</div>;
}

function LeadPicker({ visible, selectedId, onClose, onSelect }: { visible: boolean; selectedId?: string; onClose: () => void; onSelect: (lead: TrainingLead) => void }) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<TrainingLead[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (keyword = '') => { setLoading(true); try { const result = await trainingLeadService.list({ page: 1, pageSize: 20, search: keyword.trim() || undefined }); setItems(result.list || []); } catch { Toast.show({ icon: 'fail', content: '加载学员线索失败' }); } finally { setLoading(false); } }, []);
  useEffect(() => { if (visible) void load(''); }, [visible, load]);
  return <Popup visible={visible} onMaskClick={onClose} bodyStyle={{ height: '82vh', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' }}><div style={pickerHeader}><div><b style={{ fontSize: 18 }}>选择学员线索</b><div style={metaLine}>选择后将自动带入合同创建资料</div></div><Button size="small" fill="none" onClick={onClose}>关闭</Button></div><div style={{ padding: '0 16px 12px' }}><SearchBar value={search} onChange={setSearch} onSearch={(value) => void load(value)} placeholder="搜索学员姓名或手机号" style={{ '--border-radius': '20px', '--background': '#f5f7fa' }} /></div><div style={{ height: 'calc(100% - 116px)', overflowY: 'auto', padding: '0 16px 24px' }}>{loading ? <Loading /> : items.length === 0 ? <div style={cardStyle}><Empty description="暂无匹配的学员线索" /></div> : items.map((item, index) => { const id = item._id || item.id || item.phone || String(index); const selected = id === selectedId; return <button type="button" key={id} onClick={() => onSelect(item)} style={{ ...leadOption, borderColor: selected ? '#158F82' : '#edf1f3', background: selected ? '#eaf7f4' : '#fff' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><b style={{ flex: 1, textAlign: 'left', fontSize: 15 }}>{item.name || '未命名学员'}</b><Tag color={selected ? 'primary' : 'default'}>{selected ? '当前选择' : item.leadStatus || item.status || '学员线索'}</Tag></div><div style={metaLine}>{item.phone || '-'}　·　{item.leadSource || '未填写来源'}</div><div style={metaLine}>课程：{item.intendedCourses?.join('、') || '未填写'}　报课金额：{item.courseAmount == null ? '-' : `¥${item.courseAmount}`}</div></button>; })}</div></Popup>;
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) { return <div style={{ marginTop: 14 }}><div style={{ fontSize: 13, color: '#687384', marginBottom: 7 }}>{label}</div>{children}</div>; }
function Loading() { return <div style={{ textAlign: 'center', padding: 36 }}><DotLoading color="primary" /></div>; }
const pageStyle = { padding: '0 16px calc(100px + env(safe-area-inset-bottom))' };
const heroStyle = { margin: '0 16px 12px', padding: '18px 20px', color: '#fff', borderRadius: '0 0 18px 18px', background: 'linear-gradient(135deg, #158F82, #27aea0)', boxShadow: '0 5px 16px rgba(21,143,130,.18)' };
const stepsCard = { margin: '0 16px 14px', padding: '14px 10px 8px', background: '#fff', borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,.04)' };
const sectionTitle = { display: 'flex', flexDirection: 'column' as const, gap: 4, margin: '4px 2px 12px', color: '#263238', fontSize: 17, fontWeight: 700 };
const cardStyle = { background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 12px rgba(0,0,0,.04)' };
const hintStyle = { color: '#7b8794', fontSize: 12, lineHeight: 1.6, margin: '8px 0' };
const primaryStyle = { borderRadius: 20, height: 40, fontSize: 14 };
const secondaryStyle = { borderRadius: 20, height: 40, fontSize: 14, '--border-color': '#158F82', '--text-color': '#158F82' };
const buttonRow = { display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 };
const templateStyle = { display: 'flex', width: '100%', alignItems: 'center', gap: 12, textAlign: 'left' as const, marginBottom: 10, padding: '16px 14px', border: '1px solid transparent', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,.04)', font: 'inherit', color: '#263238' };
const linkStyle = { display: 'flex', flexDirection: 'column' as const, gap: 8, marginTop: 12, padding: 12, borderRadius: 10, background: '#f7f8fa', fontSize: 13 };
const leadPickerCard = { display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, background: '#f2fbf9', border: '1px solid #d8f0eb' };
const leadPickerIcon = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, color: '#158F82', background: '#dff5f0' };
const selectedLeadCard = { marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#f8fafb' };
const leadOption = { display: 'block', width: '100%', marginBottom: 10, padding: 14, border: '1px solid #edf1f3', borderRadius: 14, textAlign: 'left' as const, font: 'inherit', color: '#263238', boxShadow: '0 1px 6px rgba(0,0,0,.03)' };
const pickerHeader = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 16px 14px' };
const formDivider = { height: 1, margin: '16px 0 2px', background: '#f0f2f4' };
const fieldGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
const switchRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTop: '1px solid #f0f2f4' };
const metaLine = { color: '#7b8794', fontSize: 12, lineHeight: 1.6 };
const requiredMark = { color: '#e53935', fontWeight: 700 };
const templateIndex = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, color: '#158F82', background: '#eaf7f4', fontSize: 12, fontWeight: 700 };
const successIcon = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 28, color: '#fff', background: '#158F82', fontSize: 32, fontWeight: 700 };