// 爱签相关类型（移动端，对齐 frontend esignService 类型）

/** 合同模板（列表项） */
export interface ContractTemplate {
  templateNo: string;
  templateName: string;
  description?: string;
  [key: string]: unknown;
}

/** 模板控件字段（爱签 template/data 返回项） */
export interface TemplateField {
  dataKey: string;
  dataType: number;
  required: number;
  fillType?: number;
  page?: number;
  options?: Array<{
    label: string;
    value?: string;
    selected?: boolean;
    index?: number | string;
  }>;
  [key: string]: unknown;
}

/** 归一化后的模板字段（供表单渲染） */
export interface NormalizedField {
  key: string;
  label: string;
  /** text/textarea/date/idcard/radio/checkbox/select/multiselect */
  type: string;
  required: boolean;
  options: Array<{ label: string; value: string }>;
  originalDataType: number;
}

/** 搜索结果（甲方客户 / 乙方阿姨） */
export interface PartySearchResult {
  id: string;
  name: string;
  phone: string;
  idCard?: string;
  type: 'customer' | 'worker';
  source: string;
  address?: string;
  createdAt?: string;
  // 乙方（阿姨）附加信息，用于模板自动预填
  gender?: string;
  age?: number | string;
  nativePlace?: string;
  expectedSalary?: number | string;
}
