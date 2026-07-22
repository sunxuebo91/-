// 审批类型（移动端精简版，对齐 frontend approval.types.ts / approvalService.ts）

export interface ApprovalInstanceNode {
  order: number;
  name: string;
  approverUserId: string;
  approverName?: string;
  status: 'pending' | 'approved' | 'rejected';
  comment?: string;
  operatedAt?: string;
}

export interface ApprovalInstance {
  _id: string;
  templateId: string;
  templateName?: string;
  businessType: string;
  businessId: string;
  title: string;
  applicantId: string;
  applicantName?: string;
  formData?: {
    contractId?: string;
    contractNumber?: string;
    customerName?: string;
    amount?: number;
    reason?: string;
    contractTotalAmount?: number;
    alreadyRefunded?: number;
    orderCategory?: string;
    salaryAmount?: number;
    workerName?: string;
    workerPhone?: string;
    resumeId?: string;
    bankCardNumber?: string;
    bankName?: string;
    serviceFeeCharged?: boolean;
    serviceFeeAmount?: number;
    serviceFeeOwnerId?: string;
    remark?: string;
    [key: string]: unknown;
  };
  nodes: ApprovalInstanceNode[];
  currentNodeIndex: number;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'executed_failed' | 'cancelled';
  executedAt?: string;
  executionResult?: {
    contractStatus?: string;
    refundAmount?: number;
    salaryAmount?: number;
    serviceFeeCharged?: boolean;
    serviceFeeAmount?: number;
    financeRecorded?: boolean;
    error?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface ApprovalListResponse {
  items: ApprovalInstance[];
  total: number;
  page: number;
  limit: number;
}

/** 合同删除审批（原有流程） */
export interface ContractDeletionContract {
  _id?: string;
  contractNumber?: string;
  customerName?: string;
  workerName?: string;
}

export interface ContractDeletionUser {
  _id?: string;
  username?: string;
  name?: string;
}

export interface ContractDeletionApproval {
  _id: string;
  contractId?: ContractDeletionContract;
  contractNumber: string;
  requestedBy?: ContractDeletionUser;
  requestedByName: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: ContractDeletionUser;
  approvedByName?: string;
  approvalComment?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}
