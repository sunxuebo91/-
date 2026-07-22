import api from './api';
import type {
  NotificationQueryDto,
  NotificationListResponse
} from '../types/notification';

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  count?: number;
}

class NotificationService {
  async getNotifications(params: NotificationQueryDto = {}): Promise<NotificationListResponse> {
    try {
      const response = await api.get<any, NotificationListResponse>('/notifications', { params });
      if (response && (response as any).items !== undefined) {
        return response as any;
      } else if (response && (response as any).data && (response as any).data.items) {
        return (response as any).data;
      }
      return { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
    } catch (error) {
      console.error('获取通知列表失败:', error);
      return { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
    }
  }

  async getUnreadCount(): Promise<number> {
    try {
      const response = await api.get<any, any>('/notifications/unread-count');
      return response?.count || response?.data?.count || 0;
    } catch (error) {
      console.error('获取未读数量失败:', error);
      return 0;
    }
  }

  async markAsRead(notificationIds: string[]): Promise<number> {
    try {
      const response = await api.put<any, any>('/notifications/mark-read', {
        notificationIds,
      });
      return response?.count || response?.data?.count || 0;
    } catch (error) {
      console.error('标记已读失败:', error);
      return 0;
    }
  }

  async markAllAsRead(): Promise<number> {
    try {
      const response = await api.put<any, any>('/notifications/mark-all-read');
      return response?.count || response?.data?.count || 0;
    } catch (error) {
      console.error('标记全部已读失败:', error);
      return 0;
    }
  }
}

export const notificationService = new NotificationService();
