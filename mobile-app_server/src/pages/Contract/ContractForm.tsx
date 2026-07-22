import { useCallback, useEffect, useState } from 'react';
import {
  NavBar,
  Button,
  Steps,
  Toast,
  DotLoading,
  Input,
  Empty,
  DatePicker,
} from 'antd-mobile';
import { contractService } from '../../services/contractService';
import { customerService } from '../../services/customerService';
import { esignService, convertToChineseAmount } from '../../services/esignService';
import { PartyPicker } from './PartyPicker';
import { DynamicField } from './DynamicField';
import type {
  CustomerMatchingCandidate,
  PartySearchResult,
  ContractTemplate,
  NormalizedField,
  CreateContractData,
} from '../../types';

const { Step } = Steps;

type Party = {
  name: string;
  phone: string;
  idCard: string;
  address?: string;
  id?: string;
  // 乙方（阿姨）附加信息，用于模板自动预填
  gender?: string;
  age?: number | string;
  nativePlace?: string;
  expectedSalary?: number | string;
};
const emptyParty: Party = { name: '', phone: '', idCard: '', address: '', id: '' };

// 基础信息（后端家政合同 model 必填：合同类型/起止时间/工资/服务费）
type BaseInfo = {
  contractType: string;
  startDate: Date | null;
  endDate: Date | null;
  workerSalary: string;
  customerServiceFee: string;
};
const emptyBase: BaseInfo = {
  contractType: '',
  startDate: null,
  endDate: null,
  workerSalary: '',
  customerServiceFee: '',
};
const toISODate = (d: Date | null): string | undefined =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : undefined;
const displayChineseJobType = (jobType?: string): string =>
  jobType && /[\u3400-\u9fff]/.test(jobType) && !/[A-Za-z]/.test(jobType) ? jobType : '工种待确认';

// 按模板字段名（dataKey）关键字匹配，从甲方(客户)/乙方(阿姨)自动带出值（对齐 CRM getDefaultValue）
const autoFillValue = (
  field: NormalizedField,
  a: Party,
  b: Party,
): string | undefined => {
  const k = `${field.key || ''}|${field.label || ''}`;
  const has = (...ws: string[]) => ws.some((w) => k.includes(w));
  const str = (v: unknown) => (v == null || v === '' ? undefined : String(v));

  // 甲方（客户）
  if (has('客户姓名', '签署人姓名', '甲方姓名')) return str(a.name);
  if (has('客户电话', '客户联系方式', '甲方电话', '甲方联系电话', '甲方联系方式'))
    return str(a.phone);
  if (has('客户身份证', '甲方身份证')) return str(a.idCard);
  if (has('甲方联系地址', '客户联系地址', '客户地址', '客户服务地址', '服务地址', '服务联系地址'))
    return str(a.address);

  // 乙方（阿姨）
  if (has('阿姨姓名', '阿嫂姓名', '乙方姓名')) return str(b.name);
  if (has('阿姨电话', '阿嫂电话', '乙方电话')) return str(b.phone);
  if (has('阿姨身份证', '阿嫂身份证', '乙方身份证')) return str(b.idCard);
  if (has('阿姨联系地址', '阿嫂联系地址', '阿姨地址', '阿嫂地址', '乙方地址', '联系地址'))
    return str(b.address);
  if (has('籍贯')) return str(b.nativePlace);
  if (has('年龄')) return str(b.age);
  if (has('性别', 'sex', 'gender', 'xb')) {
    let rawVal = b.gender;
    if (rawVal === 'female') rawVal = '女';
    if (rawVal === 'male') rawVal = '男';

    if (rawVal) {
      if (field.options && field.options.length > 0) {
        const opt = field.options.find(
          (o) => o.label === rawVal || o.value === rawVal || o.label.includes(rawVal)
        );
        if (opt) return opt.value;
      }
      return str(rawVal);
    }
  }

  return undefined;
};

// 自动生成大写金额：字段名含"大写"时，依据其去掉"大写"的同名金额字段推算
const withUppercaseAmounts = (params: Record<string, unknown>): Record<string, unknown> => {
  const out = { ...params };
  Object.keys(params).forEach((k) => {
    if (k.includes('大写')) {
      const baseKey = k.replace('大写', '').trim();
      const baseVal = params[baseKey];
      if (baseVal != null && baseVal !== '' && (out[k] == null || out[k] === '')) {
        const suffix = (k.includes('工资') || k.includes('薪') || k.includes('首次匹配费')) ? 'yuanzheng' : 'none';
        out[k] = convertToChineseAmount(String(baseVal), suffix);
      }
    }
  });
  return out;
};

export function ContractForm({ onBack, onSaved, initialCustomer, changeWorker }: { onBack: () => void; onSaved: (id?: string) => void; initialCustomer?: { _id?: string; customerId?: string; name?: string; phone?: string; address?: string; idCardNumber?: string; serviceCategory?: string; expectedStartDate?: string; salaryBudget?: number; customerServiceFee?: number }; changeWorker?: { originalContractId: string; originalWorkerName?: string } }) {
  // 换人模式：家政客户合同换阿姨（职培订单不支持换人，入口已隐藏）
  const isChangeMode = !!changeWorker;
  const [step, setStep] = useState(changeWorker ? 1 : 0);
  const [partyA, setPartyA] = useState<Party>({ ...emptyParty });
  const [partyB, setPartyB] = useState<Party>({ ...emptyParty });
  const [pickerA, setPickerA] = useState(false);
  const [pickerB, setPickerB] = useState(false);
  const [forceCreateNew, setForceCreateNew] = useState(false);

  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [selectedTpl, setSelectedTpl] = useState<ContractTemplate | null>(null);
  const [fields, setFields] = useState<NormalizedField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [base, setBase] = useState<BaseInfo>({ ...emptyBase });
  const [startVisible, setStartVisible] = useState(false);
  const [endVisible, setEndVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [matchingCandidates, setMatchingCandidates] = useState<CustomerMatchingCandidate[]>([]);
  const [matchingLoading, setMatchingLoading] = useState(false);
  // 换人模式：原合同完整数据（用于带入 templateParams、锁定结束日期/服务费等，对齐 CRM）
  const [originalContractData, setOriginalContractData] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (!initialCustomer?.name) return;
    setPartyA({
      ...emptyParty,
      id: initialCustomer._id || initialCustomer.customerId || '',
      name: initialCustomer.name,
      phone: initialCustomer.phone || '',
      address: initialCustomer.address || '',
      idCard: initialCustomer.idCardNumber || '',
    });
    const expectedStartDate = initialCustomer.expectedStartDate ? new Date(initialCustomer.expectedStartDate) : null;
    setBase((previous) => ({ ...previous, contractType: initialCustomer.serviceCategory || previous.contractType, startDate: expectedStartDate && !Number.isNaN(expectedStartDate.getTime()) ? expectedStartDate : previous.startDate, workerSalary: initialCustomer.salaryBudget != null ? String(initialCustomer.salaryBudget) : previous.workerSalary, customerServiceFee: initialCustomer.customerServiceFee != null ? String(initialCustomer.customerServiceFee) : previous.customerServiceFee }));
  }, [initialCustomer]);

  // 换人模式：加载原合同完整信息（templateParams、结束日期等），对齐 CRM 网页端换人逻辑
  useEffect(() => {
    if (!changeWorker?.originalContractId) return;
    let cancelled = false;
    contractService
      .getContractById(changeWorker.originalContractId)
      .then((contract) => {
        if (cancelled) return;
        setOriginalContractData(contract);
        // 结束日期锁定为原合同的结束日期
        const endDate = contract.endDate ? new Date(contract.endDate) : null;
        if (endDate && !Number.isNaN(endDate.getTime())) {
          setBase((prev) => ({ ...prev, endDate }));
        }
        // 服务费/阿姨工资锁定为原合同的值（若尚未从 initialCustomer 带入）
        setBase((prev) => ({
          ...prev,
          customerServiceFee: prev.customerServiceFee || (contract.customerServiceFee != null ? String(contract.customerServiceFee) : prev.customerServiceFee),
          workerSalary: prev.workerSalary || (contract.workerSalary != null ? String(contract.workerSalary) : prev.workerSalary),
        }));
      })
      .catch(() => {
        if (!cancelled) Toast.show({ icon: 'fail', content: '加载原合同信息失败' });
      });
    return () => { cancelled = true; };
  }, [changeWorker?.originalContractId]);

  useEffect(() => {
    if (!initialCustomer?._id) return;
    let cancelled = false;
    setMatchingLoading(true);
    customerService.getMatchingCandidates(initialCustomer._id).then((candidates) => { if (!cancelled) setMatchingCandidates(candidates); }).catch(() => { if (!cancelled) setMatchingCandidates([]); }).finally(() => { if (!cancelled) setMatchingLoading(false); });
    return () => { cancelled = true; };
  }, [initialCustomer?._id]);

  const loadTemplates = useCallback(async () => {
    setTplLoading(true);
    try {
      setTemplates(await esignService.getTemplates());
    } catch {
      Toast.show({ icon: 'fail', content: '加载模板失败' });
    } finally {
      setTplLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step === 2 && templates.length === 0) loadTemplates();
  }, [step, templates.length, loadTemplates]);

  const chooseTemplate = useCallback(
    async (tpl: ContractTemplate) => {
      setSelectedTpl(tpl);
      setFieldsLoading(true);
      try {
        const fs = await esignService.getTemplateFields(tpl.templateNo);

        // 特殊处理：将「首次匹配费」强制转为下拉选择框
        fs.forEach((f) => {
          if (f.label.includes('首次匹配费') && !f.label.includes('大写')) {
            f.type = 'select';
            f.options = [
              { label: '1000', value: '1000' },
              { label: '1500', value: '1500' },
            ];
          }
        });

        setFields(fs);
        // 按模板字段名（dataKey）关键字自动预填甲乙双方信息（对齐 CRM 关键字匹配）
        setParams((prev) => {
          const next = { ...prev };
          for (const f of fs) {
            // 已有值不覆盖
            if (next[f.key] != null && next[f.key] !== '') continue;
            const auto = autoFillValue(f, partyA, partyB);
            if (auto != null && auto !== '') next[f.key] = auto;
          }
          // 换人模式：从原合同 templateParams 带入需要锁定/复用的字段（对齐 CRM fetchAndFillCustomerData）
          if (isChangeMode && originalContractData?.templateParams) {
            const originalParams = originalContractData.templateParams as Record<string, unknown>;
            for (const f of fs) {
              if (next[f.key] != null && next[f.key] !== '') continue;
              if (originalParams[f.key] != null && originalParams[f.key] !== '') {
                next[f.key] = originalParams[f.key];
              }
            }
          }
          return next;
        });
        // 从模板名推断合同类型（对齐 CRM：长词优先避免误匹配）
        const tplName = tpl.templateName || '';
        const detected = ['住家育儿嫂', '住家保姆', '住家护老', '白班育儿嫂', '白班育儿', '白班保姆', '月嫂', '保洁', '养宠', '小时工'].find(
          (t) => tplName.includes(t),
        );
        if (detected) setBase((b) => (b.contractType ? b : { ...b, contractType: detected }));
      } catch {
        Toast.show({ icon: 'fail', content: '加载模板字段失败' });
        setFields([]);
      } finally {
        setFieldsLoading(false);
      }
    },
    [partyA, partyB, isChangeMode, originalContractData],
  );

  // 换人模式：模板列表加载完成后，自动锁定为原合同使用的模板（换人不支持换模板，对齐 CRM）
  useEffect(() => {
    if (!isChangeMode || selectedTpl || templates.length === 0) return;
    const templateNo = originalContractData?.esignTemplateNo;
    if (!templateNo) return;
    const matched = templates.find((t) => t.templateNo === templateNo);
    if (matched) {
      chooseTemplate(matched);
    } else {
      Toast.show({ icon: 'fail', content: '未找到原合同使用的合同模板，请联系管理员' });
    }
  }, [isChangeMode, originalContractData, templates, selectedTpl, chooseTemplate]);

  // 换人模式下判断某个动态字段是否应被锁定为只读（对齐 CRM renderFormControl 的 shouldDisable 逻辑）
  const isFieldLockedInChangeMode = useCallback(
    (field: NormalizedField): boolean => {
      if (!isChangeMode) return false;
      const k = `${field.key || ''}${field.label || ''}`;
      const has = (...ws: string[]) => ws.some((w) => k.includes(w));

      // 甲方（客户）信息不变
      if (has('客户', '甲方')) return true;
      // 合同/服务结束时间不变
      if (has('结束') && has('年', '月', '日', '时间')) return true;
      // 服务费不变
      if (has('服务费')) return true;
      // 服务类型不变
      if (has('服务类型')) return true;
      // 服务地址不变
      if (has('服务地址')) return true;
      // 换人次数为自动计算字段
      if (has('换人次数')) return true;
      // 首次匹配费：仅当原合同已存在该字段时才锁定（避免重复收取/允许新收取）
      if (has('首次匹配费')) {
        const originalParams = originalContractData?.templateParams as Record<string, unknown> | undefined;
        return !!originalParams && Object.keys(originalParams).some((key) => key.includes('首次匹配费'));
      }
      return false;
    },
    [isChangeMode, originalContractData],
  );

  const setParam = (key: string, v: unknown) => {
    setParams((p) => {
      const next = { ...p, [key]: v };
      const valStr = v == null ? '' : String(v);
      if (valStr && !isNaN(Number(valStr))) {
        const upperKey = `${key}大写`;
        if (fields.some((f) => f.key === upperKey)) {
          next[upperKey] = convertToChineseAmount(
            valStr,
            key.includes('工资') || key.includes('薪') || key.includes('首次匹配费') ? 'yuanzheng' : 'none',
          );
        }
      } else if (!valStr) {
        const upperKey = `${key}大写`;
        if (fields.some((f) => f.key === upperKey)) {
          next[upperKey] = '';
        }
      }
      return next;
    });
  };

  const validateParties = (): boolean => {
    if (!partyA.name || !partyA.phone || !partyA.idCard) {
      Toast.show({ content: '请完整填写甲方姓名/电话/身份证' });
      return false;
    }
    if (!partyB.name || !partyB.phone || !partyB.idCard) {
      Toast.show({ content: '请完整填写乙方姓名/电话/身份证' });
      return false;
    }
    return true;
  };

  const submit = useCallback(async () => {
    if (!selectedTpl) {
      Toast.show({ content: '请先选择合同模板' });
      return;
    }
    // 基础信息（后端家政合同必填）校验
    let finalContractType = base.contractType;
    if (!finalContractType) {
      const types = ['住家育儿嫂', '住家保姆', '住家护老', '白班育儿嫂', '白班育儿', '白班保姆', '月嫂', '保洁', '养宠', '小时工'];
      const tplName = selectedTpl.templateName || '';
      finalContractType = types.find(t => tplName.includes(t)) || (params['合同类型'] as string) || (params['服务类型'] as string) || '住家保姆';
    }

    if (!base.startDate || !base.endDate) {
      Toast.show({ content: '请选择服务起止日期' });
      return;
    }
    if (base.workerSalary === '' || base.customerServiceFee === '') {
      Toast.show({ content: '请填写人员薪资与服务费' });
      return;
    }
    // 先用基础信息里的金额补齐模板中的金额字段（服务费/人员薪资等），再统一推算大写，
    // 然后再做必填校验——避免可自动带出的金额/大写字段被误判为「未填写」。
    const merged: Record<string, unknown> = { ...params };
    const fillIfEmpty = (key: string, val: unknown) => {
      const exists = fields.some((f) => f.key === key);
      if (exists && (merged[key] == null || merged[key] === '') && val != null && val !== '')
        merged[key] = String(val);
    };
    fillIfEmpty('服务费', base.customerServiceFee);
    fillIfEmpty('人员薪资', base.workerSalary);
    fillIfEmpty('阿姨工资', base.workerSalary);
    fillIfEmpty('合同开始时间', toISODate(base.startDate));
    fillIfEmpty('合同结束时间', toISODate(base.endDate));
    fillIfEmpty('服务开始时间', toISODate(base.startDate));
    fillIfEmpty('服务结束时间', toISODate(base.endDate));
    fillIfEmpty('合同起止时间', base.startDate && base.endDate ? `${toISODate(base.startDate)}至${toISODate(base.endDate)}` : '');
    // 服务时间/服务期限：由起止日期拼成「YYYY年M月D日至YYYY年M月D日」
    const cnDate = (d: Date | null) =>
      d ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` : '';
    if (base.startDate && base.endDate) {
      const range = `${cnDate(base.startDate)}至${cnDate(base.endDate)}`;
      fields.forEach((f) => {
        if (
          (f.key.includes('服务时间') || f.key.includes('服务期限')) &&
          (merged[f.key] == null || merged[f.key] === '')
        ) {
          merged[f.key] = range;
        }
      });
    }
    const finalParams = withUppercaseAmounts(merged);
    // 模板必填字段校验（基于自动补齐后的最终值）
    const missing = fields.filter((f) => f.required && !finalParams[f.key]);
    if (missing.length) {
      Toast.show({ content: `请填写：${missing.map((f) => f.label).join('、')}` });
      return;
    }
    setSubmitting(true);
    try {
      // 对齐 CRM：先发起爱签三步，成功拿到 esignContractNo 后再落库，任一步失败即报错、不落库、不留草稿。
      // 步骤0：预约合同编号（后端原子生成），全程复用同一编号作为 esignContractNo。
      const contractNo = await contractService.reserveContractNumber('housekeeping');

      // 步骤1：批量注册甲乙双方为爱签用户
      const users = await esignService.addUsersBatch({
        partyAName: partyA.name, partyAMobile: partyA.phone, partyAIdCard: partyA.idCard,
        partyBName: partyB.name, partyBMobile: partyB.phone, partyBIdCard: partyB.idCard,
        workerId: partyB.id || undefined,
      });
      if (!users.partyASuccess || !users.partyBSuccess) {
        throw new Error(users.message || '添加签署人失败，请检查甲乙双方姓名/手机号/身份证');
      }

      // 步骤2：用模板创建爱签合同
      const created = await esignService.createHousekeepingContract({
        contractNo,
        contractName: selectedTpl.templateName || '安得家政服务合同',
        templateNo: selectedTpl.templateNo,
        templateParams: finalParams,
      });
      if (created.code !== 100000) {
        throw new Error(created.msg || created.message || '创建电子合同失败');
      }

      // 步骤3：添加甲乙丙三方签署人并触发签署（100074=重复添加，视为成功）
      const signed = await esignService.addHousekeepingSigners(
        contractNo,
        { name: partyA.name, mobile: partyA.phone },
        { name: partyB.name, mobile: partyB.phone },
      );
      if (signed.code !== 100000 && signed.code !== 100074) {
        throw new Error(signed.msg || signed.message || '发起签署失败');
      }

      // 爱签三步全部成功，落库时即为「签约中」，不会再产生草稿。
      const payload: CreateContractData = {
        customerName: partyA.name,
        customerPhone: partyA.phone,
        customerIdCard: partyA.idCard,
        customerAddress: partyA.address || undefined,
        // 库中选中传真实 id；否则传 'temp' 由后端生成占位 id（对齐 CRM）
        customerId: partyA.id || 'temp',
        workerName: partyB.name,
        workerPhone: partyB.phone,
        workerIdCard: partyB.idCard,
        workerAddress: partyB.address || undefined,
        workerId: partyB.id || 'temp',
        contractType: finalContractType,
        startDate: toISODate(base.startDate),
        endDate: toISODate(base.endDate),
        workerSalary: Number(base.workerSalary),
        customerServiceFee: Number(base.customerServiceFee),
        templateNo: selectedTpl.templateNo,
        templateParams: finalParams,
        forceCreateNew,
        // 爱签三步已完成：显式以「签约中」落库，不能回落到模型默认的「草稿」。
        contractNumber: contractNo,
        esignContractNo: contractNo,
        esignStatus: '1',
        contractStatus: 'signing',
        esignCreatedAt: new Date().toISOString(),
        esignTemplateNo: selectedTpl.templateNo,
      };
      // 换人模式：走专用换人接口（原合同自动标记「已换人」）；否则普通创建
      const res = isChangeMode && changeWorker
        ? await contractService.createChangeWorkerContract(changeWorker.originalContractId, payload)
        : await contractService.createContract(payload);
      Toast.show({ icon: 'success', content: isChangeMode ? '换人合同创建成功，签署链接已发送给客户与新阿姨' : '合同已创建，签署链接已发送给客户与阿姨' });
      onSaved(res._id);
    } catch (e) {
      Toast.show({ icon: 'fail', content: e instanceof Error ? e.message : '创建失败' });
    } finally {
      setSubmitting(false);
    }
  }, [selectedTpl, fields, params, base, partyA, partyB, forceCreateNew, onSaved]);

  const PartyCard = ({ title, party, onPick, placeholder = '未选择', locked = false }: { title: string; party: Party; onPick: () => void; placeholder?: string; locked?: boolean }) => (
    <div style={{ padding: '0 16px', marginTop: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 12, paddingLeft: 4 }}>{title}</div>
      <div
        onClick={onPick}
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '20px 16px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        {party.name ? (
          <div>
            <div style={{ fontWeight: 600, fontSize: 18, color: '#1a1a1a', marginBottom: 6 }}>{party.name}</div>
            <div style={{ fontSize: 13, color: '#666' }}>
              {party.phone}
              {party.idCard ? ` · ${party.idCard}` : ''}
            </div>
          </div>
        ) : (
          <div style={{ color: '#999', fontSize: 15 }}>{placeholder}</div>
        )}
        <div style={{
          color: locked ? '#999' : '#158F82',
          fontSize: 14,
          fontWeight: 500,
          background: locked ? 'rgba(0,0,0,0.04)' : 'rgba(21, 143, 130, 0.08)',
          padding: '6px 16px',
          borderRadius: 20,
        }}>
          {locked ? '已锁定' : party.name ? '重新选择' : '从库中选择'}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ background: '#f5f7fa', minHeight: '100vh', paddingBottom: 60 }}>
      <NavBar
        onBack={onBack}
        right={(isChangeMode ? null : (
          <Button
            size="mini"
            fill={forceCreateNew ? 'solid' : 'outline'}
            color="primary"
            onClick={() => {
              setForceCreateNew((enabled) => !enabled);
              Toast.show({ content: forceCreateNew ? '已关闭一客两单' : '已开启一客两单：将创建独立新订单' });
            }}
            style={{ borderRadius: 20, fontSize: 12, '--border-color': '#158F82', '--text-color': '#158F82' }}
          >
            一客两单
          </Button>
        ))}
        style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}
      >
        {isChangeMode ? '换人签约' : '智能签署 · 新建合同'}
      </NavBar>
      {isChangeMode && changeWorker && (
        <div style={{ margin: '12px 16px 0', padding: '10px 12px', borderRadius: 12, background: 'rgba(21, 143, 130, 0.08)', color: '#158F82', fontSize: 13, lineHeight: 1.6 }}>
          🔄 为客户「{partyA.name || '—'}」更换阿姨{changeWorker.originalWorkerName ? `（原阿姨：${changeWorker.originalWorkerName}）` : ''}，提交后生成新合同并发起签署，原合同自动标记为「已换人」。
        </div>
      )}
      <div style={{ background: '#fff', padding: '20px 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', marginBottom: 12, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}>
        <Steps current={step} style={{ '--title-font-size': '13px', '--icon-size': '18px' } as any}>
          <Step title="选甲方" />
          <Step title="选乙方" />
          <Step title="选模板" />
          <Step title="填写内容" />
        </Steps>
      </div>

      {step === 0 && (
        <>
          <PartyCard
            title={isChangeMode ? '甲方（客户 · 换人已锁定）' : '甲方（客户库）'}
            party={partyA}
            onPick={() => { if (!isChangeMode) setPickerA(true); }}
            locked={isChangeMode}
          />
          {forceCreateNew ? (
            <div style={{ margin: '12px 16px 0', padding: '10px 12px', borderRadius: 12, background: 'rgba(21, 143, 130, 0.08)', color: '#158F82', fontSize: 13, lineHeight: 1.5 }}>
              一客两单已开启：将保留原合同，并为该客户创建独立新订单。
            </div>
          ) : null}
          <div style={{ padding: '32px 16px' }}>
            <Button
              block
              color="primary"
              style={{ borderRadius: 24, fontSize: 16 }}
              onClick={() => {
                if (!partyA.name) {
                  Toast.show({ content: '请先选择甲方' });
                  return;
                }
                setStep(1);
              }}
            >
              下一步
            </Button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <PartyCard title="乙方（阿姨简历库）" party={partyB} onPick={() => setPickerB(true)} />
          {matchingLoading ? <div style={{ textAlign: 'center', padding: 16 }}><DotLoading color="primary" /></div> : matchingCandidates.length > 0 && <div style={{ padding: '0 16px', marginTop: 16 }}><div style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 10 }}>智能匹配候选</div><div style={{ display: 'flex', overflowX: 'auto', gap: 10, paddingBottom: 4 }}>{matchingCandidates.map((candidate) => <div key={candidate._id} onClick={() => setPartyB({ name: candidate.name, phone: candidate.phone || '', idCard: candidate.idNumber || '', address: candidate.currentAddress || '', id: candidate._id, gender: candidate.gender, age: candidate.age, nativePlace: candidate.nativePlace, expectedSalary: candidate.expectedSalary })} style={{ minWidth: 180, padding: 12, borderRadius: 12, background: partyB.id === candidate._id ? '#eaf7f4' : '#fff', border: partyB.id === candidate._id ? '1px solid #158F82' : '1px solid #edf0f2' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{candidate.name}</b><span style={{ color: '#158F82', fontSize: 12 }}>{candidate.matchScore} 分</span></div><div style={{ marginTop: 5, color: '#687384', fontSize: 12 }}>{displayChineseJobType(candidate.jobType)} · {candidate.experienceYears ?? 0} 年经验</div><div style={{ marginTop: 6, color: '#607087', fontSize: 11, lineHeight: 1.45 }}>{candidate.matchReasons.slice(0, 2).join('；')}</div></div>)}</div><div style={{ marginTop: 7, color: '#8993a4', fontSize: 11 }}>评分基于工种、预算、服务区域和经验，仍请确认档期与证件信息。</div></div>}
          <div style={{ padding: '32px 16px', display: 'flex', gap: 12 }}>
            <Button block fill="outline" style={{ borderRadius: 24, '--border-color': '#158F82', '--text-color': '#158F82', fontSize: 16 }} onClick={() => setStep(0)}>
              上一步
            </Button>
            <Button
              block
              color="primary"
              style={{ borderRadius: 24, fontSize: 16 }}
              onClick={() => {
                if (!validateParties()) return;
                setStep(2);
              }}
            >
              下一步
            </Button>
          </div>
        </>
      )}

      {step === 2 && (
        <div style={{ padding: '0 16px', marginTop: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 12, paddingLeft: 4 }}>选择合同模板</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tplLoading ? (
              <div style={{ textAlign: 'center', padding: 32, background: '#fff', borderRadius: 16 }}>
                <DotLoading color="primary" />
              </div>
            ) : templates.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 16, padding: 32 }}>
                <Empty description="暂无可用模板" />
              </div>
            ) : (
              templates.map((t) => {
                const isSelected = selectedTpl?.templateNo === t.templateNo;
                return (
                  <div
                    key={t.templateNo}
                    onClick={() => { if (!isChangeMode) chooseTemplate(t); }}
                    style={{
                      background: isSelected ? 'rgba(21, 143, 130, 0.04)' : '#fff',
                      borderRadius: 16,
                      padding: '20px 16px',
                      boxShadow: isSelected ? '0 4px 16px rgba(21, 143, 130, 0.12)' : '0 2px 12px rgba(0,0,0,0.04)',
                      border: isSelected ? '1.5px solid #158F82' : '1.5px solid transparent',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      opacity: isChangeMode && !isSelected ? 0.5 : 1,
                      cursor: isChangeMode ? 'not-allowed' : 'pointer',
                      // 仅动画合成/绘制属性，避免切换服务类型时触发布局重算。
                      transition: 'border-color 0.2s, box-shadow 0.2s, background-color 0.2s',
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: isSelected ? 600 : 500, color: isSelected ? '#158F82' : '#333' }}>
                      {t.templateName || t.templateNo}
                      {isChangeMode && isSelected && <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>（已锁定）</span>}
                    </div>
                    {isSelected && (
                      <div style={{ color: '#158F82', display: 'flex', alignItems: 'center' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div style={{ marginTop: 32, display: 'flex', gap: 12 }}>
            <Button block fill="outline" style={{ borderRadius: 24, '--border-color': '#158F82', '--text-color': '#158F82', fontSize: 16 }} onClick={() => setStep(1)}>
              上一步
            </Button>
            <Button
              block
              color="primary"
              style={{ borderRadius: 24, fontSize: 16 }}
              loading={fieldsLoading}
              onClick={() => {
                if (!selectedTpl) {
                  Toast.show({ content: '请选择模板' });
                  return;
                }
                setStep(3);
              }}
            >
              下一步
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <>
          <DatePicker
            visible={startVisible}
            onClose={() => setStartVisible(false)}
            precision="day"
            min={new Date(2020, 0, 1)}
            max={new Date(2035, 11, 31)}
            onConfirm={(d) => {
              setBase((b) => ({ ...b, startDate: d }));
              setStartVisible(false);
            }}
          />
          <DatePicker
            visible={endVisible}
            onClose={() => setEndVisible(false)}
            precision="day"
            min={new Date(2020, 0, 1)}
            max={new Date(2035, 11, 31)}
            onConfirm={(d) => {
              setBase((b) => ({ ...b, endDate: d }));
              setEndVisible(false);
            }}
          />
          {fieldsLoading ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <DotLoading color="primary" />
            </div>
          ) : (
            <div style={{ padding: '8px 12px' }}>
              <div
                style={{
                  fontSize: 13,
                  color: '#666',
                  padding: '8px 0',
                  fontWeight: 500,
                }}
              >
                填写合同内容（{selectedTpl?.templateName || ''}）
              </div>
              {(() => {
                if (fields.length === 0) return <Empty description="该模板无需填写额外字段" />;

                const groups = [
                  { title: '客户信息', key: 'customer', fields: [] as typeof fields },
                  { title: '阿姨信息', key: 'worker', fields: [] as typeof fields },
                  { title: '费用信息', key: 'fee', fields: [] as typeof fields },
                  { title: '服务信息', key: 'service', fields: [] as typeof fields },
                  { title: '其他信息', key: 'other', fields: [] as typeof fields },
                ];

                const hiddenKeys = ['阿姨工资', '人员薪资', '服务费', '服务期限', '合同开始时间', '合同结束时间', '服务开始时间', '服务结束时间', '合同起止时间', '阿姨工资大写', '服务费大写', '人员薪资大写'];

                fields.forEach((f) => {
                  if (hiddenKeys.includes(f.key)) return;
                  const k = f.label || f.key;
                  if (/(联系地址|阿姨|乙方|雇员|性别|年龄|籍贯|健康|体检|学历|证件)/.test(k)) {
                    groups[1].fields.push(f);
                  } else if (/(客户|甲方|雇主|服务地址)/.test(k)) {
                    groups[0].fields.push(f);
                  } else if (/(费|薪|工资|款|大写|金额|价)/.test(k)) {
                    groups[2].fields.push(f);
                  } else if (/(时间|期限|日期|起止|类型|模式|休息|保险|服务)/.test(k)) {
                    groups[3].fields.push(f);
                  } else {
                    groups[4].fields.push(f);
                  }
                });

                // 确保 fee 组里的动态字段按 [数字, 大写] 的顺序排列，方便左右对称
                groups[2].fields.sort((a, b) => {
                  const isAUpper = a.label.includes('大写') || a.key.includes('大写');
                  const isBUpper = b.label.includes('大写') || b.key.includes('大写');
                  if (isAUpper && !isBUpper) return 1;
                  if (!isAUpper && isBUpper) return -1;
                  return 0;
                });

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {groups.map((g) => {
                      if (g.fields.length === 0 && g.key !== 'service' && g.key !== 'fee') return null;
                      return (
                        <div
                          key={g.key}
                          style={{
                            background: '#fff',
                            borderRadius: 16,
                            padding: '16px 12px',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                          }}
                        >
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 600,
                              color: '#1a1a1a',
                              marginBottom: 16,
                              borderBottom: '1px solid rgba(0,0,0,0.04)',
                              paddingBottom: 12,
                            }}
                          >
                            {g.title}
                          </div>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '16px 12px',
                            }}
                          >
                            {g.key === 'service' && (
                              <>
                                <div onClick={() => setStartVisible(true)}>
                                  <div style={{ fontSize: 14, marginBottom: 6, color: '#333' }}>
                                    服务开始 <span style={{ color: '#ff3141' }}>*</span>
                                  </div>
                                  <div
                                    style={{
                                      background: '#f7f8fa',
                                      borderRadius: 6,
                                      padding: '8px 12px',
                                      fontSize: 14,
                                      color: base.startDate ? '#333' : '#ccc',
                                    }}
                                  >
                                    {toISODate(base.startDate) || '请选择日期'}
                                  </div>
                                </div>
                                <div onClick={() => { if (!isChangeMode) setEndVisible(true); }}>
                                  <div style={{ fontSize: 14, marginBottom: 6, color: '#333' }}>
                                    服务结束 <span style={{ color: '#ff3141' }}>*</span>
                                    {isChangeMode && <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>（已锁定）</span>}
                                  </div>
                                  <div
                                    style={{
                                      background: '#f7f8fa',
                                      borderRadius: 6,
                                      padding: '8px 12px',
                                      fontSize: 14,
                                      color: base.endDate ? '#333' : '#ccc',
                                      opacity: isChangeMode ? 0.6 : 1,
                                      cursor: isChangeMode ? 'not-allowed' : 'pointer',
                                    }}
                                  >
                                    {toISODate(base.endDate) || '请选择日期'}
                                  </div>
                                </div>
                              </>
                            )}
                            {g.key === 'fee' && (
                              <>
                                <div style={{ opacity: isChangeMode ? 0.6 : 1 }}>
                                  <div style={{ fontSize: 14, marginBottom: 6, color: '#333' }}>
                                    阿姨工资(元) <span style={{ color: '#ff3141' }}>*</span>
                                    {isChangeMode && <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>（已锁定）</span>}
                                  </div>
                                  <div style={{ background: '#f7f8fa', borderRadius: 6, padding: '4px 12px' }}>
                                    <Input
                                      type="number"
                                      placeholder="请输入"
                                      value={base.workerSalary}
                                      readOnly={isChangeMode}
                                      onChange={(v) => {
                                        if (isChangeMode) return;
                                        setBase((b) => ({ ...b, workerSalary: v }));
                                        if (v && !isNaN(Number(v))) {
                                          const upper = convertToChineseAmount(v, 'yuanzheng');
                                          setParam('人员薪资大写', upper);
                                          setParam('阿姨工资大写', upper);
                                        } else {
                                          setParam('人员薪资大写', '');
                                          setParam('阿姨工资大写', '');
                                        }
                                      }}
                                      style={{ '--font-size': '14px' }}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 14, marginBottom: 6, color: '#333' }}>
                                    阿姨工资大写 <span style={{ color: '#ff3141' }}>*</span>
                                  </div>
                                  <div style={{ background: '#f7f8fa', borderRadius: 6, padding: '8px 12px', fontSize: 14, color: (params['阿姨工资大写'] || params['人员薪资大写']) ? '#333' : '#ccc' }}>
                                    {((params['阿姨工资大写'] as string) || (params['人员薪资大写'] as string)) || '自动转换'}
                                  </div>
                                </div>
                                <div style={{ opacity: isChangeMode ? 0.6 : 1 }}>
                                  <div style={{ fontSize: 14, marginBottom: 6, color: '#333' }}>
                                    服务费(元) <span style={{ color: '#ff3141' }}>*</span>
                                    {isChangeMode && <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>（已锁定）</span>}
                                  </div>
                                  <div style={{ background: '#f7f8fa', borderRadius: 6, padding: '4px 12px' }}>
                                    <Input
                                      type="number"
                                      placeholder="请输入"
                                      value={base.customerServiceFee}
                                      readOnly={isChangeMode}
                                      onChange={(v) => {
                                        if (isChangeMode) return;
                                        setBase((b) => ({ ...b, customerServiceFee: v }));
                                        if (v && !isNaN(Number(v))) {
                                          setParam('服务费大写', convertToChineseAmount(v, 'none'));
                                        } else {
                                          setParam('服务费大写', '');
                                        }
                                      }}
                                      style={{ '--font-size': '14px' }}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 14, marginBottom: 6, color: '#333' }}>
                                    服务费大写 <span style={{ color: '#ff3141' }}>*</span>
                                  </div>
                                  <div style={{ background: '#f7f8fa', borderRadius: 6, padding: '8px 12px', fontSize: 14, color: params['服务费大写'] ? '#333' : '#ccc' }}>
                                    {(params['服务费大写'] as string) || '自动转换'}
                                  </div>
                                </div>
                              </>
                            )}
                            {g.fields.map((f) => {
                              const isWide = [
                                'radio',
                                'select',
                                'checkbox',
                                'multiselect',
                                'textarea',
                              ].includes(f.type);
                              const fieldLocked = isFieldLockedInChangeMode(f);
                              return (
                                <div key={f.key} style={{ gridColumn: isWide ? '1 / -1' : 'auto' }}>
                                  <div style={{ fontSize: 14, marginBottom: 6, color: '#333' }}>
                                    {f.label}
                                    {f.required ? (
                                      <span style={{ color: '#ff3141' }}> *</span>
                                    ) : null}
                                    {fieldLocked && <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>（已锁定）</span>}
                                  </div>
                                  <DynamicField
                                    field={f}
                                    value={params[f.key]}
                                    onChange={(v) => setParam(f.key, v)}
                                    disabled={fieldLocked}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
          <div style={{ padding: '32px 16px', display: 'flex', gap: 12 }}>
            <Button block fill="outline" style={{ borderRadius: 24, '--border-color': '#158F82', '--text-color': '#158F82', fontSize: 16 }} onClick={() => setStep(2)}>
              上一步
            </Button>
            <Button block color="primary" style={{ borderRadius: 24, fontSize: 16 }} loading={submitting} onClick={submit}>
              提交并发起签署
            </Button>
          </div>
        </>
      )}

      <PartyPicker
        visible={pickerA}
        title="选择甲方（客户）"
        onClose={() => setPickerA(false)}
        search={customerService.searchForESign}
        onSelect={(item: PartySearchResult) => {
          const newPartyA = {
            name: item.name,
            phone: item.phone,
            idCard: item.idCard || '',
            address: item.address,
            id: item.id,
          };
          setPartyA(newPartyA);
          if (fields.length > 0) {
            setParams((prev) => {
              const next = { ...prev };
              for (const f of fields) {
                const auto = autoFillValue(f, newPartyA, partyB);
                if (auto != null && auto !== '') next[f.key] = auto;
              }
              return next;
            });
          }
          setPickerA(false);
          Toast.show({ content: `已选甲方：${item.name}` });
        }}
      />
      <PartyPicker
        visible={pickerB}
        title="选择乙方（阿姨）"
        onClose={() => setPickerB(false)}
        search={contractService.searchWorkers}
        onSelect={(item: PartySearchResult) => {
          const newPartyB = {
            name: item.name,
            phone: item.phone,
            idCard: item.idCard || '',
            address: item.address,
            id: item.id,
            gender: item.gender,
            age: item.age,
            nativePlace: item.nativePlace,
            expectedSalary: item.expectedSalary,
          };
          setPartyB(newPartyB);
          if (fields.length > 0) {
            setParams((prev) => {
              const next = { ...prev };
              for (const f of fields) {
                const auto = autoFillValue(f, partyA, newPartyB);
                if (auto != null && auto !== '') next[f.key] = auto;
              }
              return next;
            });
          }
          setPickerB(false);
          Toast.show({ content: `已选乙方：${item.name}` });
        }}
      />
    </div>
  );
}

export default ContractForm;
