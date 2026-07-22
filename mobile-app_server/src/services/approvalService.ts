import { apiService } from './api';
import type {
  ApiResponse,
  ApprovalInstance,
  ApprovalListResponse,
  ContractDeletionApproval,
} from '../types';

/**
 * 审批服务骨架（对齐 frontend approvalService）。
 * - 通用审批流：/approvals
 * - 合同删除审批：/contract-approvals
 * baseURL 已含 /api，故路径不带 /api 前缀。
 */
export const approvalService = {
  // ── 通用审批流 ──────────────────────────────
  /** 待我审批 */
  async getPendingForMe(page = 1, limit = 20): Promise<ApprovalListResponse> {
    const body = await apiService.get<ApiResponse<ApprovalListResponse>>('/approvals/pending', {
      page,
      limit,
    });
    return (body?.data ?? body) as ApprovalListResponse;
  },

  /** 我发起的 */
  async getMyApplied(page = 1, limit = 20): Promise<ApprovalListResponse> {
    const body = await apiService.get<ApiResponse<ApprovalListResponse>>('/approvals/my-applied', {
      page,
      limit,
    });
    return (body?.data ?? body) as ApprovalListResponse;
  },

  /** 全部（管理员） */
  async getAllApprovals(page = 1, limit = 20, status?: string): Promise<ApprovalListResponse> {
    const params: Record<string, unknown> = { page, limit };
    if (status) params.status = status;
    const body = await apiService.get<ApiResponse<ApprovalListResponse>>('/approvals', params);
    return (body?.data ?? body) as ApprovalListResponse;
  },

  /** 审批详情 */
  async getApprovalDetail(id: string): Promise<ApprovalInstance> {
    const body = await apiService.get<ApiResponse<ApprovalInstance>>(`/approvals/${id}`);
    return (body?.data ?? body) as ApprovalInstance;
  },

  /** 通过 */
  async approveApproval(id: string, comment?: string): Promise<ApprovalInstance> {
    const body = await apiService.post<ApiResponse<ApprovalInstance>>(`/approvals/${id}/approve`, {
      comment,
    });
    return (body?.data ?? body) as ApprovalInstance;
  },

  /** 拒绝 */
  async rejectApproval(id: string, comment?: string): Promise<ApprovalInstance> {
    const body = await apiService.post<ApiResponse<ApprovalInstance>>(`/approvals/${id}/reject`, {
      comment,
    });
    return (body?.data ?? body) as ApprovalInstance;
  },

  /** 申请人撤销 pending 审批 */
  async cancelApproval(id: string): Promise<ApprovalInstance> {
    const body = await apiService.post<ApiResponse<ApprovalInstance>>(`/approvals/${id}/cancel`, {});
    return (body?.data ?? body) as ApprovalInstance;
  },

  /** 管理员强制处理当前节点 */
  async adminSkipApproval(
    id: string,
    action: 'approve' | 'reject',
    comment?: string,
  ): Promise<ApprovalInstance> {
    const body = await apiService.post<ApiResponse<ApprovalInstance>>(`/approvals/${id}/admin-skip`, {
      action,
      comment,
    });
    return (body?.data ?? body) as ApprovalInstance;
  },

  /** 申请退款 */
  async applyRefund(contractId: string, amount: number, reason?: string): Promise<ApprovalInstance> {
    const body = await apiService.post<ApiResponse<ApprovalInstance>>('/approvals/contract-refund', {
      contractId,
      amount,
      reason,
    });
    return (body?.data ?? body) as ApprovalInstance;
  },

  /** 申请阿姨工资发放 */
  async applySalary(payload: {
    contractId: string;
    salaryAmount: number;
    bankCardNumber?: string;
    bankName?: string;
    remark?: string;
  }): Promise<ApprovalInstance> {
    const body = await apiService.post<ApiResponse<ApprovalInstance>>(
      '/approvals/salary-distribution',
      payload,
    );
    return (body?.data ?? body) as ApprovalInstance;
  },

  // ── 合同删除审批 ────────────────────────────
  /** 合同删除审批列表 */
  async getContractDeletionApprovals(
    status?: string,
    page = 1,
    limit = 10,
  ): Promise<{ approvals: ContractDeletionApproval[]; total: number; page: number; limit: number }> {
    const params: Record<string, unknown> = { page, limit };
    if (status) params.status = status;
    const body = await apiService.get<ApiResponse<{
      approvals: ContractDeletionApproval[];
      total: number;
      page: number;
      limit: number;
    }>>('/contract-approvals', params);
    return (body?.data ?? body) as {
      approvals: ContractDeletionApproval[];
      total: number;
      page: number;
      limit: number;
    };
  },

  /** 合同删除审批通过 */
  async approveContractDeletion(id: string, comment?: string): Promise<ApiResponse> {
    return apiService.post<ApiResponse>(`/contract-approvals/${id}/approve`, { comment });
  },

  /** 合同删除审批拒绝 */
  async rejectContractDeletion(id: string, comment: string): Promise<ApiResponse> {
    return apiService.post<ApiResponse>(`/contract-approvals/${id}/reject`, { comment });
  },
};

export default approvalService;
