import { apiService } from './api';
import type { ApiResponse } from '../types';

export type LeadTransferTargetModule = 'customer' | 'training';
export type LeadTransferStatus = 'success' | 'failed';

export interface LeadTransferUserQuota {
  userId: string;
  userName: string;
  role: 'source' | 'target' | 'both';
  transferredOut: number;
  transferredIn: number;
  balance: number;
  pendingCompensation: number;
}

export interface LeadTransferRule {
  _id: string;
  ruleName: string;
  description?: string;
  enabled: boolean;
  targetModule?: LeadTransferTargetModule;
  triggerConditions: {
    inactiveHours: number;
    transferCooldownHours?: number;
    maxTransferCount?: number;
    contractStatuses: string[];
    leadSources?: string[];
  };
  executionWindow: {
    enabled: boolean;
    startTime: string;
    endTime: string;
  };
  distributionConfig?: {
    strategy: 'balanced-random' | 'round-robin' | 'least-load';
    enableCompensation: boolean;
    compensationPriority: number;
  };
  userQuotas: LeadTransferUserQuota[];
  statistics: {
    totalTransferred: number;
    lastExecutedAt?: string;
    lastExecutionResult?: string;
  };
}

export interface LeadTransferRecord {
  _id: string;
  ruleId: string;
  ruleName: string;
  customerId: string;
  customerNumber: string;
  customerName: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  transferredAt: string;
  reason: string;
  status: LeadTransferStatus;
  errorMessage?: string;
  snapshot: {
    contractStatus: string;
    inactiveHours: number;
    lastActivityAt: string;
  };
}

export interface LeadTransferRecordQuery {
  page?: number;
  limit?: number;
  ruleId?: string;
  customerId?: string;
  fromUserId?: string;
  toUserId?: string;
  status?: LeadTransferStatus;
  startDate?: string;
  endDate?: string;
  [key: string]: unknown;
}

export interface LeadTransferRecordPage {
  records: LeadTransferRecord[];
  total: number;
  page: number;
  totalPages: number;
}

export interface LeadTransferStatisticsQuery {
  startDate?: string;
  endDate?: string;
  [key: string]: unknown;
}

export interface LeadTransferStatistics {
  totalCount: number;
  successCount: number;
  failedCount: number;
  successRate: string;
}

type ResponseBody<T> = ApiResponse<T> | T;

const unwrapResponse = <T>(body: ResponseBody<T>): T => {
  if (typeof body === 'object' && body !== null && 'data' in body) {
    return (body as ApiResponse<T>).data;
  }
  return body as T;
};

/** Read-only API for the lead-transfer mobile views. */
export const leadTransferService = {
  async getRules(targetModule: LeadTransferTargetModule = 'customer'): Promise<LeadTransferRule[]> {
    const body = await apiService.get<ResponseBody<LeadTransferRule[]>>('/lead-transfer/rules', {
      targetModule,
    });
    return unwrapResponse(body);
  },

  async getRecords(query: LeadTransferRecordQuery = {}): Promise<LeadTransferRecordPage> {
    const body = await apiService.get<ResponseBody<LeadTransferRecordPage>>('/lead-transfer/records', query);
    return unwrapResponse(body);
  },

  async getStatistics(query: LeadTransferStatisticsQuery = {}): Promise<LeadTransferStatistics> {
    const body = await apiService.get<ResponseBody<LeadTransferStatistics>>('/lead-transfer/statistics', query);
    return unwrapResponse(body);
  },
};

export default leadTransferService;