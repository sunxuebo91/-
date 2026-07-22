import { api, apiService } from './api';
import type {
  ApiResponse,
  AvailabilityQuery,
  AvailabilityMutationResult,
  BackgroundCheckStatus,
  BatchUpdateAvailabilityRequest,
  BlacklistCheckResult,
  BlacklistRecord,
  CreateBlacklistRequest,
  DeleteResumeFileRequest,
  DeleteResumeFileResult,
  DuplicateCheckRequest,
  DuplicateCheckResult,
  MedicalReportAnalysis,
  ReleaseForContractResult,
  Resume,
  ResumeAvailability,
  ResumeContractsResponse,
  ResumeCreator,
  ResumeEnums,
  ResumeFilterOptions,
  ResumeOperationLog,
  UpdateAvailabilityRequest,
} from '../types';

/**
 * 简历服务骨架（对齐 frontend resume.service.ts）。
 * 端点：/resumes（baseURL 已含 /api）。文件上传用 FormData（create/update）。
 */
export const resumeService = {
  async getPage(params: Record<string, any> = {}): Promise<{ items: Resume[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const body = await apiService.get<ApiResponse<{ items: Resume[]; total: number; page: number; pageSize: number; totalPages: number }>>('/resumes', params);
    return body.data;
  },

  /** 简历详情 */
  async getById(id: string): Promise<Resume> {
    const body = await apiService.get<ApiResponse<Resume>>(`/resumes/${id}`);
    return body.data;
  },

  /** 创建简历（FormData，含文件） */
  async create(formData: FormData): Promise<Resume> {
    const body = await apiService.upload<ApiResponse<Resume>>('/resumes', formData, 'POST');
    return body.data;
  },

  /** 更新简历（FormData，PATCH） */
  async update(id: string, formData: FormData): Promise<Resume> {
    const body = await apiService.upload<ApiResponse<Resume>>(
      `/resumes/${id}`,
      formData,
      'PATCH',
    );
    return body.data;
  },

  /** 删除简历 */
  async delete(id: string): Promise<ApiResponse> {
    return apiService.delete<ApiResponse>(`/resumes/${id}`);
  },

  /** 重复校验 */
  async checkDuplicate(phone: string, idNumber?: string): Promise<ApiResponse> {
    const params: Record<string, unknown> = { phone };
    if (idNumber) params.idNumber = idNumber;
    return apiService.get<ApiResponse>('/resumes/check-duplicate', params);
  },

  /** 简历跟进记录列表 */
  async getFollowUps(resumeId: string): Promise<Record<string, unknown>[]> {
    const body = await apiService.get<unknown>(`/follow-ups/resume/${resumeId}`, { page: 1, pageSize: 50 });
    const d = (body as any)?.data ?? body;
    const list = Array.isArray(d) ? d : (d?.items ?? d?.list ?? []);
    return list as Record<string, unknown>[];
  },

  /** 创建简历跟进记录 */

  /** 获取可分配的员工列表 */
  async getAssignableUsers(): Promise<Record<string, unknown>[]> {
    const body = await apiService.get<ApiResponse<Record<string, unknown>[]>>('/resumes/assignable-users');
    return body.data || [];
  },

  /** 分配简历 */
  async assign(id: string, assignedTo: string): Promise<void> {
    await apiService.patch(`/resumes/${id}/assign`, { assignedTo });
  },
  async createFollowUp(data: { resumeId: string; type: string; content: string }): Promise<void> {
    await apiService.post('/follow-ups', data);
  },

  /** 释放简历用于签约（创建人或管理员，单向开启；可选是否收取服务费） */
  async releaseForContract(
    id: string,
    payload: { serviceFeeCharged: boolean; serviceFeeAmount?: number },
  ): Promise<ApiResponse<ReleaseForContractResult>> {
    return apiService.patch<ApiResponse<ReleaseForContractResult>>(
      `/resumes/${id}/release`,
      payload,
    );
  },

  /** 简历筛选项（籍贯、民族） */
  async getFilterOptions(): Promise<ResumeFilterOptions> {
    const body = await apiService.get<ApiResponse<ResumeFilterOptions>>('/resumes/options');
    return body.data;
  },

  /** 简历创建人候选列表 */
  async getCreators(): Promise<ResumeCreator[]> {
    const body = await apiService.get<ApiResponse<ResumeCreator[]>>('/resumes/creators');
    return body.data || [];
  },

  /** 简历表单枚举字典 */
  async getEnums(): Promise<ResumeEnums> {
    const body = await apiService.get<ApiResponse<ResumeEnums>>('/resumes/enums');
    return body.data;
  },

  /** 切换推荐简历的隐藏状态 */
  async toggleHidden(resumeId: string): Promise<{ isHidden: boolean }> {
    const body = await apiService.patch<ApiResponse<{ isHidden: boolean }>>(
      `/resumes/${resumeId}/toggle-hidden`,
      {},
    );
    return body.data;
  },

  /** 获取阿姨关联的家政合同记录 */
  async getResumeContracts(resumeId: string): Promise<ResumeContractsResponse> {
    return apiService.get<ResumeContractsResponse>(`/resumes/${resumeId}/contracts`);
  },

  /** 获取简历操作审计日志（管理员） */
  async getOperationLogs(resumeId: string): Promise<ResumeOperationLog[]> {
    const body = await apiService.get<ApiResponse<ResumeOperationLog[]>>(
      `/resumes/${resumeId}/operation-logs`,
    );
    return body.data || [];
  },

  /** 获取简历释放签约相关日志 */
  async getReleaseLogs(resumeId: string): Promise<ResumeOperationLog[]> {
    const body = await apiService.get<ApiResponse<ResumeOperationLog[]>>(
      `/resumes/${resumeId}/release-logs`,
    );
    return body.data || [];
  },

  /** 调用 AI 解读并保存简历体检报告 */
  async analyzeMedicalReport(resumeId: string): Promise<MedicalReportAnalysis> {
    const body = await apiService.post<ApiResponse<MedicalReportAnalysis>>(
      `/resumes/${resumeId}/analyze-medical-report`,
    );
    return body.data;
  },

  /** 获取简历档期 */
  async getAvailability(resumeId: string, params: AvailabilityQuery = {}): Promise<ResumeAvailability> {
    const body = await apiService.get<ApiResponse<ResumeAvailability>>(
      `/resumes/${resumeId}/availability`,
      params,
    );
    return body.data;
  },

  /** 按日期范围设置简历档期 */
  async updateAvailability(resumeId: string, payload: UpdateAvailabilityRequest): Promise<AvailabilityMutationResult> {
    const body = await apiService.post<ApiResponse<AvailabilityMutationResult>>(
      `/resumes/${resumeId}/availability`,
      payload,
    );
    return body.data;
  },

  /** 按日期列表批量设置简历档期 */
  async batchUpdateAvailability(resumeId: string, payload: BatchUpdateAvailabilityRequest): Promise<AvailabilityMutationResult> {
    const body = await apiService.post<ApiResponse<AvailabilityMutationResult>>(
      `/resumes/${resumeId}/availability/batch`,
      payload,
    );
    return body.data;
  },

  /** 删除日期范围内的简历档期 */
  async deleteAvailability(resumeId: string, startDate: string, endDate: string): Promise<AvailabilityMutationResult> {
    const query = new URLSearchParams({ startDate, endDate });
    const body = await apiService.delete<ApiResponse<AvailabilityMutationResult>>(
      `/resumes/${resumeId}/availability?${query.toString()}`,
    );
    return body.data;
  },

  /** 查询简历关联的保险与背调状态 */
  async getBackgroundCheckStatus(resumeId: string): Promise<BackgroundCheckStatus> {
    const body = await apiService.get<ApiResponse<BackgroundCheckStatus>>(
      `/resumes/miniprogram/${resumeId}/check-status`,
    );
    return body.data;
  },

  /** 通过身份证号查询保险与背调状态 */
  async getBackgroundCheckStatusByIdCard(idCard: string): Promise<BackgroundCheckStatus> {
    const body = await apiService.post<ApiResponse<BackgroundCheckStatus>>(
      '/resumes/miniprogram/check-status-by-idcard',
      { idCard },
    );
    return body.data;
  },

  /** 创建黑名单记录 */
  async createBlacklist(payload: CreateBlacklistRequest): Promise<BlacklistRecord> {
    const body = await apiService.post<ApiResponse<BlacklistRecord>>('/aunt-blacklist', payload);
    return body.data;
  },

  /** 检查手机号或身份证号是否命中有效黑名单 */
  async checkBlacklist(params: { phone?: string; idCard?: string }): Promise<BlacklistCheckResult> {
    const body = await apiService.get<ApiResponse<BlacklistCheckResult>>('/aunt-blacklist/check', params);
    return body.data;
  },

  /**
   * 实时相似简历检查。与保留的 /resumes/check-duplicate 基础电话/身份证校验不同，
   * 此端点使用独立的 /resume-duplicates 去重候选服务。
   */
  async checkDuplicateCandidates(payload: DuplicateCheckRequest): Promise<DuplicateCheckResult> {
    return apiService.post<DuplicateCheckResult>('/resume-duplicates/check', payload);
  },

  /**
   * 删除小程序上传的单个简历文件。
   * apiService.delete 当前不接收 request body，故使用同一模块已配置的 axios 实例发送
   * 后端所需的 DELETE body；该实例仍沿用认证与响应解包拦截器。
   */
  async deleteFile(resumeId: string, payload: DeleteResumeFileRequest): Promise<ApiResponse<DeleteResumeFileResult>> {
    return api.delete<ApiResponse<DeleteResumeFileResult>>(
      `/resumes/miniprogram/${resumeId}/delete-file`,
      { data: payload },
    ) as unknown as Promise<ApiResponse<DeleteResumeFileResult>>;
  },
};

export default resumeService;
