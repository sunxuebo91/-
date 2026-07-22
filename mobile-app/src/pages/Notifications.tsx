import { useEffect, useState, useRef } from 'react';
import { NavBar, InfiniteScroll, PullToRefresh, Empty, DotLoading, Toast, Badge } from 'antd-mobile';
import { FileOutline, UserOutline, TeamOutline, MessageOutline, RightOutline, CheckCircleOutline } from 'antd-mobile-icons';
import { useNavigate } from 'react-router-dom';
import { notificationService } from '../services/notificationService';
import { useNotificationStore } from '../stores/notification';
import type { Notification } from '../types/notification';
import { JOB_TYPE_TEXT } from './_shared';

const localizeNotificationContent = (content?: string) =>
  Object.entries(JOB_TYPE_TEXT).reduce(
    (text, [code, label]) => text.replace(new RegExp(`\\b${code}\\b`, 'g'), label),
    content || '',
  );

export default function Notifications() {
  const navigate = useNavigate();
  const [data, setData] = useState<Notification[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null);
  const pageRef = useRef(1);
  const fetchUnreadCount = useNotificationStore((s) => s.fetchUnreadCount);

  const loadMore = async () => {
    try {
      const res = await notificationService.getNotifications({ page: pageRef.current, pageSize: 15 });
      setData((val) => [...val, ...(res.items || [])]);
      setHasMore((res.items?.length || 0) > 0 && pageRef.current < res.totalPages);
      pageRef.current += 1;
    } catch {
      setHasMore(false);
      if (pageRef.current === 1) Toast.show({ icon: 'fail', content: '消息加载失败，请下拉重试' });
    }
  };

  const onRefresh = async () => {
    pageRef.current = 1;
    try {
      const res = await notificationService.getNotifications({ page: 1, pageSize: 15 });
      setData(res.items || []);
      setHasMore((res.items?.length || 0) > 0 && res.totalPages > 1);
      pageRef.current = 2;
    } catch {
      Toast.show({ icon: 'fail', content: '刷新失败，请重试' });
    }
  };

  useEffect(() => {
    // Initial load
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  const handleRead = async (item: Notification) => {
    if (readingId) return;
    if (item.status === 'READ') {
      navigateToTarget(item);
      return;
    }
    try {
      setReadingId(item._id);
      await notificationService.markAsRead([item._id]);
      setData((prev) => prev.map(n => n._id === item._id ? { ...n, status: 'READ' as any } : n));
      fetchUnreadCount();
      navigateToTarget(item);
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '标记已读失败' });
    } finally {
      setReadingId(null);
    }
  };

  const navigateToTarget = (item: Notification) => {
    if (item.type.startsWith('BACKGROUND_CHECK_') && item.data?.backgroundCheckId) {
      navigate('/background-check', { state: { backgroundCheckId: item.data.backgroundCheckId } });
    } else if (item.type === 'REFERRAL_NEW_RESUME') {
      navigate('/referral');
    } else if (item.type === 'ORDER_GRABBED') {
      navigate('/order-hall');
    } else if ((item.type.startsWith('CONTRACT_') || item.type === 'CUSTOMER_PAYMENT_RECEIVED') && item.data?.contractId) {
      navigate('/contracts', { state: { id: item.data.contractId } });
    } else if (item.type.startsWith('CUSTOMER_') && item.data?.customerId) {
      navigate('/customers', { state: { id: item.data.customerId } });
    } else if (item.type.startsWith('RESUME_') && item.data?.resumeId) {
      navigate('/resumes', { state: { id: item.data.resumeId } });
    } else {
      // Just click to read
    }
  };

  const handleMarkAllRead = async () => {
    if (markingAll) return;
    try {
      setMarkingAll(true);
      await notificationService.markAllAsRead();
      setData((prev) => prev.map(n => ({ ...n, status: 'READ' as any })));
      fetchUnreadCount();
      Toast.show({ icon: 'success', content: '全部已读' });
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error?.response?.data?.message || error?.message || '操作失败' });
    } finally {
      setMarkingAll(false);
    }
  };

  const getIcon = (type: string) => {
    if (type.startsWith('CONTRACT_')) return <FileOutline style={{ color: '#1677ff' }} />;
    if (type.startsWith('CUSTOMER_')) return <UserOutline style={{ color: '#ff8f1f' }} />;
    if (type.startsWith('RESUME_')) return <TeamOutline style={{ color: '#00b578' }} />;
    return <MessageOutline style={{ color: '#1677ff' }} />;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'flex', flexDirection: 'column' }}>
      <NavBar
        onBack={() => navigate(-1)}
        className="notifications-navbar"
        style={{ background: '#fff', position: 'sticky', top: 0, zIndex: 10, fontWeight: 600 }}
        right={<div className="notifications-mark-all" onClick={handleMarkAllRead} aria-disabled={markingAll}><CheckCircleOutline />{markingAll ? '处理中…' : '全部已读'}</div>}
      >
        消息中心
      </NavBar>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <PullToRefresh onRefresh={onRefresh}>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.map((item) => {
              const isUnread = item.status !== 'READ';
              return (
                <div
                  key={item._id}
                  onClick={() => handleRead(item)}
                  style={{
                    background: '#fff',
                    borderRadius: 12,
                    padding: 16,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    position: 'relative',
                    opacity: readingId === item._id ? 0.55 : isUnread ? 1 : 0.7,
                    pointerEvents: readingId ? 'none' : 'auto',
                    transition: 'opacity 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
                      }}>
                        {getIcon(item.type)}
                      </div>
                      <div style={{ fontWeight: isUnread ? 600 : 500, color: '#1a1a1a', fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {item.title}
                        {isUnread && <Badge content={Badge.dot} style={{ '--color': '#ff3141' }} />}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: '#999', paddingTop: 4 }}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ color: '#666', fontSize: 14, lineHeight: 1.6, paddingLeft: 40, paddingRight: 16 }}>
                    {localizeNotificationContent(item.content)}
                  </div>
                  <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: 14 }}>
                    <RightOutline />
                  </div>
                </div>
              );
            })}
          </div>
          {data.length === 0 && !hasMore && (
            <Empty description="暂无消息通知" style={{ padding: '60px 0' }} />
          )}
          <InfiniteScroll loadMore={loadMore} hasMore={hasMore}>
            {hasMore ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}><DotLoading /></div>
            ) : data.length > 0 ? (
              <div style={{ textAlign: 'center', color: '#999', padding: '10px 0', fontSize: 13 }}>没有更多了</div>
            ) : null}
          </InfiniteScroll>
        </PullToRefresh>
      </div>
    </div>
  );
}
