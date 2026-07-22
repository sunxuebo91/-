import { useCallback, useEffect, useRef, useState } from 'react';
import { Toast } from 'antd-mobile';
import { BellOutline, CloseOutline } from 'antd-mobile-icons';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '../types/notification';
import { notificationSocket } from '../services/notificationSocket';
import { notificationService } from '../services/notificationService';

const HIGH_PRIORITY = new Set([
  'HIGH',
]);

function getTarget(notification: Notification): { path: string; state?: Record<string, string> } | null {
  const data = notification.data || {};
  const actionUrl = notification.actionUrl && notification.actionUrl.startsWith('/')
    ? notification.actionUrl
    : null;
  if (notification.type.startsWith('BACKGROUND_CHECK_')) {
    return data.backgroundCheckId
      ? { path: '/background-check', state: { backgroundCheckId: String(data.backgroundCheckId) } }
      : actionUrl ? { path: actionUrl } : null;
  }
  if (notification.type === 'REFERRAL_NEW_RESUME') return actionUrl ? { path: actionUrl } : { path: '/referral' };
  if (notification.type === 'ORDER_GRABBED') return actionUrl ? { path: actionUrl } : { path: '/order-hall' };
  if (notification.type === 'RESUME_RELEASE_REQUESTED') {
    return data.resumeId
      ? { path: '/resumes', state: { id: String(data.resumeId) } }
      : { path: '/resumes' };
  }
  if (notification.type.startsWith('CONTRACT_APPROVAL_')) {
    if (data.approvalId) return { path: `/approvals?id=${encodeURIComponent(String(data.approvalId))}` };
    return { path: '/approvals?tab=deletion' };
  }
  if (notification.type.startsWith('CONTRACT_') || notification.type === 'CUSTOMER_PAYMENT_RECEIVED') {
    return data.contractId
      ? { path: '/contracts', state: { id: String(data.contractId) } }
      : actionUrl ? { path: actionUrl } : null;
  }
  if (notification.type.startsWith('CUSTOMER_')) {
    return data.customerId
      ? { path: '/customers', state: { id: String(data.customerId) } }
      : actionUrl ? { path: actionUrl } : null;
  }
  if (notification.type.startsWith('RESUME_')) {
    return data.resumeId
      ? { path: '/resumes', state: { id: String(data.resumeId) } }
      : actionUrl ? { path: actionUrl } : null;
  }
  return actionUrl ? { path: actionUrl } : null;
}

export default function PriorityNotificationHost() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<Notification[]>([]);
  const seenIds = useRef(new Set<string>());

  const handleNotification = useCallback((notification: Notification) => {
    if (seenIds.current.has(notification._id)) return;
    seenIds.current.add(notification._id);
    if (window.location.hash.includes('/notifications')) return;

    if (HIGH_PRIORITY.has(notification.priority)) {
      setQueue((current) => current.some((item) => item._id === notification._id)
        ? current
        : [...current, notification]);
      return;
    }

    Toast.show({ content: notification.title, position: 'top' });
  }, []);

  useEffect(() => {
    notificationSocket.onNotification(handleNotification);
    return () => notificationSocket.offNotification(handleNotification);
  }, [handleNotification]);

  const current = queue[0];
  const closeCurrent = () => setQueue((items) => items.slice(1));
  const openCurrent = async () => {
    if (!current) return;
    await notificationService.markAsRead([current._id]);
    const target = getTarget(current);
    closeCurrent();
    if (target) navigate(target.path, { state: target.state });
  };

  if (!current) return null;

  return (
    <div className="priority-notification-mask" role="presentation">
      <section
        className="priority-notification-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="priority-notification-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="priority-notification-accent" />
        <button
          type="button"
          className="priority-notification-close"
          aria-label="关闭"
          onClick={closeCurrent}
        >
          <CloseOutline />
        </button>
        <div className="priority-notification-body">
          <div className="priority-notification-header">
            <div className="priority-notification-icon" aria-hidden="true">
              <BellOutline />
            </div>
            <div className="priority-notification-heading">
              <div className="priority-notification-eyebrow">重点消息</div>
              <div className="priority-notification-subtitle">有一项事项需要及时处理</div>
            </div>
            {queue.length > 1 && (
              <span className="priority-notification-count">1/{queue.length}</span>
            )}
          </div>

          <div className="priority-notification-copy">
            <h2 id="priority-notification-title">{current.title}</h2>
            <div className="priority-notification-content">{current.content}</div>
          </div>
        </div>

        <div className="priority-notification-actions">
          <button type="button" className="priority-notification-button secondary" onClick={closeCurrent}>
            稍后处理
          </button>
          <button type="button" className="priority-notification-button primary" onClick={() => { void openCurrent(); }}>
            {current.actionText || '查看详情'}
          </button>
        </div>
      </section>
    </div>
  );
}