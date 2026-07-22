import { apiService } from './api';
import type { ApiResult } from '../types/modules';
import type {
  FinanceCategory,
  FinanceOwner,
  FinanceRecord,
  FinanceRecordInput,
  FinanceRecordList,
  FinanceRecordQuery,
  FinanceSummary,
} from '../types/finance';

const dataOrThrow = <T>(response: ApiResult<T>): T => {
  if (!response.success || response.data == null) {
    throw new Error(response.message || '财务数据加载失败');
  }
  return response.data;
};

const queryParams = (query: object): Record<string, unknown> => ({ ...query });

export const financeService = {
  async listRecords(query: FinanceRecordQuery): Promise<FinanceRecordList> {
    const { type, categoryId, ownerId, keyword, startDate, endDate, page, pageSize } = query;
    return dataOrThrow(
      await apiService.get<ApiResult<FinanceRecordList>>('/finance/records', {
        type, categoryId, ownerId, keyword, startDate, endDate, page, pageSize,
      }),
    );
  },

  async getSummary(query: Pick<FinanceRecordQuery, 'startDate' | 'endDate' | 'ownerId'>): Promise<FinanceSummary> {
    return dataOrThrow(
      await apiService.get<ApiResult<FinanceSummary>>('/finance/records/summary', queryParams(query)),
    );
  },

  async getCategories(): Promise<FinanceCategory[]> {
    return dataOrThrow(
      await apiService.get<ApiResult<FinanceCategory[]>>('/finance/categories', { active: true }),
    );
  },

  async getOwners(): Promise<FinanceOwner[]> {
    return dataOrThrow(
      await apiService.get<ApiResult<FinanceOwner[]>>('/customers/assignable-users'),
    );
  },

  async createRecord(input: FinanceRecordInput): Promise<FinanceRecord> {
    return dataOrThrow(
      await apiService.post<ApiResult<FinanceRecord>>('/finance/records', input),
    );
  },

  async updateRecord(id: string, input: Partial<FinanceRecordInput>): Promise<FinanceRecord> {
    return dataOrThrow(
      await apiService.patch<ApiResult<FinanceRecord>>(`/finance/records/${id}`, input),
    );
  },

  async removeRecord(id: string): Promise<void> {
    const response = await apiService.delete<ApiResult<null>>(`/finance/records/${id}`);
    if (!response.success) throw new Error(response.message || '删除财务记录失败');
  },
};