// 简历类型（移动端），与 /resumes 及其关联端点保持一致。

export type ResumeFileType =
  | 'idCardFront' | 'idCardBack' | 'personalPhoto' | 'certificate'
  | 'medicalReport' | 'selfIntroductionVideo' | 'confinementMealPhoto'
  | 'cookingPhoto' | 'complementaryFoodPhoto' | 'positiveReviewPhoto';

export type AvailabilityStatus = 'unset' | 'available' | 'unavailable' | 'occupied' | 'leave';
export type BlacklistReasonType = 'fraud' | 'serious_complaint' | 'work_quality' | 'contract_breach' | 'other';
export type BlacklistSourceType = 'resume' | 'referral' | 'manual';

export interface ResumeFileObject {
  url: string;
  filename?: string;
  size?: number;
  mimetype?: string;
}

export interface ResumeWorkExperience {
  startDate: string;
  endDate: string;
  description: string;
  company?: string;
  position?: string;
  orderNumber?: string;
  district?: string;
  customerName?: string;
  customerReview?: string;
  jobType?: string;
  photos?: ResumeFileObject[];
}

export interface MedicalReportAnalysis {
  pageCount: number;
  model: string;
  analyzedAt: string;
  [key: string]: unknown;
}

export interface AvailabilityPeriod {
  date: string;
  status: AvailabilityStatus;
  contractId?: string;
  remarks?: string;
}

export interface ResumeStaffReference {
  _id?: string;
  id?: string;
  name?: string;
  username?: string;
}

export interface Resume {
  _id?: string;
  id?: string;
  name: string;
  phone: string;
  age?: number;
  wechat?: string;
  idNumber?: string;
  education?: string;
  nativePlace?: string;
  experienceYears?: number;
  maritalStatus?: string;
  religion?: string;
  ethnicity?: string;
  birthDate?: string;
  zodiac?: string;
  zodiacSign?: string;
  gender?: string;
  height?: number;
  weight?: number;
  jobType?: string;
  expectedSalary?: number;
  serviceArea?: string[];
  orderStatus?: string;
  skills?: string[];
  leadSource?: string;
  source?: string;
  currentAddress?: string;
  hukouAddress?: string;
  workExperiences?: ResumeWorkExperience[];
  idCardFront?: ResumeFileObject;
  idCardBack?: ResumeFileObject;
  personalPhoto?: ResumeFileObject[] | ResumeFileObject;
  photoUrls?: string[];
  certificates?: ResumeFileObject[];
  certificateUrls?: string[];
  reports?: ResumeFileObject[];
  medicalReportUrls?: string[];
  confinementMealPhotos?: ResumeFileObject[];
  cookingPhotos?: ResumeFileObject[];
  complementaryFoodPhotos?: ResumeFileObject[];
  positiveReviewPhotos?: ResumeFileObject[];
  selfIntroductionVideo?: ResumeFileObject;
  selfIntroduction?: string;
  medicalExamDate?: string;
  medicalReportSummary?: MedicalReportAnalysis;
  availabilityCalendar?: AvailabilityPeriod[];
  isDraft?: boolean;
  isHidden?: boolean;
  releasedForContract?: boolean;
  releasedAt?: string;
  assignedTo?: string | ResumeStaffReference;
  assignedAt?: string;
  userId?: string;
  ownerStaffId?: string;
  ownerStaffName?: string;
  internalEvaluation?: string;
  recommendationReason?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ResumePage {
  items: Resume[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ResumeQuery {
  page?: number;
  pageSize?: number;
  limit?: number;
  search?: string;
  keyword?: string;
  jobType?: string;
  orderStatus?: string;
  maxAge?: number;
  nativePlace?: string;
  ethnicity?: string;
  gender?: string;
  expectedSalary?: number;
  minExpectedSalary?: number;
  maxExpectedSalary?: number;
  isDraft?: boolean | string;
  createdBy?: string;
  source?: string;
  visibility?: string;
  includeBlacklisted?: boolean;
}

export interface ResumeFilterOptions {
  nativePlaces: string[];
  ethnicities: string[];
}

export interface ResumeCreator {
  _id?: string;
  id?: string;
  name?: string;
  username?: string;
  phone?: string;
  [key: string]: unknown;
}

export interface ResumeEnumOption {
  value: string;
  label: string;
}

export interface ResumeEnums {
  gender: ResumeEnumOption[];
  jobType: ResumeEnumOption[];
  education: ResumeEnumOption[];
  skills: ResumeEnumOption[];
  maritalStatus: ResumeEnumOption[];
  religion: ResumeEnumOption[];
  zodiac: ResumeEnumOption[];
  zodiacSign: ResumeEnumOption[];
  orderStatus: ResumeEnumOption[];
  leadSource: ResumeEnumOption[];
  maternityNurseLevel: ResumeEnumOption[];
  fileTypes: ResumeEnumOption[];
}

export interface ResumeContract {
  _id: string;
  contractNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerServiceFee?: number;
  serviceFeeAmount?: number;
  courseAmount?: number;
  contractStatus?: string;
  paymentStatus?: string;
  esignSignedAt?: string;
  createdAt?: string;
  customerId?: string;
  replacesContractId?: string;
}

export interface ResumeContractsResponse {
  success: boolean;
  data: ResumeContract[] | null;
  total: number;
  message?: string;
}

export interface ResumeOperationLog {
  _id?: string;
  resumeId: string;
  entityType: 'resume' | 'file' | 'system';
  entityId: string;
  operationType: string;
  operationName: string;
  details?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    description?: string;
    relatedId?: string;
    relatedType?: string;
  };
  operator?: ResumeCreator;
  operatedAt: string;
  requestId?: string;
}

export interface ReleaseForContractResult {
  alreadyReleased: boolean;
  releasedAt: string | null;
}

export interface DeleteResumeFileRequest {
  fileUrl: string;
  fileType: ResumeFileType;
}

export interface DeleteResumeFileResult {
  resumeId: string;
  deletedFileUrl: string;
  fileType: ResumeFileType;
}

export interface ResumeAvailability {
  resumeId: string;
  name: string;
  jobType: string;
  availabilityCalendar: AvailabilityPeriod[];
}

export interface UpdateAvailabilityRequest {
  startDate: string;
  endDate: string;
  status: AvailabilityStatus;
  contractId?: string;
  remarks?: string;
}

export interface AvailabilityQuery {
  startDate?: string;
  endDate?: string;
  status?: AvailabilityStatus;
  [key: string]: unknown;
}

export interface BatchUpdateAvailabilityRequest {
  dates: string[];
  status: AvailabilityStatus;
  contractId?: string;
  remarks?: string;
}

export interface AvailabilityMutationResult {
  updated?: number;
  deleted?: number;
  message: string;
}

export interface BackgroundCheckStatus {
  hasInsurance: boolean;
  hasBackgroundCheck: boolean;
  latestInsurance: Record<string, unknown> | null;
  latestBackgroundCheck: Record<string, unknown> | null;
}

export interface BlacklistEvidence extends ResumeFileObject {}

export interface CreateBlacklistRequest {
  name: string;
  reason: string;
  reasonType: BlacklistReasonType;
  phone?: string;
  idCard?: string;
  evidence?: BlacklistEvidence[];
  sourceType?: BlacklistSourceType;
  sourceResumeId?: string;
  sourceReferralResumeId?: string;
  remarks?: string;
}

export interface BlacklistCheckResult {
  hit: boolean;
  id?: string;
  name?: string;
  reason?: string;
  reasonType?: BlacklistReasonType;
  createdAt?: string;
}

export interface BlacklistRecord extends CreateBlacklistRequest {
  _id?: string;
  status: 'active' | 'released';
  operatorId?: string;
  operatorName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DuplicateCheckRequest {
  name?: string;
  phone?: string;
  idNumber?: string;
  jobType?: string;
  nativePlace?: string;
  ethnicity?: string;
  gender?: string;
  age?: number;
  experienceYears?: number;
  skills?: string[];
  serviceArea?: string[];
  excludeId?: string;
  threshold?: number;
  limit?: number;
}

export interface DuplicateCandidate {
  resume?: Resume;
  similarity?: number;
  matchedFields?: string[];
  [key: string]: unknown;
}

export interface DuplicateCheckResult {
  suspects: DuplicateCandidate[];
  count: number;
}
