// 通用 API 响应与分页类型

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
  timestamp?: string;
}

export interface Paginated<T> {
  items?: T[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
}

export interface PageQuery {
  page?: number;
  limit?: number;
  search?: string;
}
