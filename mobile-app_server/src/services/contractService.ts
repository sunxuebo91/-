import { apiService } from './api';
import type {
  ApiResponse,
  Contract,
  ContractQuery,
  ContractListResult,
  CreateContractData,
  SignUrlItem,
  PaymentRecordItem,
  PaymentQrResult,
  PartySearchResult,
} from '../types';

export interface ContractStatistics {
  total: number;
  byStatus: Record<string, number>;
  expiringWithin30Days: number;
  active: number;
  completed: number;
  cancelled: number;
}

export interface WechatSigningShareResult {
  miniProgramPath: string;
  webpageUrl: string;
  shareTitle: string;
  shareDescription: string;
}

/**
 * 合同服务骨架（对齐 frontend contractService）。
 * 端点：/contracts（baseURL 已含 /api）。
 */
export const contractService = {
  /** 合同编号由后端统一原子生成，客户端不自行拼接编号。 */
  async reserveContractNumber(orderCategory: 'housekeeping' | 'training'): Promise<string> {
    const body = await apiService.post<ApiResponse<{ contractNumber: string }>>(
      '/contracts/reserve-number',
      { orderCategory },
    );
    const contractNumber = body.data?.contractNumber;
    if (!contractNumber) throw new Error(body.message || '生成合同编号失败');
    return contractNumber;
  },

  /** 合同列表（分页/筛选），返回 { contracts, total, page, limit, totalPages } */
  async getContracts(query: ContractQuery = {}): Promise<ContractListResult> {
    const body = await apiService.get<ApiResponse<ContractListResult>>('/contracts', query);
    return body.data;
  },

  /** 合同详情 */
  async getContractById(id: string): Promise<Contract> {
    const body = await apiService.get<ApiResponse<Contract>>(`/contracts/${id}`);
    return body.data;
  },

  /** 获取指定 CRM 客户的全部合同历史。 */
  async getContractsByCustomerId(customerId: string): Promise<Contract[]> {
    const body = await apiService.get<ApiResponse<Contract[]>>(`/contracts/customer/${customerId}`);
    return body.data || [];
  },

  /** 获取可分配合同的员工列表。 */
  async getAssignableUsers(): Promise<Array<{ _id: string; name?: string; username?: string; role?: string }>> {
    const body = await apiService.get<ApiResponse<Array<{ _id: string; name?: string; username?: string; role?: string }>>>('/contracts/assignable-users');
    return body.data || [];
  },

  /** 创建合同 */
  async createContract(data: CreateContractData): Promise<Contract> {
    const body = await apiService.post<ApiResponse<Contract>>('/contracts', data);
    return body.data;
  },

  /** 更新合同 */
  async updateContract(id: string, data: Partial<CreateContractData>): Promise<Contract> {
    const body = await apiService.put<ApiResponse<Contract>>(`/contracts/${id}`, data);
    return body.data;
  },

  async assignContract(id: string, assignedTo: string, reason?: string): Promise<Contract> {
    const body = await apiService.patch<ApiResponse<Contract>>(`/contracts/${id}/assign`, { assignedTo, reason: reason || undefined });
    return body.data;
  },

  async requestDeletion(id: string, reason?: string): Promise<{ success: boolean; message?: string }> {
    return apiService.post<{ success: boolean; message?: string }>(`/contracts/${id}/request-deletion`, { reason: reason || undefined });
  },

  /** 管理员直接删除合同；后端仍会校验 contract:delete 权限和管理员角色。 */
  async deleteContract(id: string): Promise<{ success: boolean; message?: string }> {
    return apiService.delete<{ success: boolean; message?: string }>(`/contracts/${id}`);
  },

  /**
   * 搜索服务人员（阿姨简历库），归一化为乙方选择项。
   * 后端：GET /resumes/search-workers?phone=&name=&limit= → { success, data:[{_id,name,phone,idNumber,currentAddress}] }
   */
  async searchWorkers(keyword: string, limit = 10): Promise<PartySearchResult[]> {
    const body = await apiService.get<{ success?: boolean; data?: any[] }>(
      '/resumes/search-workers',
      { phone: keyword, name: keyword, limit },
    );
    const list = body?.data || [];
    // gender 存储为 male/female，转中文供模板使用
    const toCnGender = (g: unknown, sex?: unknown): string => {
      const val = g || sex;
      return val === 'male' || val === '男' ? '男' : val === 'female' || val === '女' ? '女' : '';
    };
    return list.map((w: any) => ({
      id: w._id,
      name: w.name,
      phone: w.phone,
      idCard: w.idNumber,
      type: 'worker' as const,
      source: '阿姨简历库',
      address: w.currentAddress || w.hukouAddress,
      createdAt: w.createdAt,
      gender: toCnGender(w.gender, w.sex),
      age: w.age,
      nativePlace: w.nativePlace,
      expectedSalary: w.expectedSalary,
    }));
  },

  /** 按阿姨信息匹配合同，投保时用于带入客户服务地址。 */
  async searchByWorkerInfo(params: { name?: string; idCard?: string; phone?: string }): Promise<Contract[]> {
    const body = await apiService.get<ApiResponse<Contract[]>>('/contracts/search-by-worker', params);
    return body.data || [];
  },

  /** 合同统计 */
  async getStatistics(): Promise<ContractStatistics> {
    const body = await apiService.get<ApiResponse<ContractStatistics>>(
      '/contracts/statistics',
    );
    return body.data;
  },

  // ── 电子签（签署合同） ──────────────────────────
  /**
   * 获取/刷新合同签署链接（实时向爱签取最新短链）。
   * 后端：POST /contracts/:id/resend-sign-urls → { success, data:{ signUrls, contractNo }, message }
   */
  async getSignUrls(
    id: string,
  ): Promise<{ success: boolean; signUrls: SignUrlItem[]; message?: string }> {
    const body = await apiService.post<
      ApiResponse<{ signUrls: SignUrlItem[]; contractNo: string }>
    >(`/contracts/${id}/resend-sign-urls`);
    return {
      success: !!body.success,
      signUrls: body.data?.signUrls || [],
      message: body.message,
    };
  },

  /**
   * 同步爱签状态（向爱签查询最新签署状态并回写本地合同）。
   * 后端：POST /contracts/:id/sync-esign-status → { success, data:{ esignStatus, contractStatus }, message }
   */
  async syncEsignStatus(
    id: string,
  ): Promise<{ success: boolean; esignStatus?: string; contractStatus?: string; message?: string }> {
    const body = await apiService.post<
      ApiResponse<{ esignStatus?: string; contractStatus?: string }>
    >(`/contracts/${id}/sync-esign-status`);
    return {
      success: !!body.success,
      esignStatus: body.data?.esignStatus,
      contractStatus: body.data?.contractStatus,
      message: body.message,
    };
  },

  /** 创建 Android 微信小程序签约卡片所需的分享参数。 */
  async createWechatSigningShare(id: string): Promise<WechatSigningShareResult> {
    const body = await apiService.post<ApiResponse<WechatSigningShareResult>>(
      `/contracts/${id}/wechat-signing-share`,
    );
    if (!body.success || !body.data?.miniProgramPath) {
      throw new Error(body.message || '生成微信签约入口失败');
    }
    return body.data;
  },

  async downloadContract(contractId: string, options: { force?: number; downloadFileType?: number; } = {}): Promise<any> {
    const body = await apiService.post<ApiResponse<any>>(`/contracts/${contractId}/download-contract`, options);
    return body;
  },

  async previewContract(contractNo: string, signers?: any[]): Promise<any> {
    const body = await apiService.post<ApiResponse<any>>(`/esign/preview-contract/${contractNo}`, { signers });
    return body.data || body;
  },

  async withdrawContract(contractNo: string, withdrawReason?: string, isNoticeSignUser?: boolean): Promise<any> {
    const body = await apiService.post<ApiResponse<any>>(`/esign/withdraw-contract/${contractNo}`, { withdrawReason, isNoticeSignUser });
    return body.data || body;
  },

  async invalidateContract(contractNo: string, validityTime: number = 15): Promise<any> {
    const body = await apiService.post<ApiResponse<any>>(`/esign/invalidate-contract/${contractNo}`, { validityTime });
    return body.data || body;
  },

  /**
   * 发起/重新发起爱签电子签。
   * 后端 :id/reinitiate-esign 顶层返回 { success, message, data }，成功时 data 为
   * { esignContractNo, contractStatus }。此处保留 success/message，避免解包后丢失成功标记。
   */
  async reinitiateEsign(
    contractId: string,
  ): Promise<{ success: boolean; message?: string; data?: any }> {
    const body = await apiService.post<ApiResponse<any>>(`/contracts/${contractId}/reinitiate-esign`, {});
    return {
      success: !!body.success,
      message: body.message,
      data: body.data,
    };
  },

  async syncInsurance(contractId: string): Promise<any> {
    const body = await apiService.post<ApiResponse<any>>(`/contracts/${contractId}/sync-insurance`, {});
    return body.data || body;
  },

  // ── 收款（收钱） ────────────────────────────────
  /**
   * 生成聚合收款码（支付宝扫码）。
   * 后端：POST /contracts/:id/payment-qr  body:{ sequenceNo? } → PaymentQrResult
   */
  async generatePaymentQr(id: string, sequenceNo?: number): Promise<PaymentQrResult> {
    return apiService.post<PaymentQrResult>(`/contracts/${id}/payment-qr`, { sequenceNo });
  },

  /**
   * 查询合同的所有支付流水。
   * 后端：GET /contracts/:id/payment-records → { success, data:[PaymentRecord] }
   */
  async getPaymentRecords(id: string): Promise<PaymentRecordItem[]> {
    const body = await apiService.get<ApiResponse<PaymentRecordItem[]>>(
      `/contracts/${id}/payment-records`,
    );
    return body.data || [];
  },

  /**
   * 创建换人合同（仅家政客户合同；职培订单不支持，后端会拒绝）。
   * 后端：POST /contracts/change-worker/:originalContractId → { success, data: 新合同, message }
   * 原合同自动标记为「已换人」，服务历史保持连续。
   */
  async createChangeWorkerContract(originalContractId: string, data: CreateContractData): Promise<Contract> {
    const body = await apiService.post<ApiResponse<Contract>>(`/contracts/change-worker/${originalContractId}`, data);
    if ((body as any)?.success === false) throw new Error((body as any).message || '换人合同创建失败');
    return body.data;
  },
};

export default contractService;
