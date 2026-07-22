// 首页驾驶舱统计类型（移动端精简版）

export interface DashboardPeriodParams extends Record<string, unknown> {
  startDate?: string;
  endDate?: string;
}

export interface OverviewMetrics {
  totalGmv: number;
  admissionsGmv: number;
  dispatchGmvAmount: number;
  enrollmentOrderCount: number;
  dispatchOrderCount: number;
  gmvMomGrowth: number | null;
  admissionsGmvMomGrowth: number | null;
  dispatchGmvMomGrowth: number | null;
  prevPeriodGmv: number;
  prevEnrollmentOrderCount: number;
  prevDispatchOrderCount: number;
}

export interface DeptPersonMetrics {
  userId: string;
  userName: string;
  monthlyTask: number;
  taskAchievedBase: number;
  taskAchievedBaseAt: string | null;
  taskAchieved: number;
  timeProgressDelta?: number;
  leadCount: number;
  orderCount: number;
  conversionRate: number;
  avgOrderValue: number;
  momGrowth: number | null;
}

export interface DepartmentDashboard {
  admissions: DeptPersonMetrics[];
  dispatch: DeptPersonMetrics[];
}

export interface DashboardStats {
  customerBusiness?: {
    totalCustomers: number;
    newTodayCustomers: number;
    pendingMatchCustomers: number;
    signedCustomers: number;
    lostCustomers: number;
  };
  contracts?: {
    totalContracts: number;
    newThisMonthContracts: number;
    signingContracts: number;
    signConversionRate: number;
  };
  resumes?: {
    totalResumes: number;
    newTodayResumes: number;
  };
  leadQuality?: {
    aLevelLeadsRatio: number;
    leadSourceDistribution: Record<string, number>;
    leadLevelDistribution: { oLevel: number; aLevel: number; bLevel: number; cLevel: number; dLevel: number; total: number };
  };
  salesFunnel?: {
    salesFunnelList: Array<{
      userId: string;
      userName: string;
      totalLeads: number;
      oLevel: number;
      aLevel: number;
      bLevel: number;
      cLevel: number;
      dLevel: number;
      conversionRate: number;
      totalDealAmount: number;
      averageDealAmount: number;
    }>;
    totalLeads: number;
    totalDealAmount: number;
    averageConversionRate: number;
  };
  [key: string]: unknown;
}
