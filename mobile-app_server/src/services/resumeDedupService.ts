import { apiService } from './api';
import type { DedupCandidateDetail, DedupCandidateListResult, DedupCandidateStatus } from '../types';

const BASE = '/resume-duplicates';

export const resumeDedupService = {
  list(params: { status?: DedupCandidateStatus; minSimilarity?: number; page?: number; pageSize?: number; [key: string]: unknown } = {}) {
    return apiService.get<DedupCandidateListResult>(BASE, params);
  },
  detail(id: string) { return apiService.get<DedupCandidateDetail>(`${BASE}/${id}`); },
  scan(payload: { threshold?: number; limit?: number } = {}) { return apiService.post<{ scanned: number; candidatesInserted: number }>(`${BASE}/scan`, payload); },
  merge(id: string, payload: { keepResumeId: string; remarks?: string }) { return apiService.post<{ success: boolean }>(`${BASE}/${id}/merge`, payload); },
  dismiss(id: string, reason?: string) { return apiService.post(`${BASE}/${id}/dismiss`, { reason }); },
  snooze(id: string, days = 7) { return apiService.post(`${BASE}/${id}/snooze`, { days }); },
  unmerge(mergeLogId: string) { return apiService.post<{ success: boolean }>(`${BASE}/unmerge/${mergeLogId}`, {}); },
};

export default resumeDedupService;