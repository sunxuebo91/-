// 客户类型：与 CRM 网页端 customer.types.ts 对齐。
// 系统管理字段仅用于展示；可编辑字段由 Customers 页面按权限提交。

export interface Customer {
  _id: string;
  customerId: string;
  name: string;
  phone: string;
  wechatId?: string;
  idCardNumber?: string;
  leadSource?: string;
  serviceCategory?: string;
  contractStatus?: string;
  customerState?: string;
  leadLevel?: string;
  salaryBudget?: number;
  expectedStartDate?: string;
  homeArea?: number;
  familySize?: number;
  restSchedule?: string;
  address?: string;
  ageRequirement?: string;
  genderRequirement?: string;
  originRequirement?: string;
  educationRequirement?: string;
  expectedDeliveryDate?: string;
  serviceDays?: number;
  remarks?: string;
  dealAmount?: number;
  createdBy?: string;
  createdByUser?: { name: string; username: string } | null;
  lastUpdatedBy?: string;
  lastUpdatedByUser?: { name: string; username: string } | null;
  assignedTo?: string;
  assignedBy?: string;
  assignedToUser?: { _id?: string; name: string; username: string; active?: boolean; isActive?: boolean; leftAt?: string } | null;
  assignedByUser?: { name: string; username: string } | null;
  assignedAt?: string;
  assignmentReason?: string;
  inPublicPool?: boolean;
  publicPoolEntryTime?: string;
  publicPoolEntryReason?: string;
  lastFollowUpBy?: string;
  lastFollowUpTime?: string;
  claimCount?: number;
  transferCount?: number;
  lastTransferredAt?: string;
  lastActivityAt?: string;
  autoTransferEnabled?: boolean;
  isFrozen?: boolean;
  isUrgent?: boolean;
  urgentAt?: string;
  urgentReason?: string;
  isStarred?: boolean;
  frozenAt?: string;
  frozenReason?: string;
  followUpStatus?: string | null;
  followUpCount?: number;
  signedContractCount?: number;
  needOrderType?: string;
  needWorkingHours?: string;
  needSalary?: string;
  needRestTime?: string;
  needFamilyMembers?: string;
  needServiceAddress?: string;
  needHouseArea?: string;
  needWorkContent?: string;
  needRemarks?: string;
  needServicePeriod?: string;
  needOnboardingTime?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface CustomerQuery {
  page?: number;
  limit?: number;
  search?: string;
  contractStatus?: string;
  customerState?: string;
  leadLevel?: string;
  serviceCategory?: string;
  leadSource?: string;
  followUpStatus?: string;
  assignedTo?: string;
  leadLevels?: string[];
  leadSources?: string[];
  serviceCategories?: string[];
  customerStates?: string[];
  followUpStatuses?: string[];
  assignedToIds?: string[];
  isUrgent?: boolean;
  isStarred?: boolean;
  createdStartDate?: string;
  createdEndDate?: string;
  [key: string]: unknown;
}

export interface CustomerMatchingCandidate {
  _id: string;
  name: string;
  phone?: string;
  idNumber?: string;
  gender?: string;
  age?: number;
  nativePlace?: string;
  currentAddress?: string;
  jobType?: string;
  expectedSalary?: number;
  experienceYears?: number;
  matchScore: number;
  matchReasons: string[];
}

export interface CustomerListResult {
  customers: Customer[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
}
