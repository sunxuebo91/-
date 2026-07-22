import { apiService } from './api';
import type { ApiResponse, DashboardPeriodParams, DepartmentDashboard, OverviewMetrics } from '../types';

/**
 * 业务驾驶舱统计服务。后端根据 JWT 中的用户身份收口数据范围：
 * 管理员返回组织数据，其他角色只能返回个人数据。
 */
export const dashboardService = {
  async getOverviewMetrics(params: DashboardPeriodParams = {}): Promise<OverviewMetrics> {
    const body = await apiService.get<ApiResponse<OverviewMetrics>>('/dashboard/overview', params);
    return (body?.data ?? body) as OverviewMetrics;
  },

  async getDepartmentMetrics(params: DashboardPeriodParams = {}): Promise<DepartmentDashboard> {
    const body = await apiService.get<ApiResponse<DepartmentDashboard>>('/dashboard/department-metrics', params);
    return (body?.data ?? body) as DepartmentDashboard;
  },

  /** 管理员/运营修正员工任务达成基准值。 */
  async updateTaskAchievedBase(userId: string, amount: number): Promise<void> {
    const body = await apiService.patch<ApiResponse<null>>(`/dashboard/task-achievement/${userId}`, { amount });
    if (!body?.success) throw new Error(body?.message || '业绩修正失败');
  },

  /** 管理员/运营设置员工本月任务目标。 */
  async updateMonthlyTask(userId: string, amount: number): Promise<void> {
    const body = await apiService.patch<ApiResponse<null>>(`/dashboard/monthly-task/${userId}`, { amount });
    if (!body?.success) throw new Error(body?.message || '本月任务更新失败');
  },
};

export default dashboardService;
