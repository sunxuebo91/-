export type FinanceType = 'income' | 'expense';

export interface FinanceRecord {
  _id: string;
  type: FinanceType;
  categoryId: string;
  categoryName: string;
  projectName: string;
  amount: number;
  ownerId: string;
  ownerName: string;
  occurredAt: string;
  remark?: string;
  source: 'manual' | 'system';
  sourceType?: string;
  isSystemSynced: boolean;
  manuallyEdited: boolean;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceRecordList {
  items: FinanceRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  profit: number;
}

export interface FinanceCategory {
  _id: string;
  name: string;
  type: FinanceType;
  isSystem: boolean;
  active: boolean;
  sortOrder: number;
}

export interface FinanceOwner {
  _id: string;
  name?: string;
  username?: string;
}

export interface FinanceRecordQuery {
  type?: FinanceType;
  categoryId?: string;
  ownerId?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface FinanceRecordInput {
  type: FinanceType;
  categoryId: string;
  projectName: string;
  amount: number;
  ownerId: string;
  occurredAt: string;
  remark?: string;
}