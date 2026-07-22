import { useEffect, useState, type ReactNode } from 'react';
import { DownOutline, UpOutline } from 'antd-mobile-icons';
import { Button, DatePicker, Form, Input, NavBar, Selector, Tabs, TextArea, Toast } from 'antd-mobile';
import { usePermission } from '../../hooks/usePermission';
import { customerService } from '../../services/customerService';
import { useAuthStore } from '../../stores/auth';
import type { Customer } from '../../types';
import { CONTRACT_STATUSES, EDUCATION_REQUIREMENTS, formatDateInput, LEAD_LEVELS, LEAD_SOURCES, REST_SCHEDULES, SERVICE_CATEGORIES } from './constants';
import { firstSelected, optionalNumber, optionalText, selectorOptions } from './customerForm';
import type { AssignableUser } from './types';

interface CustomerFormViewProps { id?: string; initialValues?: Record<string, unknown>; onBack: () => void; onSaved: () => void; }

type FormApi = ReturnType<typeof Form.useForm>[0];
type ChoiceOption = { label: string; value: string; disabled?: boolean };

const formItemStyle = { '--border-inner': 'none', '--border-bottom': 'none', marginBottom: 0 } as const;

// 各必填字段（Form.Item rules）所在的 Tab，用于校验失败时自动跳转定位。
const FIELD_TAB_MAP: Record<string, string> = { name: 'basic', leadSource: 'basic', contractStatus: 'basic', leadLevel: 'basic' };

function FieldRow({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <div className="customer-form-field-row"><div className="customer-form-field-label">{required && <span className="customer-form-required">*</span>}{label}</div><div className="customer-form-field-control">{children}</div></div>;
}

function TextField({ name, label, placeholder, type = 'text', required = false, rules }: { name: string; label: string; placeholder: string; type?: 'text' | 'tel' | 'number'; required?: boolean; rules?: Array<Record<string, unknown>> }) {
  return <FieldRow label={label} required={required}><Form.Item name={name} rules={rules} style={formItemStyle}><Input placeholder={placeholder} type={type} clearable /></Form.Item></FieldRow>;
}

function TextAreaField({ name, label, placeholder, rows = 3 }: { name: string; label: string; placeholder: string; rows?: number }) {
  return <FieldRow label={label}><Form.Item name={name} style={formItemStyle}><TextArea placeholder={placeholder} rows={rows} maxLength={500} showCount /></Form.Item></FieldRow>;
}

function ChoiceField({ name, label, options, columns = 3, required = false, rules, noWrap = false }: { name: string; label: string; options: ChoiceOption[]; columns?: number; required?: boolean; rules?: Array<Record<string, unknown>>; noWrap?: boolean }) {
  // 注意：Selector 必须是 Form.Item 的唯一直接子元素——Form.Item 通过 cloneElement 把
  // value/onChange 注入到它的直接子节点上；若在外面套一层 <div>，注入的属性会落在 div 上被忽略，
  // Selector 会退化为纯本地状态（点击后视觉高亮但表单值一直是 undefined），导致必填校验永远失败。
  return <div className="customer-form-choice-row"><div className="customer-form-choice-label">{required && <span className="customer-form-required">*</span>}{label}</div><div className="customer-form-choice-control"><Form.Item name={name} rules={rules} style={formItemStyle}><Selector className={`customer-form-selector ${noWrap ? 'customer-form-selector-nowrap' : ''}`} columns={columns} options={options} /></Form.Item></div></div>;
}

function DateFormItem({ form, name, label }: { form: FormApi; name: string; label: string }) {
  const [visible, setVisible] = useState(false);
  const value = Form.useWatch(name, form) as string | undefined;
  return <FieldRow label={label}><Form.Item name={name} style={formItemStyle}><div className={`customer-form-date ${value ? 'has-value' : ''}`} onClick={() => setVisible(true)}>{value || '点击选择日期'}<DownOutline fontSize={14} /></div><DatePicker visible={visible} precision="day" onClose={() => setVisible(false)} onConfirm={(date) => { form.setFieldValue(name, formatDateInput(date)); setVisible(false); }} /></Form.Item></FieldRow>;
}

function CollapsibleCard({ title, description, open, onToggle, count, children }: { title: string; description: string; open: boolean; onToggle: () => void; count?: string; children: ReactNode }) {
  return <section className="customer-form-card">
    <button type="button" className="customer-form-card-header" onClick={onToggle} aria-expanded={open}>
      <span className="customer-form-card-heading"><strong>{title}</strong><small>{description}</small></span>
      <span className="customer-form-card-action">{count && <em>{count}</em>}{open ? <UpOutline /> : <DownOutline />}</span>
    </button>
    {open && <div className="customer-form-card-body">{children}</div>}
  </section>;
}

export function CustomerFormView({ id, initialValues, onBack, onSaved }: CustomerFormViewProps) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({
    contact: true,
    layering: true,
    more: false,
    assignment: false,
    service: true,
    family: false,
    auntie: false,
    details: true,
    deal: false,
  });
  const isEdit = !!id;
  const canViewAssignableUsers = usePermission('user:view');
  const currentUser = useAuthStore((state) => state.user);
  const canSetRestrictedStatus = ['admin', 'manager', 'operator', '运营', 'dispatch', '派单老师'].includes(currentUser?.role || '');
  useEffect(() => {
    if (id) customerService.getCustomerById(id).then((customer) => {
      form.setFieldsValue({ ...customer, contractStatus: customer.contractStatus ? [customer.contractStatus] : [], leadLevel: customer.leadLevel ? [customer.leadLevel] : [], serviceCategory: customer.serviceCategory ? [customer.serviceCategory] : [], leadSource: customer.leadSource ? [customer.leadSource] : [], restSchedule: customer.restSchedule ? [customer.restSchedule] : [], genderRequirement: customer.genderRequirement ? [customer.genderRequirement] : [], educationRequirement: customer.educationRequirement ? [customer.educationRequirement] : [] });
    }).catch(() => Toast.show({ icon: 'fail', content: '客户信息加载失败' }));
    else if (initialValues) form.setFieldsValue(initialValues);
  }, [form, id, initialValues]);
  useEffect(() => { if (canViewAssignableUsers && !isEdit) customerService.getAssignableUsers().then(setAssignableUsers).catch(() => setAssignableUsers([])); }, [canViewAssignableUsers, isEdit]);
  const onFinishFailed = (errorInfo: { errorFields: Array<{ name: Array<string | number>; errors: string[] }> }) => {
    // 必填字段校验未通过时，rc-field-form 会 reject，onFinish 不会执行；
    // 若不处理会完全无提示（尤其是失败字段所在的 Tab 当前不可见时）。
    const first = errorInfo.errorFields[0];
    if (!first) return;
    Toast.show({ icon: 'fail', content: first.errors[0] || '请完整填写必填项' });
    const fieldName = String(first.name[0]);
    if (FIELD_TAB_MAP[fieldName]) {
      setActiveTab(FIELD_TAB_MAP[fieldName]);
      setOpenCards((previous) => ({ ...previous, contact: true, layering: true }));
    }
  };
  const onFinish = async (values: Record<string, unknown>) => {
    const phone = optionalText(values.phone);
    const wechatId = optionalText(values.wechatId);
    if (!phone && !wechatId) return Toast.show({ icon: 'fail', content: '请填写手机号或微信号' });
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) return Toast.show({ icon: 'fail', content: '请输入有效的手机号码' });
    const idCardNumber = optionalText(values.idCardNumber);
    if (idCardNumber && !/^[1-9]\d{5}(18|19|20)\d{2}((0[1-9])|(1[0-2]))(([0-2][1-9])|10|20|30|31)\d{3}[0-9Xx]$/.test(idCardNumber)) return Toast.show({ icon: 'fail', content: '请输入有效的身份证号码' });
    const address = optionalText(values.address);
    if (address && address.length > 200) return Toast.show({ icon: 'fail', content: '服务地址不能超过 200 个字符' });
    const payload: Partial<Customer> = { name: optionalText(values.name), phone, wechatId, idCardNumber, leadSource: firstSelected(values.leadSource), contractStatus: firstSelected(values.contractStatus), leadLevel: firstSelected(values.leadLevel), serviceCategory: firstSelected(values.serviceCategory), assignedTo: firstSelected(values.assignedTo), assignmentReason: optionalText(values.assignmentReason), salaryBudget: optionalNumber(values.salaryBudget), restSchedule: firstSelected(values.restSchedule), expectedStartDate: optionalText(values.expectedStartDate), expectedDeliveryDate: optionalText(values.expectedDeliveryDate), serviceDays: optionalNumber(values.serviceDays), homeArea: optionalNumber(values.homeArea), familySize: optionalNumber(values.familySize), address, ageRequirement: optionalText(values.ageRequirement), genderRequirement: firstSelected(values.genderRequirement), originRequirement: optionalText(values.originRequirement), educationRequirement: firstSelected(values.educationRequirement), needWorkingHours: optionalText(values.needWorkingHours), needServicePeriod: optionalText(values.needServicePeriod), needWorkContent: optionalText(values.needWorkContent), needRemarks: optionalText(values.needRemarks), dealAmount: optionalNumber(values.dealAmount), remarks: optionalText(values.remarks) };
    if (!payload.name || !payload.leadSource || !payload.contractStatus || !payload.leadLevel) return Toast.show({ icon: 'fail', content: '请完整填写姓名、线索来源、签约状态和线索等级' });
    const invalidNumber = ['salaryBudget', 'serviceDays', 'homeArea', 'familySize', 'dealAmount'].some((key) => payload[key as keyof Customer] !== undefined && Number.isNaN(payload[key as keyof Customer]));
    if (invalidNumber) return Toast.show({ icon: 'fail', content: '金额、面积、人数和服务天数须填写数字' });
    setSubmitting(true);
    try { if (isEdit && id) { await customerService.updateCustomer(id, payload); Toast.show({ icon: 'success', content: '客户信息已更新' }); } else { await customerService.createCustomer(payload); Toast.show({ icon: 'success', content: '客户已创建' }); } onSaved(); } catch (error: any) { Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '保存失败' }); } finally { setSubmitting(false); }
  };
  const toggleCard = (key: string) => setOpenCards((previous) => ({ ...previous, [key]: !previous[key] }));
  const tabKeys = ['basic', 'needs', 'followUp'] as const;
  const tabIndex = tabKeys.indexOf(activeTab as typeof tabKeys[number]);
  const isLastTab = tabIndex === tabKeys.length - 1;
  const nextTab = () => setActiveTab(tabKeys[Math.min(tabIndex + 1, tabKeys.length - 1)]);
  const previousTab = () => setActiveTab(tabKeys[Math.max(tabIndex - 1, 0)]);
  const tabTitle = (step: string, title: string, hint: string) => <div className="customer-form-tab-title"><strong>{title}</strong><small>{step} / 3 · {hint}</small></div>;
  return <div style={{ background: '#f5f7fa', minHeight: '100vh', paddingBottom: 92 }}>
    <NavBar onBack={onBack} style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}>{isEdit ? '编辑客户' : '新增客户'}</NavBar>
    <div className="customer-form-intro"><strong>{isEdit ? '完善客户资料' : '创建新客户'}</strong><span>高频信息直接填写，更多资料点击卡片标题展开。</span></div>
    <Form form={form} onFinish={onFinish} onFinishFailed={onFinishFailed} layout="horizontal" className="customer-form" style={{ '--border-top': 'none', '--border-bottom': 'none', '--border-inner': 'none' }}>
      <div className="customer-form-tabs-shell">
        <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ '--active-line-color': '#158F82', '--active-title-color': '#158F82', '--title-font-size': '13px' }}>
          <Tabs.Tab title={tabTitle('1', '基础资料', '必填')} key="basic">
            <div className="customer-form-tab-body">
              <CollapsibleCard title="客户信息" description="姓名、联系方式和身份证号，手机号或微信号至少填一项" open={!!openCards.contact} onToggle={() => toggleCard('contact')}>
                <TextField name="name" label="客户姓名" placeholder="请输入客户姓名" required rules={[{ required: true, message: '请输入客户姓名' }]} />
                <TextField name="phone" label="客户电话" placeholder="请输入手机号" type="tel" />
                <TextField name="wechatId" label="微信号" placeholder="手机号或微信号至少填一项" />
                <TextField name="idCardNumber" label="身份证号" placeholder="选填" />
              </CollapsibleCard>
              <CollapsibleCard title="客户分层" description="来源、签约状态和线索等级" open={!!openCards.layering} onToggle={() => toggleCard('layering')}>
                <ChoiceField name="leadSource" label="线索来源" columns={4} options={selectorOptions(LEAD_SOURCES)} required rules={[{ required: true, message: '请选择线索来源' }]} />
                <ChoiceField name="contractStatus" label="签约状态" columns={4} noWrap options={selectorOptions(CONTRACT_STATUSES).map((item) => ({ ...item, disabled: (item.value === '已签约' || item.value === '签约中') && !canSetRestrictedStatus }))} required rules={[{ required: true, message: '请选择签约状态' }]} />
                <ChoiceField name="leadLevel" label="线索等级" columns={4} options={selectorOptions(LEAD_LEVELS).map((item) => ({ ...item, disabled: item.value === 'O类' && !canSetRestrictedStatus }))} required rules={[{ required: true, message: '请选择线索等级' }]} />
              </CollapsibleCard>
              {!isEdit && canViewAssignableUsers && <CollapsibleCard title="负责人设置" description="默认不指定，后续可在客户详情中分配" count={assignableUsers.length ? `${assignableUsers.length}人` : '选填'} open={!!openCards.assignment} onToggle={() => toggleCard('assignment')}>
                {assignableUsers.length > 0 ? <ChoiceField name="assignedTo" label="指定负责人" columns={2} options={assignableUsers.map((user) => ({ label: user.name || user.username, value: user._id }))} /> : <div className="customer-form-empty">暂无可指定负责人</div>}
                <TextField name="assignmentReason" label="分配备注" placeholder="选填" />
              </CollapsibleCard>}
            </div>
          </Tabs.Tab>
          <Tabs.Tab title={tabTitle('2', '服务需求', '家庭情况')} key="needs">
            <div className="customer-form-tab-body">
              <CollapsibleCard title="核心服务需求" description="工种、预算、上户时间和服务地址" open={!!openCards.service} onToggle={() => toggleCard('service')}>
                <ChoiceField name="serviceCategory" label="需求品类" options={selectorOptions(SERVICE_CATEGORIES)} />
                <TextField name="salaryBudget" label="薪资预算" placeholder="例如：8000-10000 元" type="number" />
                <ChoiceField name="restSchedule" label="休息方式" options={selectorOptions(REST_SCHEDULES)} />
                <DateFormItem form={form} name="expectedStartDate" label="期望上户" />
                <TextField name="address" label="服务地址" placeholder="请输入服务地址，选填" />
              </CollapsibleCard>
              <CollapsibleCard title="家庭扩展信息" description="预产期、服务天数和家庭规模" count="选填" open={!!openCards.family} onToggle={() => toggleCard('family')}>
                <DateFormItem form={form} name="expectedDeliveryDate" label="预产期" />
                <TextField name="serviceDays" label="服务天数" placeholder="例如：26 天" type="number" />
                <TextField name="homeArea" label="家庭面积" placeholder="例如：120 平方米" type="number" />
                <TextField name="familySize" label="家庭人口" placeholder="例如：3 人" type="number" />
              </CollapsibleCard>
              <CollapsibleCard title="阿姨要求" description="年龄、性别、籍贯和学历等筛选条件" count="选填" open={!!openCards.auntie} onToggle={() => toggleCard('auntie')}>
                <TextField name="ageRequirement" label="年龄要求" placeholder="如：25-45 岁" />
                <ChoiceField name="genderRequirement" label="性别要求" options={selectorOptions(['女', '男', '不限'])} />
                <TextField name="originRequirement" label="籍贯要求" placeholder="如：四川、湖南等" />
                <ChoiceField name="educationRequirement" label="学历要求" options={selectorOptions(EDUCATION_REQUIREMENTS)} />
              </CollapsibleCard>
            </div>
          </Tabs.Tab>
          <Tabs.Tab title={tabTitle('3', '跟进设置', '备注')} key="followUp">
            <div className="customer-form-tab-body">
              <CollapsibleCard title="跟进重点" description="工作时间、工作内容和客户特殊要求" open={!!openCards.details} onToggle={() => toggleCard('details')}>
                <TextField name="needWorkingHours" label="工作时间" placeholder="如：8:00-17:00、住家" />
                <TextAreaField name="needWorkContent" label="工作内容" placeholder="如：负责照顾 9 个月宝宝一切" />
                <TextAreaField name="needRemarks" label="需求备注" placeholder="特殊偏好、忌讳等" />
              </CollapsibleCard>
              <CollapsibleCard title="其他跟进信息" description="服务周期、成交金额和内部备注" count="选填" open={!!openCards.deal} onToggle={() => toggleCard('deal')}>
                <TextField name="needServicePeriod" label="服务周期" placeholder="如：长期、1年" />
                <TextField name="dealAmount" label="成交金额" placeholder="元，选填" type="number" />
                <TextAreaField name="remarks" label="内部备注" placeholder="选填" />
              </CollapsibleCard>
            </div>
          </Tabs.Tab>
        </Tabs>
      </div>
      <div className="customer-form-footer">{tabIndex > 0 && <Button block type="button" fill="outline" onClick={previousTab} style={{ '--border-color': '#158F82', '--text-color': '#158F82' }}>上一步</Button>}{!isLastTab ? <Button block type="button" color="primary" onClick={nextTab}>下一步</Button> : <Button block type="submit" color="primary" loading={submitting} disabled={submitting}>{isEdit ? '保存修改' : '创建客户'}</Button>}</div>
    </Form>
  </div>;
}