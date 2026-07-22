/**
 * 全模块覆盖（Task 4）业务类型集中定义。
 * 字段对齐 frontend 对应 service/type，仅保留移动端展示/轻量操作所需字段。
 * 后端多数列表返回结构不统一（{data,total} / {list,total} / 数组），
 * service 层统一用 pickList 归一化为 { list, total }，故此处类型偏宽松。
 */

// ── 通用分页结果 ────────────────────────────────
export interface ListResult<T> {
  list: T[];
  total: number;
}

export interface ApiResult<T> {
  success: boolean;
  data: T | null;
  message?: string;
}

// ── 保险（大树保 dashubao） ─────────────────────
export interface InsurancePolicy {
  _id?: string;
  id?: string;
  policyNo?: string;
  policyRef?: string;
  agencyPolicyRef?: string;
  insuredName?: string;
  mobile?: string;
  idNumber?: string;
  status?: string;
  productName?: string;
  premium?: number;
  startDate?: string;
  endDate?: string;
  productCode?: string;
  planCode?: string;
  effectiveDate?: string;
  expireDate?: string;
  groupSize?: number;
  totalPremium?: number;
  serviceAddress?: string;
  remark?: string;
  policyPdfUrl?: string;
  errorMessage?: string;
  policyHolder?: PolicyHolder;
  insuredList?: InsuredPerson[];
  resumeId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InsuredPerson {
  insuredId?: string;
  insuredName: string;
  insuredType?: string;
  idType: string;
  idNumber: string;
  birthDate: string;
  gender: string;
  mobile?: string;
}

export interface PolicyHolder {
  policyHolderType: string;
  policyHolderName: string;
  phIdType: string;
  phIdNumber: string;
  phTelephone?: string;
  phAddress?: string;
  phProvinceCode?: string;
  phCityCode?: string;
  phDistrictCode?: string;
}

export interface CreatePolicyData {
  productCode?: string;
  planCode: string;
  effectiveDate: string;
  expireDate: string;
  groupSize: number;
  totalPremium: number;
  serviceAddress?: string;
  remark?: string;
  policyHolder: PolicyHolder;
  insuredList: InsuredPerson[];
}

// ── 背调（芝麻 zmdb） ───────────────────────────
export interface BackgroundReport {
  _id?: string;
  id?: string;
  reportId?: string;
  name?: string;
  mobile?: string;
  idNo?: string;
  position?: string;
  status?: number;
  packageType?: string;
  reportUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  stuffId?: string;
  authStuffUrl?: string;
  esignContractNo?: string;
  createdBy?: string | { _id?: string; name?: string; username?: string };
  contractId?: string | { _id?: string; contractNumber?: string; customerName?: string; workerName?: string };
  callbackHistory?: Array<{ notifyType: number; status: number; receivedAt?: string }>;
  reportResult?: {
    riskLevel?: string;
    riskScore?: number | null;
    failNum?: number;
    summary?: string;
    identityRiskLevel?: string;
    socialRiskLevel?: string;
    courtRiskLevel?: string;
    financeRiskLevel?: string;
    digestList?: Array<{ name?: string; risk?: string; result?: string; remark?: string }>;
    fetchedAt?: string;
  };
}

export interface CreateBackgroundReportData {
  stuffId: string;
  authStuffUrl: string;
  esignContractNo: string;
  name: string;
  mobile: string;
  idNo: string;
  position?: string;
  packageType?: '1' | '2';
}

// ── 培训线索 ────────────────────────────────────
export interface TrainingLead {
  _id?: string;
  id?: string;
  studentId?: string;
  name?: string;
  gender?: string;
  age?: number;
  phone?: string;
  wechatId?: string;
  idCardNumber?: string;
  consultPosition?: string;
  intentionLevel?: string;
  leadGrade?: string;
  leadSource?: string;
  trainingType?: string;
  intendedCourses?: string[];
  reportedCertificates?: string[];
  expectedStartDate?: string;
  budget?: number;
  courseAmount?: number;
  serviceFeeAmount?: number;
  isOnlineCourse?: boolean;
  address?: string;
  isReported?: boolean;
  status?: string;
  leadStatus?: string;
  followUpStatus?: string | null;
  lastFollowUpResult?: string | null;
  lastFollowUpAt?: string;
  inPublicPool?: boolean;
  createdBy?: LeadUser | string;
  assignedTo?: LeadUser | string;
  studentOwner?: LeadUser | string;
  remarks?: string;
  followUps?: TrainingLeadFollowUp[];
  linkedLeads?: TrainingLead[];
  createdAt?: string;
  updatedAt?: string;
}

export interface LeadUser {
  _id?: string;
  id?: string;
  name?: string;
  username?: string;
}

export interface TrainingLeadFollowUp {
  _id?: string;
  leadId?: string;
  type: string;
  followUpResult: string;
  contactSuccess?: boolean;
  content: string;
  nextFollowUpDate?: string;
  createdBy?: LeadUser | string;
  createdAt?: string;
}

export interface TrainingLeadQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  leadSource?: string;
  trainingType?: string;
  startDate?: string;
  endDate?: string;
  isReported?: boolean;
  studentOwner?: string;
  lastFollowUpResult?: string;
}

export interface TrainingLeadInput {
  name: string;
  phone: string;
  gender?: string;
  age?: number;
  wechatId?: string;
  idCardNumber?: string;
  consultPosition?: string;
  leadSource?: string;
  trainingType?: string;
  intendedCourses?: string[];
  reportedCertificates?: string[];
  intentionLevel?: string;
  leadGrade?: string;
  expectedStartDate?: string;
  budget?: number;
  courseAmount?: number;
  serviceFeeAmount?: number;
  isOnlineCourse?: boolean;
  address?: string;
  isReported?: boolean;
  studentOwner?: string;
  remarks?: string;
}

// ── 培训订单/职培合同 ───────────────────────────
export interface TrainingOrder {
  _id?: string;
  id?: string;
  contractNumber?: string;
  contractNo?: string;
  customerName?: string;
  studentName?: string;
  customerPhone?: string;
  courseName?: string;
  amount?: number;
  status?: string;
  contractStatus?: 'draft' | 'signing' | 'signed' | 'active' | 'graduated' | 'refunded' | string;
  displayStatusCode?: 'signing' | 'signed' | 'active' | 'graduated' | 'refunded' | string;
  displayStatus?: string;
  enrolledCourses?: string[];
  intendedCourses?: string[];
  leadSource?: string | null;
  createdByName?: string | null;
  courseAmount?: number | null;
  courseAmountYuan?: number | null;
  serviceFeeAmount?: number | null;
  serviceFeeAmountYuan?: number | null;
  isGraduated?: boolean;
  paymentEnabled?: boolean;
  paymentStatus?: string;
  esignContractNo?: string;
  pendingApprovalId?: string;
  createdAt?: string;
}

export interface TrainingOrderDetail {
  contract: Record<string, unknown>;
  lead?: Record<string, unknown> | null;
  view: {
    id: string;
    contractNumber?: string;
    header: { displayStatusCode: string; displayStatus: string; paymentEnabled: boolean };
    basicInfo: { contractNumber?: string; contractType?: string; displayStatus: string; signDate?: string | null; createdAt?: string | null };
    studentInfo: { customerName?: string; customerPhone?: string; customerIdCard?: string | null; customerAddress?: string | null; consultPosition?: string | null };
    costInfo: { courseAmountText?: string; serviceFeeAmountText?: string; totalText?: string; paymentStatusText?: string; paymentAmountText?: string; paidAt?: string | null; showPaymentAmount?: boolean; showRefundInfo?: boolean; refundedAtFmt?: string | null };
    enrolledCourses: string[];
    esign: { esignContractNo?: string | null; esignCompleted?: boolean; signUrls: TrainingOrderSignUrl[]; contractFileUrl?: string | null };
    terminal: { graduatedAtFmt?: string | null; refundedAtFmt?: string | null };
    createdBy: { name?: string | null };
    leadSource?: string | null;
    actions: { canSyncEsign: boolean; canGraduate: boolean; canRefund: boolean };
  };
}

export interface TrainingOrderSignUrl {
  name?: string;
  mobile?: string;
  role?: string;
  signUrl?: string;
  status?: number;
  statusText?: string;
}

// ── 培训班级/开班 ───────────────────────────────
export interface TrainingClass {
  _id?: string;
  id?: string;
  name?: string;
  trainerName?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  memberCount?: number;
  createdAt?: string;
}

// ── 课程 ────────────────────────────────────────
export interface Course {
  _id?: string;
  id?: string;
  title?: string;
  name?: string;
  category?: string;
  status?: string;
  duration?: number;
  price?: number;
  createdAt?: string;
}

// ── 接单大厅订单 ────────────────────────────────
export interface OrderHallOrder {
  _id: string;
  orderNo?: string;
  serviceType: string;
  title?: string;
  salaryBudget?: number;
  salaryText?: string;
  area?: string;
  address?: string;
  workContent?: string;
  expectedStartDate?: string;
  status: string;
  grabCount: number;
  publishedAt?: string;
  createdAt?: string;
}

export interface OrderGrab {
  _id: string;
  orderId: string;
  auntName: string;
  auntPhone: string;
  status: string;
  remark?: string;
  createdAt?: string;
}

// ── 推荐返费 ────────────────────────────────────
export interface ReferralResume {
  _id?: string;
  id?: string;
  name?: string;
  phone?: string;
  idCard?: string;
  serviceType?: string;
  experience?: string;
  remark?: string;
  referrerPhone?: string;
  status?: string;
  /** 兼容旧推荐列表字段，新的审核流程使用 reviewStatus/reviewNote。 */
  reviewResult?: string;
  reviewStatus?: 'pending_review' | 'approved' | 'rejected' | 'activated' | string;
  reviewDeadlineAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  referrerName?: string;
  assignedStaffId?: string;
  assignedStaffName?: string | null;
  contractId?: string;
  contractSignedAt?: string;
  onboardedAt?: string;
  serviceFee?: number;
  rewardAmount?: number;
  rewardExpectedAt?: string;
  rewardPaidAt?: string;
  rewardStatus?: string;
  payeeName?: string;
  payeePhone?: string;
  bankCard?: string;
  bankName?: string;
  linkedResumeId?: string;
  createdAt?: string;
  contract?: {
    orderNumber?: string;
    orderType?: string;
    serviceFee?: number;
    nannySalary?: number;
    onboardDate?: string;
    contractStartDate?: string;
    contractEndDate?: string;
    createdByName?: string;
  };
}

export interface Referrer {
  _id?: string;
  id?: string;
  name?: string;
  phone?: string;
  wechatId?: string;
  idCard?: string;
  bankCardNumber?: string;
  bankName?: string;
  sourceStaffId?: string;
  sourceStaffName?: string | null;
  approvalStatus?: string;
  rejectedReason?: string;
  totalReferrals?: number;
  onboardedCount?: number;
  totalRewardAmount?: number;
  lastLoginAt?: string;
  referralCount?: number;
  createdAt?: string;
}

// ── 表单 ────────────────────────────────────────
export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldConfig {
  _id?: string;
  label: string;
  fieldName: string;
  fieldType: 'text' | 'textarea' | 'radio' | 'checkbox' | 'select' | 'phone' | 'date' | 'email';
  required?: boolean;
  placeholder?: string;
  options?: FormFieldOption[];
  order?: number;
  validationRule?: string;
  validationMessage?: string;
}

export interface FormUserRef {
  _id?: string;
  name?: string;
  username?: string;
}

export interface FormItem {
  _id?: string;
  id?: string;
  title?: string;
  name?: string;
  description?: string;
  bannerUrl?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  successMessage?: string;
  allowMultipleSubmissions?: boolean;
  submissionCount?: number;
  viewCount?: number;
  fields?: FormFieldConfig[];
  createdAt?: string;
  updatedAt?: string;
  createdBy?: FormUserRef | string;
  updatedBy?: FormUserRef | string;
}

export interface FormStats {
  formId: string;
  title: string;
  viewCount: number;
  submissionCount: number;
  totalSubmissions: number;
  pendingCount: number;
  contactedCount: number;
  completedCount: number;
}

export interface FormShareToken {
  token: string;
  shareUrl: string;
  fullUrl: string;
  expireAt: string;
}

export interface FormSubmission {
  _id?: string;
  id?: string;
  formId?: string | { _id?: string; title?: string };
  data?: Record<string, unknown>;
  source?: 'h5' | 'miniprogram' | 'web';
  ipAddress?: string;
  followUpStatus?: 'pending' | 'contacted' | 'completed';
  followUpNote?: string;
  followUpBy?: FormUserRef | string;
  followUpAt?: string;
  referredBy?: FormUserRef | string;
  createdAt?: string;
  updatedAt?: string;
}

// ── 电子签 ──────────────────────────────────────
export interface EsignContract {
  _id?: string;
  id?: string;
  contractName?: string;
  title?: string;
  status?: string;
  signerName?: string;
  createdAt?: string;
}

// ── 褓贝：文章 / Banner ─────────────────────────
export interface Article {
  _id?: string;
  id?: string;
  title?: string;
  status?: string;
  category?: string;
  viewCount?: number;
  createdAt?: string;
}

export interface Banner {
  _id?: string;
  id?: string;
  title?: string;
  imageUrl?: string;
  status?: string;
  sort?: number;
  createdAt?: string;
}

// ── 角色 / 用户 ─────────────────────────────────
export interface RoleItem {
  _id?: string;
  id?: string;
  code?: string;
  name?: string;
  description?: string;
  permissions?: string[];
  active?: boolean;
  /** 旧版移动端字段，后端当前以 code === admin 判断系统角色。 */
  isSystem?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserItem {
  _id?: string;
  id?: string;
  username?: string;
  name?: string;
  email?: string;
  role?: string;
  roles?: string[];
  phone?: string;
  avatar?: string;
  department?: string;
  permissions?: string[];
  active?: boolean;
  suspended?: boolean;
  monthlyTask?: number;
  lockedByAdmin?: boolean;
  failedLoginAttempts?: number;
  lastLoginAt?: string;
  leftAt?: string;
  /** 旧版列表兼容字段。 */
  status?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
