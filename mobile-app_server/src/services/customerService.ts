import { apiService } from './api';
import type {
  ApiResponse,
  Customer,
  CustomerQuery,
  CustomerListResult,
  CustomerMatchingCandidate,
  PartySearchResult,
} from '../types';

export interface ParsedCustomer {
  name?: string;
  phone?: string;
  wechatId?: string;
  address?: string;
  serviceCategory?: string;
  leadSource?: string;
  expectedStartDate?: string;
  salaryBudget?: string;
  remarks?: string;
}

/**
 * 客户服务骨架（对齐 frontend customerService）。
 * 本任务仅提供核心列表/详情 + 基础增改删，业务页面消费留待 Task 3/4。
 * 端点：/customers（baseURL 已含 /api）。
 */
export const customerService = {
  /** 客户列表（分页/筛选） */
  async getCustomers(query: CustomerQuery = {}): Promise<CustomerListResult> {
    const body = await apiService.get<ApiResponse<CustomerListResult>>('/customers', query);
    return body.data;
  },

  /** 客户详情 */
  async getCustomerById(id: string): Promise<Customer> {
    const body = await apiService.get<ApiResponse<Customer>>(`/customers/${id}`);
    return body.data;
  },

  /** 创建客户 */
  async createCustomer(data: Partial<Customer>): Promise<Customer> {
    const body = await apiService.post<ApiResponse<Customer>>('/customers', data);
    if (!body?.success) throw new Error(body?.message || '客户创建失败');
    return body.data;
  },

  /** 使用客户线索文本调用 CRM AI 解析服务。 */
  async parseCustomer(text: string, channel?: string): Promise<ParsedCustomer> {
    const body = await apiService.post<ApiResponse<ParsedCustomer>>('/ai/parse-customer', {
      text,
      ...(channel ? { channel } : {}),
    });
    if (!body?.success || !body.data) throw new Error(body?.message || 'AI 解析失败');
    return body.data;
  },

  /** 更新客户 */
  async updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
    const body = await apiService.patch<ApiResponse<Customer>>(`/customers/${id}`, data);
    if (!body?.success) throw new Error(body?.message || '客户信息更新失败');
    return body.data;
  },

  /** 创建页“指定负责人”选择项，与 CRM 网页端使用同一接口。 */
  async getAssignableUsers(): Promise<Array<{ _id: string; name: string; username: string; role: string }>> {
    const body = await apiService.get<ApiResponse<Array<{ _id: string; name: string; username: string; role: string }>>>(
      '/customers/assignable-users',
    );
    return body.data || [];
  },

  /** 分配客户负责人；权限和校验均由 CRM 后端统一执行。 */
  async assignCustomer(id: string, assignedTo: string, assignmentReason?: string): Promise<Customer> {
    const body = await apiService.patch<ApiResponse<Customer>>(`/customers/${id}/assign`, {
      assignedTo,
      assignmentReason,
    });
    return body.data;
  },

  /** 删除客户 */
  async deleteCustomer(id: string): Promise<ApiResponse> {
    return apiService.delete<ApiResponse>(`/customers/${id}`);
  },

  /**
   * 电子签专用搜索（含流失客户），归一化为甲方选择项。
   * 后端：GET /customers/search?search=&limit= → { success, data:[{_id,name,phone,idCardNumber,address}] }
   */
  async searchForESign(search: string, limit = 10): Promise<PartySearchResult[]> {
    const body = await apiService.get<{ success?: boolean; data?: any[] }>('/customers/search', {
      search,
      limit,
    });
    const list = body?.data || [];
    return list.map((c: any) => ({
      id: c._id,
      name: c.name,
      phone: c.phone,
      idCard: c.idCardNumber,
      type: 'customer' as const,
      source: '客户库',
      address: c.address,
      createdAt: c.createdAt,
    }));
  },

  /** 客户统计 */
  async getStatistics(): Promise<Record<string, unknown>> {
    const body = await apiService.get<ApiResponse<Record<string, unknown>>>(
      '/customers/statistics',
    );
    return body.data;
  },

  /** 客户跟进记录列表 */
  async getFollowUps(id: string): Promise<import('../features/customers/types').CustomerFollowUp[]> {
    const body = await apiService.get<ApiResponse<import('../features/customers/types').CustomerFollowUp[]>>(
      `/customers/${id}/follow-ups`,
    );
    return (body as unknown as { data: import('../features/customers/types').CustomerFollowUp[] }).data || [];
  },

  /** 新增客户跟进记录 */
  async createFollowUp(
    id: string,
    data: { type: string; content: string; result?: string; nextFollowUpDate?: string; recommendedWorkerIds?: string[] },
  ): Promise<import('../features/customers/types').CustomerFollowUp> {
    const body = await apiService.post<ApiResponse<import('../features/customers/types').CustomerFollowUp>>(
      `/customers/${id}/follow-ups`,
      data,
    );
    return (body as unknown as { data: import('../features/customers/types').CustomerFollowUp }).data || { type: '', content: '' };
  },

  /** 释放客户至公海；后端会校验负责人、冻结状态及重复释放。 */
  async releaseToPool(id: string, reason: string): Promise<Customer> {
    const body = await apiService.post<ApiResponse<Customer>>(`/customers/${id}/release-to-pool`, { reason });
    return body.data;
  },

  /** 标记或取消全局紧急客户状态；标记时后端强制要求业务原因。 */
  async updateUrgency(id: string, isUrgent: boolean, reason?: string): Promise<Customer> {
    const body = await apiService.patch<ApiResponse<Customer>>(`/customers/${id}/urgent`, { isUrgent, reason });
    return body.data;
  },

  /** 维护当前登录员工的个人星标，不影响其他员工。 */
  async updateStar(id: string, starred: boolean): Promise<{ customer: Customer; isStarred: boolean }> {
    const body = await apiService.patch<ApiResponse<{ customer: Customer; isStarred: boolean }>>(`/customers/${id}/star`, { starred });
    return body.data;
  },

  /** 以当前 JWT 操作人发布脱敏需求到阿姨接单大厅。 */
  async pushToAunties(id: string): Promise<{ orderId: string; status: string }> {
    const body = await apiService.post<ApiResponse<{ orderId: string; status: string }>>(`/customers/${id}/push-to-aunties`);
    return body.data;
  },

  /** 根据客户服务需求获取真实简历库的可解释候选阿姨。 */
  async getMatchingCandidates(id: string, limit = 5): Promise<CustomerMatchingCandidate[]> {
    const body = await apiService.get<ApiResponse<CustomerMatchingCandidate[]>>(`/customers/${id}/matching-candidates`, { limit });
    return body.data || [];
  },
};

export default customerService;
