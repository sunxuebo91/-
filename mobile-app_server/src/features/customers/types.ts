import type { ReactNode } from 'react';

export type CustomerView =
  | { type: 'list' }
  | { type: 'detail'; id: string; openFollowUp?: boolean }
  | { type: 'form'; id?: string; initialValues?: Record<string, unknown> };

export interface CustomerFilters {
  leadLevels?: string[];
  followUpStatuses?: string[];
  leadSources?: string[];
  serviceCategories?: string[];
  customerStates?: string[];
  assignedToIds?: string[];
  isUrgent?: boolean;
  isStarred?: boolean;
  createdStartDate?: string;
  createdEndDate?: string;
}

export interface RecommendedWorker {
  _id: string;
  name: string;
  jobType?: string;
  expectedSalary?: number;
  experienceYears?: number;
}

export interface CustomerFollowUp {
  _id?: string;
  type: string;
  content: string;
  result?: string;
  nextFollowUpDate?: string;
  recommendedWorkerIds?: RecommendedWorker[];
  createdBy?: { _id?: string; name?: string; username?: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface DetailRow {
  label: string;
  value: ReactNode;
  wide?: boolean;
}

export interface AssignableUser {
  _id: string;
  name: string;
  username: string;
  role: string;
}