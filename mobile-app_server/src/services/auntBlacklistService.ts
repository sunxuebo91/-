import { apiService } from './api';
import type { ApiResponse, BlacklistListQuery, BlacklistListResult, BlacklistRecord, CreateBlacklistRequest, UpdateBlacklistRequest } from '../types';

const BASE = '/aunt-blacklist';

export const auntBlacklistService = {
  async list(query: BlacklistListQuery = {}): Promise<BlacklistListResult> {
    const body = await apiService.get<ApiResponse<BlacklistListResult>>(BASE, query);
    return body.data;
  },
  async update(id: string, payload: UpdateBlacklistRequest): Promise<BlacklistRecord> {
    const body = await apiService.patch<ApiResponse<BlacklistRecord>>(`${BASE}/${id}`, payload);
    return body.data;
  },
  async release(id: string, releaseReason: string): Promise<BlacklistRecord> {
    const body = await apiService.post<ApiResponse<BlacklistRecord>>(`${BASE}/${id}/release`, { releaseReason });
    return body.data;
  },
  async create(payload: CreateBlacklistRequest): Promise<BlacklistRecord> {
    const body = await apiService.post<ApiResponse<BlacklistRecord>>(BASE, payload);
    return body.data;
  },
};

export default auntBlacklistService;