export type NotificationType =
  | 'RESUME_CREATED'
  | 'RESUME_ASSIGNED'
  | 'RESUME_STATUS_CHANGED'
  | 'RESUME_ORDER_STATUS_CHANGED'
  | 'RESUME_FOLLOW_UP_DUE'
  | 'RESUME_RELEASE_REQUESTED'
  | 'CUSTOMER_CREATED'
  | 'CUSTOMER_ASSIGNED'
  | 'CUSTOMER_TRANSFERRED'
  | 'CUSTOMER_RECLAIMED'
  | 'CUSTOMER_ASSIGNED_FROM_POOL'
  | 'CUSTOMER_STATUS_CHANGED'
  | 'CUSTOMER_FOLLOW_UP_DUE'
  | 'CUSTOMER_PAYMENT_RECEIVED'
  | 'CONTRACT_CREATED'
  | 'CONTRACT_SIGNED'
  | 'CONTRACT_WORKER_CHANGED'
  | 'CONTRACT_EXPIRING_SOON'
  | 'CONTRACT_STATUS_CHANGED'
  | 'CONTRACT_APPROVAL_REQUESTED'
  | 'CONTRACT_APPROVAL_APPROVED'
  | 'CONTRACT_APPROVAL_REJECTED'
  | 'CONTRACT_NANNY_UNSIGNED_REMINDER'
  | 'CONTRACT_CUSTOMER_UNSIGNED_REMINDER'
  | 'CONTRACT_INSURANCE_EXPIRING_SOON'
  | 'CONTRACT_INSURANCE_CHANGE_SUCCESS'
  | 'CUSTOMER_LEAD_NEW_NOT_FOLLOWED_UP'
  | 'CUSTOMER_LEAD_TRANSFERRED_NOT_FOLLOWED_UP'
  | 'FORM_SUBMISSION_RECEIVED'
  | 'FORM_SUBMISSION_RECEIVED_ADMIN'
  | 'LOGIN_FROM_NEW_IP'
  | 'BACKGROUND_CHECK_AUTHORIZED'
  | 'BACKGROUND_CHECK_COMPLETED'
  | 'BACKGROUND_CHECK_RISK'
  | 'BACKGROUND_CHECK_FAILED'
  | 'REFERRAL_NEW_RESUME'
  | 'ORDER_GRABBED'
  | 'DAILY_REPORT_PERSONAL'
  | 'DAILY_REPORT_TEAM'
  | 'WEEKLY_REPORT'
  | 'MONTHLY_REPORT'
  | 'SYSTEM_ANNOUNCEMENT'
  | 'PERMISSION_CHANGED'
  | 'ACCOUNT_SECURITY';

export type NotificationPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type NotificationStatus = 'PENDING' | 'SENT' | 'READ' | 'FAILED';

export interface Notification {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  priority: NotificationPriority;
  status: NotificationStatus;
  data?: Record<string, any>;
  icon?: string;
  color?: string;
  actionUrl?: string;
  actionText?: string;
  sentAt?: string;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationQueryDto {
  page?: number;
  pageSize?: number;
  type?: NotificationType;
  status?: NotificationStatus;
  startDate?: string;
  endDate?: string;
}

export interface NotificationListResponse {
  items: Notification[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
