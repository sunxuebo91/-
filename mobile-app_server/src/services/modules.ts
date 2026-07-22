/**
 * 全模块覆盖（Task 4）service 集中定义。
 * - baseURL 已含 /api，故路径不带 /api 前缀（对齐 frontend 时去掉 /api）。
 * - 列表统一用 pickList 归一化为 { list, total }，兼容后端多种返回结构。
 * - 后端复用现有接口（含各 miniprogram 端点），不新增后端接口。
 */
import { api, apiService } from './api';
import type {
  ListResult,
  ApiResult,
  InsurancePolicy,
  CreatePolicyData,
  InsuredPerson,
  BackgroundReport,
  CreateBackgroundReportData,
  TrainingLead,
  TrainingLeadFollowUp,
  TrainingLeadInput,
  TrainingLeadQuery,
  TrainingOrder,
  TrainingOrderDetail,
  TrainingClass,
  Course,
  OrderHallOrder,
  OrderGrab,
  ReferralResume,
  Referrer,
  FormItem,
  FormSubmission,
  FormStats,
  FormShareToken,
  Article,
  Banner,
  RoleItem,
  UserItem,
} from '../types/modules';

export interface InsurancePaymentOrder {
  Success?: string;
  Message?: string;
  WeChatWebUrl?: string;
  paymentType?: string;
  WeChatAppId?: string;
  WeChatTimeStamp?: string;
  WeChatNonceStr?: string;
  WeChatPackageValue?: string;
  WeChatSign?: string;
  WeChatSignType?: string;
  WeChatPrepayId?: string;
  WeChatPartnerId?: string;
}

// ── 归一化工具 ──────────────────────────────────
/** 从任意后端返回中解出 { list, total }，兼容 data/list/items/数组等结构 */
export function pickList<T = unknown>(r: any): ListResult<T> {
  if (Array.isArray(r)) return { list: r as T[], total: r.length };
  const d = r?.data ?? r;
  if (Array.isArray(d)) return { list: d as T[], total: r?.total ?? d.length };
  const list = d?.list ?? d?.items ?? d?.data ?? [];
  const arr: T[] = Array.isArray(list) ? list : [];
  const total = d?.total ?? r?.total ?? arr.length;
  return { list: arr, total };
}

/** 解包单对象 body.data */
function pickOne<T = unknown>(r: any): T {
  return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;
}

// ── 保险（大树保 dashubao） ─────────────────────
// 后端 CRM 端路由前缀为 dashubao/miniprogram（需 JWT）
export const insuranceService = {
  listPolicies: async (params: Record<string, unknown> = {}): Promise<ListResult<InsurancePolicy>> =>
    pickList<InsurancePolicy>(await apiService.get('/dashubao/miniprogram/policies', params)),
  getPoliciesByIdCard: async (idCard: string): Promise<InsurancePolicy[]> =>
    pickList<InsurancePolicy>(await apiService.get(`/dashubao/miniprogram/policy/by-id-card/${encodeURIComponent(idCard)}`)).list,
  getPolicy: async (id: string): Promise<InsurancePolicy> =>
    pickOne<InsurancePolicy>(await apiService.get(`/dashubao/miniprogram/policy/${id}`)),
  createPolicy: (data: CreatePolicyData): Promise<ApiResult<InsurancePolicy>> =>
    apiService.post('/dashubao/miniprogram/policy', data),
  createPaymentOrder: async (policyRef: string, tradeType = 'MWEB'): Promise<InsurancePaymentOrder> =>
    pickOne<InsurancePaymentOrder>(await apiService.post(`/dashubao/policy/payment/${encodeURIComponent(policyRef)}?tradeType=${encodeURIComponent(tradeType)}`)),
  cancelPolicy: (policyNo: string) => apiService.post('/dashubao/miniprogram/policy/cancel', { policyNo }),
  surrenderPolicy: (policyNo: string, removeReason: string) =>
    apiService.post('/dashubao/miniprogram/policy/surrender', { policyNo, removeReason }),
  amendPolicy: (policyNo: string, oldInsured: InsuredPerson, newInsured: InsuredPerson) =>
    apiService.post('/dashubao/miniprogram/policy/amend', { policyNo, oldInsured, newInsured }),
  addInsured: (policyNo: string, totalPremium: number, insuredList: InsuredPerson[]) =>
    apiService.post('/dashubao/miniprogram/policy/add-insured', { policyNo, totalPremium, insuredList }),
  syncPolicyStatus: (identifier: string): Promise<ApiResult<InsurancePolicy>> =>
    apiService.post(`/dashubao/miniprogram/policy/sync/${encodeURIComponent(identifier)}`),
  printPolicy: (policyNo: string): Promise<Blob> =>
    api.post('/dashubao/miniprogram/policy/print', { policyNo }, { responseType: 'blob' }) as unknown as Promise<Blob>,
};

// ── 背调（芝麻 zmdb） ───────────────────────────
export const backgroundCheckService = {
  listReports: async (params: Record<string, unknown> = {}): Promise<ListResult<BackgroundReport>> =>
    pickList<BackgroundReport>(await apiService.get('/zmdb/reports', params)),
  getReportByIdNo: async (idNo: string): Promise<BackgroundReport | null> =>
    pickOne<BackgroundReport | null>(await apiService.get(`/zmdb/reports/by-idno/${encodeURIComponent(idNo)}`)),
  getReport: async (id: string): Promise<BackgroundReport> =>
    pickOne<BackgroundReport>(await apiService.get(`/zmdb/reports/${id}/detail`)),
  prepareAuth: async (workerName: string): Promise<{ stuffId: string; imageUrl: string; esignContractNo?: string }> =>
    pickOne<{ stuffId: string; imageUrl: string; esignContractNo?: string }>(await apiService.post('/zmdb/prepare-auth', { workerName })),
  createReport: async (data: CreateBackgroundReportData): Promise<BackgroundReport> =>
    pickOne<BackgroundReport>(await apiService.post('/zmdb/reports', data)),
  fetchResult: async (reportId: string) =>
    apiService.post(`/zmdb/reports/${reportId}/fetch-result`, {}),
  cancelReport: async (id: string) => apiService.delete(`/zmdb/reports/${id}/cancel`),
  downloadReport: async (reportId: string): Promise<Blob> =>
    api.get(`/zmdb/reports/${reportId}/download`, { responseType: 'blob' }) as unknown as Promise<Blob>,
};

// ── 培训线索 ────────────────────────────────────
export const trainingLeadService = {
  list: async (params: TrainingLeadQuery = {}): Promise<ListResult<TrainingLead>> =>
    pickList<TrainingLead>(await apiService.get('/training-leads', { ...params })),
  get: async (id: string): Promise<TrainingLead> =>
    pickOne<TrainingLead>(await apiService.get(`/training-leads/${id}`)),
  create: async (data: TrainingLeadInput): Promise<TrainingLead> =>
    pickOne<TrainingLead>(await apiService.post('/training-leads', data)),
  update: async (id: string, data: Partial<TrainingLeadInput>): Promise<TrainingLead> =>
    pickOne<TrainingLead>(await apiService.patch(`/training-leads/${id}`, data)),
  remove: (id: string) => apiService.delete(`/training-leads/${id}`),
  createFollowUp: async (
    id: string,
    data: { type: string; followUpResult: string; content: string; nextFollowUpDate?: string },
  ): Promise<TrainingLeadFollowUp> =>
    pickOne<TrainingLeadFollowUp>(await apiService.post(`/training-leads/${id}/follow-ups`, data)),
  getFollowUps: async (id: string): Promise<TrainingLeadFollowUp[]> => {
    const result = pickOne<TrainingLeadFollowUp[]>(await apiService.get(`/training-leads/${id}/follow-ups`));
    return Array.isArray(result) ? result : [];
  },
  getOperationLogs: async (id: string): Promise<Record<string, unknown>[]> => {
    const result = pickOne<Record<string, unknown>[]>(await apiService.get(`/training-leads/${id}/operation-logs`));
    return Array.isArray(result) ? result : [];
  },
  claim: async (id: string) => apiService.post(`/training-leads/${id}/claim`),
  release: async (id: string) => apiService.post(`/training-leads/${id}/release`),
};

// ── 培训订单/职培合同 ───────────────────────────
export const trainingOrderService = {
  list: async (params: Record<string, unknown> = {}): Promise<ListResult<TrainingOrder>> =>
    pickList<TrainingOrder>(await apiService.get('/training-orders', params)),
  get: async (id: string): Promise<TrainingOrder> =>
    pickOne<TrainingOrder>(await apiService.get(`/training-orders/${id}`)),
  students: async (params: Record<string, unknown> = {}): Promise<ListResult<Record<string, unknown>>> =>
    pickList(await apiService.get('/training-orders/students', params)),
  /** App 职培合同专用视图：后端已按 CRM 列表字段整形，并按当前用户权限收敛数据范围。 */
  listForApp: async (params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    leadSource?: string;
    certificateStatus?: 'applied' | 'unapplied';
    startDate?: string;
    endDate?: string;
  } = {}): Promise<ListResult<TrainingOrder>> => {
    const body: any = await apiService.get('/training-orders/miniprogram/list', params);
    const data = body?.data ?? body;
    return { list: Array.isArray(data?.items) ? data.items : [], total: Number(data?.total) || 0 };
  },
  /** App 职培合同详情：复用 CRM ContractDetail 对应的后端预整形展示块。 */
  getDetailForApp: async (id: string): Promise<TrainingOrderDetail> => {
    const body: any = await apiService.get(`/training-orders/miniprogram/detail/${id}`);
    return (body?.data ?? body) as TrainingOrderDetail;
  },
  graduate: (id: string) => apiService.post(`/training-orders/${id}/graduate`),
};

// ── 培训班级/开班 ───────────────────────────────
export const trainingClassService = {
  list: async (params: Record<string, unknown> = {}): Promise<ListResult<TrainingClass>> =>
    pickList<TrainingClass>(await apiService.get('/training-classes', params)),
  members: async (id: string): Promise<ListResult<Record<string, unknown>>> =>
    pickList(await apiService.get(`/training-classes/${id}/members`)),
};

// ── 课程 ────────────────────────────────────────
export const courseService = {
  list: async (params: Record<string, unknown> = {}): Promise<ListResult<Course>> =>
    pickList<Course>(await apiService.get('/courses', params)),
  get: async (id: string): Promise<Course> =>
    pickOne<Course>(await apiService.get(`/courses/${id}`)),
};

// ── 接单大厅 ────────────────────────────────────
export const orderHallService = {
  listOrders: async (params: { staffId: string; status?: string; page?: number; pageSize?: number }): Promise<ListResult<OrderHallOrder>> =>
    pickList<OrderHallOrder>(await apiService.get('/order-hall/staff/orders', params)),
  listGrabs: async (orderId: string, staffId: string): Promise<OrderGrab[]> => {
    const r = await apiService.get(`/order-hall/staff/orders/${orderId}/grabs`, { staffId });
    const { list } = pickList<OrderGrab>(r);
    return list;
  },
  approveGrab: async (grabId: string, staffId: string, remark?: string) =>
    apiService.post(`/order-hall/staff/grabs/${grabId}/approve`, { staffId, remark }),
  rejectGrab: async (grabId: string, staffId: string, remark?: string) =>
    apiService.post(`/order-hall/staff/grabs/${grabId}/reject`, { staffId, remark }),
};

// ── 推荐返费 ────────────────────────────────────
export const referralService = {
  listReferrals: async (params: Record<string, unknown> = {}): Promise<ListResult<ReferralResume>> =>
    pickList<ReferralResume>(await apiService.get('/referral/admin/all-referrals', params)),
  listAssignedReferrals: async (params: Record<string, unknown> = {}): Promise<ListResult<ReferralResume>> =>
    pickList<ReferralResume>(await apiService.get('/referral/staff/assigned-referrals', params)),
  listReferrers: async (params: Record<string, unknown> = {}): Promise<ListResult<Referrer>> =>
    pickList<Referrer>(await apiService.get('/referral/admin/referrers', params)),
  getReferralDetail: async (id: string): Promise<ReferralResume> =>
    pickOne<ReferralResume>(await apiService.get(`/referral/admin/referral-detail/${id}`)),
  reviewReferral: (staffId: string, isAdmin: boolean, id: string, result: 'approve' | 'reject', note?: string) =>
    apiService.post('/referral/staff/review-referral', { staffId, isAdmin, id, result, note }),
  updateReferralStatus: (staffId: string, isAdmin: boolean, id: string, status: string) =>
    apiService.post('/referral/staff/update-status', { staffId, isAdmin, id, status }),
  processReward: (staffId: string, isAdmin: boolean, referralResumeId: string, action: 'approve' | 'reject' | 'markPaid', remark?: string) =>
    apiService.post('/referral/staff/process-reward', { staffId, isAdmin, referralResumeId, action, remark }),
  releaseToResumeLibrary: (staffId: string, isAdmin: boolean, referralResumeId: string) =>
    apiService.post('/referral/staff/release-to-resume-library', { staffId, isAdmin, referralResumeId }),
  approveReferrer: (callerStaffId: string, referrerId: string) =>
    apiService.post('/referral/admin/approve-referrer', { callerStaffId, referrerId }),
  rejectReferrer: (callerStaffId: string, referrerId: string, reason: string) =>
    apiService.post('/referral/admin/reject-referrer', { callerStaffId, referrerId, reason }),
};

// ── 表单 ────────────────────────────────────────
export const formService = {
  list: async (params: Record<string, unknown> = {}): Promise<ListResult<FormItem>> =>
    pickList<FormItem>(await apiService.get('/forms', params)),
  get: async (id: string): Promise<FormItem> =>
    pickOne<FormItem>(await apiService.get(`/forms/${id}`)),
  create: async (data: FormItem): Promise<FormItem> =>
    pickOne<FormItem>(await apiService.post('/forms', data)),
  update: async (id: string, data: FormItem): Promise<FormItem> =>
    pickOne<FormItem>(await apiService.put(`/forms/${id}`, data)),
  remove: (id: string) => apiService.delete(`/forms/${id}`),
  getStats: async (id: string): Promise<FormStats> =>
    pickOne<FormStats>(await apiService.get(`/forms/${id}/stats`)),
  generateShareToken: async (id: string): Promise<FormShareToken> =>
    pickOne<FormShareToken>(await apiService.post(`/forms/${id}/generate-share-token`)),
  submissions: async (formId: string, params: Record<string, unknown> = {}): Promise<ListResult<FormSubmission>> =>
    pickList<FormSubmission>(await apiService.get(`/forms/${formId}/submissions`, params)),
  getAllSubmissions: async (params: Record<string, unknown> = {}): Promise<ListResult<FormSubmission>> =>
    pickList<FormSubmission>(await apiService.get('/forms/all-submissions', params)),
  updateSubmission: async (
    submissionId: string,
    data: { followUpStatus?: string; followUpNote?: string },
  ): Promise<FormSubmission> =>
    pickOne<FormSubmission>(await apiService.put(`/forms/submissions/${submissionId}`, data)),
  deleteSubmission: (submissionId: string) => apiService.delete(`/forms/submissions/${submissionId}`),
};

// 电子签「签署合同」已并入合同详情（见 ContractList SigningSection），
// 使用 /contracts/:id/resend-sign-urls 等 JWT 端点，不再单列 esignService。

// ── 褓贝：文章 / Banner ─────────────────────────
export const baobeiService = {
  listArticles: async (params: Record<string, unknown> = {}): Promise<ListResult<Article>> =>
    pickList<Article>(await apiService.get('/articles', params)),
  listBanners: async (params: Record<string, unknown> = {}): Promise<ListResult<Banner>> =>
    pickList<Banner>(await apiService.get('/banners', params)),
};

// ── 角色 / 用户 / 权限 ──────────────────────────
export const roleService = {
  list: async (params: Record<string, unknown> = {}): Promise<ListResult<RoleItem>> =>
    pickList<RoleItem>(await apiService.get('/roles', params)),
  get: async (id: string): Promise<RoleItem> => pickOne<RoleItem>(await apiService.get(`/roles/${id}`)),
  create: (data: { code?: string; name: string; description?: string; permissions: string[]; active?: boolean }) =>
    apiService.post<ApiResult<RoleItem>>('/roles', data),
  update: (id: string, data: { name?: string; description?: string; permissions?: string[]; active?: boolean }) =>
    apiService.patch<ApiResult<RoleItem>>(`/roles/${id}`, data),
  remove: (id: string) => apiService.delete<ApiResult<null>>(`/roles/${id}`),
  catalog: async (): Promise<Array<{ title: string; permissions: Array<{ key: string; label: string; description?: string; color?: string }> }>> => {
    const response = await apiService.get<{ data?: Array<{ title: string; permissions: Array<{ key: string; label: string; description?: string; color?: string }> }> }>('/permissions/catalog');
    return response?.data || [];
  },
};

export const userService = {
  list: async (params: Record<string, unknown> = {}): Promise<ListResult<UserItem>> =>
    pickList<UserItem>(await apiService.get('/users', params)),
  get: async (id: string): Promise<UserItem> => pickOne<UserItem>(await apiService.get(`/users/${id}`)),
  create: (data: { username: string; password: string; name: string; email?: string; phone?: string; roles: string[]; monthlyTask?: number }) =>
    apiService.post<ApiResult<UserItem>>('/users', data),
  update: (id: string, data: { password?: string; name?: string; email?: string; phone?: string; roles?: string[]; monthlyTask?: number }) =>
    apiService.patch<ApiResult<UserItem>>(`/users/${id}`, data),
  remove: (id: string) => apiService.delete<ApiResult<null>>(`/users/${id}`),
  suspend: (id: string) => apiService.patch<ApiResult<UserItem>>(`/users/${id}/suspend`),
  resume: (id: string) => apiService.patch<ApiResult<UserItem>>(`/users/${id}/resume`),
  unlock: (id: string) => apiService.patch<ApiResult<UserItem>>(`/users/${id}/unlock`),
  markDeparted: (adminId: string, userId: string, departDate: string) =>
    apiService.post<ApiResult<unknown>>('/referral/mark-staff-departed', { adminId, userId, departDate }),
};

// ── 通知 ─────────────────────────────────────────
export const notificationService = {
  list: async (params: { page?: number; limit?: number; isRead?: boolean } = {}): Promise<ListResult<Record<string, unknown>>> =>
    pickList(await apiService.get('/notifications', params)),
  getUnreadCount: async (): Promise<number> => {
    const r = await apiService.get<any>('/notifications/unread-count');
    return (r?.data?.count ?? r?.count ?? 0) as number;
  },
  markRead: async (ids: string[]): Promise<void> => {
    await apiService.put('/notifications/mark-read', { ids });
  },
  markAllRead: async (): Promise<void> => {
    await apiService.put('/notifications/mark-all-read', {});
  },
};

// ── 员工评价 ─────────────────────────────────────
export const evaluationService = {
  listByEmployee: async (employeeId: string, params: Record<string, unknown> = {}): Promise<ListResult<Record<string, unknown>>> => {
    const { limit, ...rest } = params as { limit?: number } & Record<string, unknown>;
    const query: Record<string, unknown> = { employeeId, ...rest };
    if (limit != null && query.pageSize == null) query.pageSize = limit;
    return pickList(await apiService.get('/employee-evaluations/miniprogram/list', query));
  },
  create: async (data: {
    employeeId: string;
    employeeName: string;
    evaluationType: string;
    overallRating: number;
    comment: string;
    strengths?: string;
    improvements?: string;
    status?: string;
  }): Promise<Record<string, unknown>> =>
    pickOne(await apiService.post('/employee-evaluations', { status: 'published', ...data })),
};
