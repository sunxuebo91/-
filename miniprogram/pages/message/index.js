const userService = require('../../services/userService.js');
const notificationService = require('../../services/notificationService.js');

// 每种通知类型的展示配置
// actionBtn  存在时在通知卡右上角显示操作按钮
// navUrl     点击卡片或操作按钮时的跳转路径
const TYPE_CONFIG = {
  // ── 合同 / 订单相关 ──────────────────────────────────────────────────
  contract_invite:       { emoji: '📄', color: '#5B8DEF', title: '您有一份合同待签署',  actionBtn: '去签署 →', navUrl: '/pages/myOrders/index' },
  contract_signed:       { emoji: '✅', color: '#52c41a', title: '已签约',              content: '您的服务合同已签署完成，点击查看详情', navUrl: '/pages/myOrders/index' },
  payment_done:          { emoji: '💰', color: '#fa8c16', title: '付款成功',            navUrl: '/pages/myOrders/index' },
  nanny_confirmed:       { emoji: '🏠', color: '#8766F3', title: '阿姨已确认上户',      navUrl: '/pages/myOrders/index' },
  contract_expiring:     { emoji: '⚠️', color: '#f5222d', title: '合同即将到期',        navUrl: '/pages/myOrders/index' },
  // ── 推荐相关 ──────────────────────────────────────────────────────────
  referral_submitted:    { emoji: '📋', color: '#8766F3', title: '新推荐简历待审核',      actionBtn: '去审核 →', navUrl: '/pages/admin/referralReview/index' },
  referral_new_referrer: { emoji: '👤', color: '#5B8DEF', title: '新推荐人申请待审批',    actionBtn: '去审批 →', navUrl: '/pages/admin/referralManage/index' },
  referral_approved:     { emoji: '✅', color: '#52c41a', title: '推荐官申请已通过',      navUrl: '/pages/myReferrals/index' },
  referral_rejected:     { emoji: '❌', color: '#f5222d', title: '推荐官申请未通过' },
  referral_review_result:{ emoji: '📝', color: '#8766F3', title: '推荐简历审核结果',      navUrl: '/pages/myReferrals/index' },
  referral_reassigned:   { emoji: '🔄', color: '#fa8c16', title: '推荐记录已重新分配',    actionBtn: '去查看 →', navUrl: '/pages/admin/referralReview/index' },
  referral_timeout:      { emoji: '⏰', color: '#f5222d', title: '推荐简历审核超时流转',  actionBtn: '去处理 →', navUrl: '/pages/admin/referralReview/index' },
  referral_contracted:   { emoji: '🎉', color: '#fa8c16', title: '推荐阿姨已成功签单',   navUrl: '/pages/myReferrals/index' },
  referral_reward_paid:  { emoji: '💸', color: '#52c41a', title: '推荐返费已到账',        navUrl: '/pages/myReferrals/index' },
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

/** 跳转路径（根据通知类型，TYPE_CONFIG.navUrl 优先）*/
function resolveNavUrl(type, contractId) {
  const cfg = TYPE_CONFIG[type];
  if (cfg && cfg.navUrl) return cfg.navUrl;
  if (contractId) return '/pages/myOrders/index';
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
        // 显示操作按钮的条件：
        // 合同邀请：合同尚未签约时显示"去签署"
        // 推荐类型：有 actionBtn 配置时显示对应操作按钮
        const showActionBtn = (n.type === 'contract_invite' && !signedContractIds.has(n.contractId))
          || (!!cfg.actionBtn && n.type !== 'contract_invite');
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
          showActionBtn,
          actionBtnText: cfg.actionBtn || '',  // 按钮文案，如"去审核 →"
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

  // ─── 操作按钮（去签署 / 去审核 / 去审批等）───────────────
  async onActionBtnTap(e) {
    const { id, contractid, type, read } = e.currentTarget.dataset;
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
    // 按类型跳转到对应功能页（合同/推荐审核/推荐审批等）
    const url = resolveNavUrl(type, contractid);
    if (url) wx.navigateTo({ url });
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
