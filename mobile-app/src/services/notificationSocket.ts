import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth';
import { useNotificationStore } from '../stores/notification';
import type { Notification } from '../types/notification';

class NotificationSocket {
  private socket: Socket | null = null;
  private notificationListeners = new Set<(notification: Notification) => void>();

  connect() {
    if (this.socket?.connected) return;

    const token = useAuthStore.getState().token;
    if (!token) return;

    const baseURL = import.meta.env.VITE_API_BASE || 'https://crm.andejiazheng.com/api';
    const socketURL = baseURL.replace('/api', '') || window.location.origin;

    this.socket = io(`${socketURL}/notifications`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    this.socket.on('connect', () => {
      console.log('Mobile Notification Socket Connected');
      useNotificationStore.getState().fetchUnreadCount();
    });

    this.socket.on('notification', (notification: Notification) => {
      console.log('Mobile received notification:', notification);
      useNotificationStore.getState().incrementUnreadCount();
      this.notificationListeners.forEach((listener) => listener(notification));
    });

    this.socket.on('unreadCount', (count: number) => {
      useNotificationStore.getState().setUnreadCount(count);
    });

    this.socket.on('disconnect', () => {
      console.log('Mobile Notification Socket Disconnected');
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  onNotification(listener: (notification: Notification) => void) {
    this.notificationListeners.add(listener);
  }

  offNotification(listener: (notification: Notification) => void) {
    this.notificationListeners.delete(listener);
  }
}

export const notificationSocket = new NotificationSocket();
