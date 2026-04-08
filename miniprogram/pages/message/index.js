const userService = require('../../services/userService.js');
const notificationService = require('../../services/notificationService.js');

// 每种通知类型的展示配置
const TYPE_CONFIG = {
  contract_invite:  { emoji: '📄', color: '#5B8DEF', title: '您有一份合同待签署' },
  contract_signed:  { emoji: '✅', color: '#52c41a', title: '已签约', content: '您的服务合同已签署完成，点击查看详情' },
  payment_done:     { emoji: '💰', color: '#fa8c16', title: '付款成功' },
  nanny_confirmed:  { emoji: '🏠', color: '#8766F3', title: '阿姨已确认上户' },
  contract_expiring:{ emoji: '⚠️', color: '#f5222d', title: '合同即将到期' },
};

/** 格式化通知时间 */
function formatTime(isoStr) {
  if (!isoStr) return '';
  const now = new Date();
  const d = new Date(isoStr);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yestStart  = new Date(todayStart.getTime() - 86400000);
  const dStart     = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (dStart.getTime() === todayStart.getTime()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } else if (dStart.getTime() === yestStart.getTime()) {
    return '昨天';
  } else if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 跳转路径（根据通知类型）*/
function resolveNavUrl(type, contractId) {
  if (contractId) return `/pages/myOrders/index`;
  return null;
}

Page({
  data: {
    messages: [],
    unreadCount: 0,
    loading: true,
    isLoggedIn: false,
  },

  onLoad() {
    this.refreshLoginStatus();
    this.loadMessages();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.refreshLoginStatus();
    this.loadMessages();
    this.checkPendingContact();
  },

  // ─── 加载通知列表 ───────────────────────────────────
  async loadMessages() {
    if (!this.isLoggedIn()) {
      console.log('[message] 未登录，跳过加载');
      this.setData({ loading: false, messages: [] });
      return;
    }
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const phone = crmUserInfo.phone;
    console.log('[message] crmUserInfo.phone =', phone || '(空)');
    if (!phone) {
      console.warn('[message] 手机号为空，无法拉取通知');
      this.setData({ loading: false });
      return;
    }

    this.setData({ loading: true });
    try {
      console.log('[message] 开始拉取通知，phone =', phone);
      const data = await notificationService.getList(phone);
      console.log('[message] 拉取成功，total =', data.total, 'unread =', data.unreadCount);
      // 已签约的 contractId 集合（用于隐藏已过期的"去签署"按钮）
      const signedContractIds = new Set(
        (data.list || [])
          .filter(n => n.type === 'contract_signed' && n.contractId)
          .map(n => n.contractId)
      );

      const messages = (data.list || []).map(n => {
        const cfg = TYPE_CONFIG[n.type] || { emoji: '🔔', color: '#999' };
        // "去签署"仅在合同尚未签约时显示
        const showSignBtn = n.type === 'contract_invite'
          && !signedContractIds.has(n.contractId);
        return {
          id: n._id || n.id || '',
          type: n.type,
          title: cfg.title || n.title,
          content: cfg.content || (
            n.type === 'nanny_confirmed'
              ? n.content.replace('，祝您服务顺心', '，有问题请您及时联系顾问')
              : n.content
          ),
          contractId: n.contractId || '',
          read: n.isRead,
          time: formatTime(n.createdAt),
          emoji: cfg.emoji,
          color: cfg.color,
          showSignBtn,
        };
      });
      this.setData({ messages, unreadCount: data.unreadCount || 0, loading: false });
      // 同步更新 tabBar 红点
      this._syncTabBarBadge(data.unreadCount || 0);
    } catch (e) {
      console.error('[message] loadMessages error:', e);
      this.setData({ loading: false });
    }
  },

  // ─── 标记单条已读 ────────────────────────────────────
  async onMessageTap(e) {
    const { id, contractid, read } = e.currentTarget.dataset;
    const isRead = read === true || read === 'true';
    if (!isRead) {
      const messages = this.data.messages.map(m =>
        String(m.id) === String(id) ? { ...m, read: true } : m
      );
      const unreadCount = Math.max(0, this.data.unreadCount - 1);
      this.setData({ messages, unreadCount });
      this._syncTabBarBadge(unreadCount);
      // 必须等后端标记完，再跳转——否则返回时 onShow 会拉到旧的未读数据
      const phone = wx.getStorageSync('crmUserInfo')?.phone;
      if (phone) {
        try { await notificationService.markRead(phone, id); } catch (_) {}
      }
    }
    // 跳转
    const url = resolveNavUrl(e.currentTarget.dataset.type, contractid);
    if (url) wx.navigateTo({ url });
  },

  // ─── 合同邀请：去签署按钮 ────────────────────────────────
  async onActionBtnTap(e) {
    const { id, contractid, type, read } = e.currentTarget.dataset;
    // 标记已读（dataset 会把 false 序列化成字符串，需显式判断）
    const isRead = read === true || read === 'true';
    const phone = wx.getStorageSync('crmUserInfo')?.phone;
    if (phone && id) {
      const messages = this.data.messages.map(m =>
        m.id === id ? { ...m, read: true } : m
      );
      const unreadCount = isRead ? this.data.unreadCount : Math.max(0, this.data.unreadCount - 1);
      this.setData({ messages, unreadCount });
      this._syncTabBarBadge(unreadCount);
      if (!isRead) {
        try { await notificationService.markRead(phone, id); } catch (_) {}
      }
    }
    // 跳转合同页
    wx.navigateTo({ url: '/pages/myOrders/index' });
  },

  // ─── 全部已读 ─────────────────────────────────────────
  async onMarkAllRead() {
    if (this.data.unreadCount === 0) return;
    const phone = wx.getStorageSync('crmUserInfo')?.phone;
    if (!phone) return;
    const messages = this.data.messages.map(m => ({ ...m, read: true }));
    this.setData({ messages, unreadCount: 0 });
    this._syncTabBarBadge(0);
    notificationService.markAllRead(phone).catch(() => {});
  },

  // ─── tabBar 红点 ──────────────────────────────────────
  _syncTabBarBadge(count) {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ messageBadge: count });
    }
  },

  // ─── 联系客服 ─────────────────────────────────────────
  onContactTap() {
    if (!this.isLoggedIn()) {
      wx.setStorageSync('pendingContact', '1');
      wx.showToast({ title: '请先登录后联系客服', icon: 'none' });
      wx.navigateTo({ url: '/pages/login/index' });
      return;
    }
    this.setData({ isLoggedIn: true });
  },

  handleContact(e) { console.log('客服消息回调:', e.detail); },

  refreshLoginStatus() {
    const loggedIn = this.isLoggedIn();
    if (loggedIn !== this.data.isLoggedIn) this.setData({ isLoggedIn: loggedIn });
  },

  isLoggedIn() { return userService.isLoggedIn(); },

  checkPendingContact() {
    const pending = wx.getStorageSync('pendingContact');
    if (pending && this.isLoggedIn()) {
      wx.removeStorageSync('pendingContact');
      this.setData({ isLoggedIn: true });
      wx.showToast({ title: '登录成功，请点击联系客服进入客服', icon: 'none' });
    }
  },
});
