// 合同类型（移动端精简版，对齐 frontend contract.types.ts 核心字段）

export type PaymentItemType = 'deposit' | 'service_fee' | 'salary' | 'remaining' | 'balance' | 'final' | 'custom';

export interface PaymentItem {
  sequenceNo: number;
  type: PaymentItemType;
  label: string;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
}

export interface PaymentConfigItem {
  label: string;
  amount: number;
  type?: PaymentItemType;
}

export interface Contract {
  _id: string;
  contractNumber?: string;
  contractType?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  workerName?: string;
  workerPhone?: string;
  workerIdCard?: string;
  workerAddress?: string;
  workerSalary?: number;
  workerServiceFee?: number;
  customerServiceFee?: number;
  deposit?: number;
  finalPayment?: number;
  expectedDeliveryDate?: string;
  salaryPaymentDay?: number;
  monthlyWorkDays?: number;
  remarks?: string;
  customerId?: string | { _id: string; name?: string; phone?: string };
  workerId?: string | { _id: string; name?: string; phone?: string };
  createdBy?: string | { _id: string; name?: string; username?: string };
  createdAt?: string;
  updatedAt?: string;
  contractStatus?:
    | 'draft'
    | 'signing'
    | 'signed'
    | 'active'
    | 'replaced'
    | 'cancelled'
    | 'graduated'
    | 'refunded';
  esignStatus?: string;
  esignContractNo?: string;
  paymentEnabled?: boolean;
  paymentVersion?: string;
  paymentStatus?: string;
  paymentType?: 'service_fee_only' | 'service_fee_and_salary' | 'deposit' | 'installment';
  paymentMode?: 'one_time' | 'installment';
  paymentConfigAmount?: number;
  paymentTotalAmount?: number;
  paymentReceivedAmount?: number;
  payments?: PaymentItem[];
  paymentItems?: PaymentConfigItem[];
  customerIdCard?: string;
  refundAmount?: number;
  salesSource?: string;
  startDate?: string;
  endDate?: string;
  referralCode?: string;
  salespersonName?: string;
  orderKind?: 'new' | 'aftersale';
  orderCategory?: 'housekeeping' | 'training';
  hasBackgroundCheck?: boolean;
  insuranceStatus?: 'sufficient' | 'insufficient' | 'expired' | 'none';
  templateParams?: Record<string, any>;
  [key: string]: any;
}

/** 签署方（爱签 signUrls 归一化后单项） */
export interface SignUrlItem {
  name?: string;
  mobile?: string;
  role?: string;
  signUrl?: string;
  account?: string;
  signOrder?: number;
  /** 1=待签署 2=已签署 */
  status?: number;
  statusText?: string;
}

/** 收款流水记录（对齐后端 payment_records） */
export interface PaymentRecordItem {
  _id?: string;
  amount?: number; // 分
  status?: 'pending' | 'paid' | 'refunded' | 'failed' | string;
  label?: string;
  sequenceNo?: number;
  channel?: string;
  clientSn?: string;
  paidAt?: string;
  createdAt?: string;
}

/** 生成收款码返回 */
export interface PaymentQrResult {
  qrImage: string; // base64 dataURL
  amount: number; // 分
  sequenceNo: number;
  label: string;
  clientSn: string;
  paymentRecordId?: string;
  expiresAt: number; // 毫秒时间戳
  paymentVersion: 1 | 2;
}

export type CreateContractData = Partial<Contract> & {
  customerName: string;
  customerPhone?: string;
  customerIdCard?: string;
  customerAddress?: string;
  workerName?: string;
  workerPhone?: string;
  workerIdCard?: string;
  workerAddress?: string;
  customerId?: string;
  workerId?: string;
  /** 一客两单：跳过换人检测，创建同客户下的独立新订单。 */
  forceCreateNew?: boolean;
  /** 爱签模板编号（提交后端触发自动发起爱签） */
  templateNo?: string;
  /** 爱签模板参数（中文字段名 → 值） */
  templateParams?: Record<string, unknown>;
};

export interface ContractQuery {
  page?: number;
  limit?: number;
  search?: string;
  contractType?: string;
  status?: string;
  createdBy?: string;
  startDate?: string;
  endDate?: string;
  orderCategory?: 'housekeeping' | 'training';
  [key: string]: unknown;
}

export interface ContractListResult {
  contracts: Contract[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
