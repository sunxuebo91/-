import { apiService } from './api';
import type { ContractTemplate, TemplateField, NormalizedField } from '../types';

type ESignResult = { code?: number; msg?: string; message?: string; data?: Record<string, any> };
type StudentSigner = { account: string; name: string; mobile: string; signType?: 'auto' | 'manual'; validateType?: 'sms' | 'password' | 'face' };
const unwrapESign = (body: unknown): ESignResult => {
  const value = body as { data?: ESignResult } & ESignResult;
  return value?.data?.code != null ? value.data : value;
};

/**
 * 爱签服务（移动端，对齐 frontend esignService 关键能力）。
 * 端点：/esign（baseURL 已含 /api）。
 * - getTemplates：拉取合同模板列表
 * - getTemplateData：拉取模板控件字段（爱签真实字段）
 */

// 爱签 dataType → 表单控件类型（对齐 CRM getFieldType）
const fieldTypeFromDataType = (dataType: number): string => {
  switch (dataType) {
    case 1: return 'text';        // 单行文本
    case 2: return 'radio';       // 单选
    case 3: return 'checkbox';    // 勾选
    case 4: return 'idcard';      // 身份证
    case 5: return 'date';        // 日期
    case 8: return 'textarea';    // 多行文本
    case 9: return 'multiselect'; // 多选
    case 16: return 'select';     // 下拉
    default: return 'text';
  }
};

// 签署区相关字段（不渲染为表单项）：6=签署区 7=签署时间 13=骑缝章 15=备注签署区
const isSignatureField = (dataType: number): boolean =>
  dataType === 6 || dataType === 7 || dataType === 13 || dataType === 15;

export const esignService = {
  /** 获取模板列表：GET /esign/templates → ContractTemplate[]（后端直接返回数组） */
  async getTemplates(): Promise<ContractTemplate[]> {
    const body = await apiService.get<unknown>('/esign/templates');
    // 兼容 { data:[...] } 与直接数组两种返回
    const list = Array.isArray(body) ? body : ((body as any)?.data ?? []);
    return list as ContractTemplate[];
  },

  /**
   * 获取模板控件字段：POST /esign/template/data { templateIdent }
   * 后端外层包一层：{ success, data:{ code:100000, data:TemplateField[], msg } }
   * 经 apiService 解包一次后拿到外层 body，爱签实际结果在 body.data。
   * 已过滤签署区字段、去重，并归一化为表单可用结构。
   */
  async getTemplateFields(templateNo: string): Promise<NormalizedField[]> {
    const body = await apiService.post<{
      success?: boolean;
      data?: { code?: number; data?: TemplateField[]; msg?: string };
    }>('/esign/template/data', { templateIdent: templateNo });
    const esign = body?.data;
    if (esign?.code !== 100000 || !Array.isArray(esign.data)) {
      throw new Error(esign?.msg || '获取模板控件信息失败');
    }
    const seen = new Set<string>();
    const fields: NormalizedField[] = [];
    for (const f of esign.data) {
      if (isSignatureField(f.dataType)) continue;
      const key = String(f.dataKey || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      fields.push({
        key,
        label: key,
        type: fieldTypeFromDataType(f.dataType),
        required: f.required === 1,
        // 爱签选项仅返回 label（无 value），对齐 CRM：以 label 作为 value，
        // 保证每个选项 value/key 唯一，避免移动端按钮点击因 key 重复而失效。
        options: (f.options || []).map((o) => ({
          label: o.label,
          value: o.value ?? o.label,
        })),
        originalDataType: f.dataType,
      });
    }
    return fields;
  },

  /** 职培签约：注册学员为爱签个人用户。重复注册也由调用方按爱签状态码视为成功。 */
  async addStudentUser(data: { name: string; mobile: string; idCard: string }): Promise<ESignResult> {
    return unwrapESign(await apiService.post('/esign/add-stranger', {
      account: data.mobile,
      userType: 2,
      name: data.name,
      mobile: data.mobile,
      idCard: data.idCard,
      isNotice: 0,
      isSignPwdNotice: 0,
    }));
  },

  /** 职培签约：使用爱签模板生成待签合同。 */
  async createTrainingContract(data: { contractNo: string; contractName: string; templateNo: string; templateParams: Record<string, unknown> }): Promise<ESignResult> {
    return unwrapESign(await apiService.post('/esign/create-contract', {
      ...data,
      validityTime: 365,
      signOrder: 1,
      readSeconds: 5,
      needAgree: 0,
      autoExpand: 1,
      refuseOn: 0,
      autoContinue: 0,
      viewFlg: 0,
      enableDownloadButton: 1,
    }));
  },

  /** 职培签约：企业自动签章、学员短信签署，并取得签署链接。 */
  async addTrainingSigners(contractNo: string, student: StudentSigner): Promise<ESignResult> {
    return unwrapESign(await apiService.post('/esign/add-signers-simple', {
      contractNo,
      signOrder: 'parallel',
      signers: [
        { account: 'ASIGN91110111MACJMD2R5J', name: '北京安得家政有限公司', mobile: '400-000-0000', signType: 'auto', validateType: 'sms' },
        student,
      ],
    }));
  },

  /** 签署方重复添加时，回查 CRM 已保存的爱签签署链接。 */
  async getTrainingContractStatus(contractNo: string): Promise<ESignResult> {
    return unwrapESign(await apiService.get('/esign/contract-status/' + encodeURIComponent(contractNo), {
      orderCategory: 'training',
    }));
  },

  // ── 家政合同：先发起爱签、成功后再落库（对齐 CRM 三步流程） ──────────────
  /**
   * 家政签约步骤1：批量注册甲乙双方为爱签用户。
   * 后端：POST /esign/add-users-batch → { success, data:{ partyA:{ success }, partyB:{ success } } }。
   * 爱签 code 100000（新增）/100021（已存在）均由后端归一为 success。
   */
  async addUsersBatch(data: {
    partyAName: string; partyAMobile: string; partyAIdCard: string;
    partyBName: string; partyBMobile: string; partyBIdCard: string;
    workerId?: string;
  }): Promise<{ partyASuccess: boolean; partyBSuccess: boolean; message?: string }> {
    const body = await apiService.post<{
      success?: boolean;
      message?: string;
      data?: { partyA?: { success?: boolean }; partyB?: { success?: boolean } };
    }>('/esign/add-users-batch', { ...data, isNotice: false, isSignPwdNotice: false });
    return {
      partyASuccess: !!body?.data?.partyA?.success,
      partyBSuccess: !!body?.data?.partyB?.success,
      message: body?.message,
    };
  },

  /**
   * 家政签约步骤2：用模板创建爱签合同（不加签署人，仅生成待签文件）。
   * 后端：POST /esign/create-contract → 爱签原样 { code, msg, data }。成功 code===100000。
   */
  async createHousekeepingContract(data: {
    contractNo: string; contractName: string; templateNo: string; templateParams: Record<string, unknown>;
  }): Promise<ESignResult> {
    return unwrapESign(await apiService.post('/esign/create-contract', {
      ...data,
      validityTime: 365,
      signOrder: 1,
      readSeconds: 5,
      needAgree: 0,
      autoExpand: 1,
      refuseOn: 0,
      autoContinue: 0,
      viewFlg: 0,
      enableDownloadButton: 1,
    }));
  },

  /**
   * 家政签约步骤3：添加甲（客户）、乙（阿姨）、丙（企业自动签章）三方签署人并触发签署。
   * 后端：POST /esign/add-signers-simple → 爱签原样 { code, msg, data }。成功 code===100000 或 100074（重复添加）。
   */
  async addHousekeepingSigners(
    contractNo: string,
    partyA: { name: string; mobile: string },
    partyB: { name: string; mobile: string },
  ): Promise<ESignResult> {
    return unwrapESign(await apiService.post('/esign/add-signers-simple', {
      contractNo,
      signOrder: 'parallel',
      signers: [
        { account: partyA.mobile, name: partyA.name, mobile: partyA.mobile, signType: 'manual', validateType: 'sms' },
        { account: partyB.mobile, name: partyB.name, mobile: partyB.mobile, signType: 'manual', validateType: 'sms' },
        { account: 'ASIGN91110111MACJMD2R5J', name: '北京安得家政有限公司', mobile: '400-000-0000', signType: 'auto', validateType: 'sms' },
      ],
    }));
  },
};

// 数字转中文大写金额（对齐 CRM convertToChineseAmount）
// suffix: 'none' 无后缀；'yuanzheng' 追加"圆整"
export const convertToChineseAmount = (
  amount: string | number,
  suffix: 'none' | 'yuanzheng' = 'none',
): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '零';
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟'];
  const bigUnits = ['', '万', '亿'];
  if (num === 0) return suffix === 'yuanzheng' ? '零圆整' : '零';
  const integerPart = Math.floor(num);
  let result = '';
  if (integerPart === 0) {
    result = '零';
  } else {
    const intStr = integerPart.toString();
    const len = intStr.length;
    for (let i = 0; i < len; i++) {
      const digit = parseInt(intStr[i]);
      const pos = len - i - 1;
      const unitIndex = pos % 4;
      const bigUnitIndex = Math.floor(pos / 4);
      if (digit !== 0) {
        result += digits[digit] + units[unitIndex];
        if (unitIndex === 0 && bigUnitIndex > 0) result += bigUnits[bigUnitIndex];
      } else if (result && !result.endsWith('零')) {
        result += '零';
      }
    }
    result = result.replace(/零+/g, '零').replace(/零$/, '');
  }
  if (suffix === 'yuanzheng') result += '圆整';
  return result;
};

export default esignService;
