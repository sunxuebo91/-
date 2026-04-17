const userService = require('../../services/userService.js');

const RESUME_VIEW_TEMPLATE_ID = 'VXhA_qhgIRRy8avH1X9uE-eLGk--0M5Bs9Q27EEDmrM';

Page({
  data: {
    me: {
      nickname: "",
      avatarUrl: "",
    },
    isLoggedIn: false,
    showSubscribeBanner: false,  // 是否显示订阅提醒横幅
    referralLabel: '推荐有礼',   // 推荐入口文案（按角色变化）
    referralBadge: 0,            // 推荐角标数量（员工/管理员待处理数）
  },

  onShow() {
    // ⚠️ 不在 Tab 页的 onShow() 里强制跳转登录
    // 否则用户从登录页返回后 onShow 再次触发，造成无限重定向死循环
    // 违反微信「点击取消/返回必须有效」的登录规范
    // 未登录时页面显示"立即登录"占位，引导用户主动点击登录

    // 更新自定义 tabBar 选中状态（我的现在是索引2）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 2
      });
    }
    this.loadMe().then(() => {
      // loadMe 完成后，检查员工是否需要订阅提醒
      this.checkSubscribeBanner();
    });
    this.refreshLoginStatus();
    this.checkPendingContact();
  },


  async loadMe() {
    try {
      const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
      const openid = crmUserInfo.openid || crmUserInfo._openid || '';

      let serverMe = {};

      if (openid) {
        // 主链路：CRM GET /info（权威来源）
        try {
          const crmRes = await new Promise((resolve, reject) => {
            wx.request({
              url: `https://crm.andejiazheng.com/api/miniprogram-users/info?openid=${openid}`,
              method: 'GET',
              success: resolve,
              fail: reject,
            });
          });
          if (crmRes.data && crmRes.data.success && crmRes.data.data) {
            const d = crmRes.data.data;
            serverMe = {
              nickname:  d.nickname || '',
              avatarUrl: d.avatar   || '',   // CRM 字段 avatar → 前端 avatarUrl
              phone:     d.phone    || '',
              isStaff:   !!d.isStaff,
              // 角色：CRM 直接返回 role 最优先；否则从 isAdmin/isStaff 推断
              role: d.role || (d.isAdmin ? 'admin' : d.isStaff ? 'staff' : null),
            };
            console.log('✅ CRM profile loadMe:', serverMe);
          }
        } catch (e) {
          console.warn('⚠️ CRM /info 失败，降级到微信云函数:', e);
        }
      }

      // 兜底：wx 云函数
      if (!serverMe.phone && !serverMe.nickname) {
        const resp = await wx.cloud.callFunction({
          name: 'userService',
          data: { action: 'getOrCreateMe' },
        });
        const wxMe = (resp.result && resp.result.data) || {};
        serverMe = {
          nickname:  wxMe.nickname  || crmUserInfo.nickname  || '',
          avatarUrl: wxMe.avatarUrl || crmUserInfo.avatarUrl || crmUserInfo.avatar || '',
          phone:     wxMe.phone     || crmUserInfo.phone     || '',
          isStaff:   crmUserInfo.isStaff || false,
          // 云函数 getOrCreateMe 现已返回 role（customer/referrer/staff/admin）
          role: wxMe.role || (crmUserInfo.isStaff ? 'staff' : null),
        };
        console.log('✅ 云函数 profile loadMe 兜底:', serverMe);
      }

      const phone = serverMe.phone || '';
      const mergedMe = { ...this.data.me, ...serverMe };

      // 员工：crmName / crmAvatar 优先展示（CRM 管理员维护的真实信息）
      if (crmUserInfo.crmName)   mergedMe.nickname  = crmUserInfo.crmName;
      if (crmUserInfo.crmAvatar) mergedMe.avatarUrl = crmUserInfo.crmAvatar;

      this.setData({ me: mergedMe });
      console.log('✅ 合并后的用户信息:', mergedMe);

      // 推荐入口：按角色派生标签，异步加载角标
      // referrer / 推荐官 → 推荐有礼；staff → 推荐审核；admin → 推荐管理
      const REFERRAL_LABELS = {
        'referrer':  '推荐有礼',
        '推荐官':    '推荐有礼',
        'staff':     '推荐审核',
        'admin':     '推荐管理',
      };
      const role = mergedMe.role || 'customer';
      this.setData({ referralLabel: REFERRAL_LABELS[role] || '推荐有礼' });
      this.loadReferralBadge(role);

      // 有手机号就调 staff/info，静默刷新员工姓名/头像
      if (phone) {
        wx.request({
          url: `https://crm.andejiazheng.com/api/resumes/staff/info?phone=${phone}`,
          method: 'GET',
          success: (res) => {
            if (res.data && res.data.success && res.data.data) {
              const staffData = res.data.data;
              const latest = wx.getStorageSync('crmUserInfo') || {};
              latest.isStaff  = true;
              latest.crmName  = staffData.name   || latest.crmName  || '';
              latest.crmAvatar = staffData.avatar || latest.crmAvatar || '';
              wx.setStorageSync('crmUserInfo', latest);
              this.setData({ 'me.nickname': latest.crmName, 'me.avatarUrl': latest.crmAvatar });
              console.log('✅ 员工档案已刷新:', latest.crmName, latest.crmAvatar);
            }
          },
          fail: () => {}
        });
      }
    } catch (e) {
      console.error('❌ 加载用户信息失败:', e);
      const cache = wx.getStorageSync('crmUserInfo') || {};
      if (cache.nickname || cache.phone) {
        this.setData({ me: { ...this.data.me, nickname: cache.crmName || cache.nickname || '', avatarUrl: cache.crmAvatar || cache.avatarUrl || cache.avatar || '', phone: cache.phone || '' } });
      }
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/settings/index" });
  },

  // 点击联系客服：未登录先去登录；已登录由 open-type="contact" 打开客服
  onContactTap() {
    if (!this.isLoggedIn()) {
      wx.setStorageSync('pendingContact', '1');
      wx.showToast({ title: '请先登录后联系客服', icon: 'none' });
      wx.navigateTo({ url: '/pages/login/index' });
      return;
    }

    this.setData({ isLoggedIn: true });
  },


  // 同步登录状态
  refreshLoginStatus() {
    const loggedIn = this.isLoggedIn();
    if (loggedIn !== this.data.isLoggedIn) {
      this.setData({ isLoggedIn: loggedIn });
    }
  },

  isLoggedIn() {
    return userService.isLoggedIn();
  },

  // 登录后提醒用户再点一次（open-type="contact" 无法代码中自动触发）
  checkPendingContact() {
    const pending = wx.getStorageSync('pendingContact');
    if (pending && this.isLoggedIn()) {
      wx.removeStorageSync('pendingContact');
      this.setData({ isLoggedIn: true });
      wx.showToast({ title: '登录成功，请点击联系客服进入客服', icon: 'none' });
    }
  },

  // 小程序客服回调（用户从客服消息进入/返回）
  handleContact(e) {
    console.log('客服消息回调:', e.detail);
  },


  onTapHelp() {
    wx.showToast({ title: "请联系客服", icon: "none" });
  },


  onTapSettings() {
    wx.navigateTo({ url: "/pages/settings/index" });
  },

  goResumeManage() {
    wx.navigateTo({ url: "/pages/admin/resumeManage/index" });
  },

  goBabyDiary() {
    wx.navigateTo({ url: "/pages/babyDiary/list/index" });
  },

  goMyOrders() {
    wx.navigateTo({ url: "/pages/myOrders/index" });
  },

  goPoster() {
    wx.navigateTo({ url: '/pages/posterCustomerList/index' });
  },

  // 推荐入口导航：按角色跳转不同页面
  goReferral() {
    const role = this.data.me.role || 'customer';
    const routes = {
      'referrer': '/pages/myReferrals/index',          // 推荐官：我的推荐记录
      '推荐官':   '/pages/myReferrals/index',          // 推荐官（中文角色值兼容）
      'staff':    '/pages/admin/referralReview/index', // 员工：待审核简历列表
      'admin':    '/pages/admin/referralManage/index', // 管理员：全量推荐管理
    };
    const url = routes[role];
    if (url) {
      wx.navigateTo({ url });
    }
    // customer 角色按钮已隐藏，此处不再跳转注册页
  },

  // 异步加载推荐角标数量（员工/管理员专用，不阻塞主流程）
  async loadReferralBadge(role) {
    if (!role || role === 'customer' || role === 'referrer') return;
    try {
      let action, params;
      if (role === 'staff') {
        // 员工：待我审核的简历数
        action = 'getMyAssignedReferrals';
        params = { action, reviewStatus: 'pending_review', pageSize: 1 };
      } else if (role === 'admin') {
        // 管理员：待审批的推荐人申请数
        action = 'listPendingReferrers';
        params = { action, pageSize: 1 };
      }
      const res = await wx.cloud.callFunction({ name: 'referralService', data: params });
      const count = res.result && (res.result.total || 0);
      if (count > 0) this.setData({ referralBadge: count });
    } catch (e) {
      console.warn('⚠️ 推荐角标加载失败:', e);
    }
  },


  // 跳转到测试页面
  goTestPage() {
    wx.navigateTo({
      url: '/pages/test-customer-service/index'
    });
  },

  // 检查是否显示订阅提醒横幅（员工 + 今天未提示过 + 未永久授权）
  checkSubscribeBanner() {
    const me = this.data.me;
    if (!me.isStaff) return;  // 非员工不显示

    const app = getApp();
    const needReminder = app.globalData && app.globalData.needSubscribeReminder;
    if (!needReminder) return;

    this.setData({ showSubscribeBanner: true });
  },

  // 员工点击"开启提醒"按钮 → 在用户手势中调微信 API
  onSubscribe() {
    wx.requestSubscribeMessage({
      tmplIds: [RESUME_VIEW_TEMPLATE_ID],
      success: (res) => {
        console.log('📨 订阅结果:', res);
        // 标记今天已提示，隐藏横幅
        wx.setStorageSync('staffSubPromptDate', new Date().toLocaleDateString());
        const app = getApp();
        if (app.globalData) app.globalData.needSubscribeReminder = false;
        this.setData({ showSubscribeBanner: false });

        if (res[RESUME_VIEW_TEMPLATE_ID] === 'accept') {
          wx.showToast({ title: '提醒已开启 ✅', icon: 'none' });
        }
      },
      fail: (err) => {
        console.warn('⚠️ 订阅请求失败:', err);
        wx.setStorageSync('staffSubPromptDate', new Date().toLocaleDateString());
        this.setData({ showSubscribeBanner: false });
      }
    });
  },

  // 关闭横幅（今天不再提示）
  onDismissSubscribeBanner() {
    wx.setStorageSync('staffSubPromptDate', new Date().toLocaleDateString());
    const app = getApp();
    if (app.globalData) app.globalData.needSubscribeReminder = false;
    this.setData({ showSubscribeBanner: false });
  },

  // 退出登录
  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      confirmText: '退出',
      confirmColor: '#8b5cf6',
      success: (res) => {
        if (res.confirm) {
          // 清除本地存储的用户信息
          wx.removeStorageSync('crmUserInfo');
          wx.removeStorageSync('token');

          // 清除全局用户信息
          const app = getApp();
          if (app.globalData) {
            app.globalData.userInfo = null;
          }

          // 重置页面数据
          this.setData({
            me: {
              nickname: "",
              avatarUrl: "",
            }
          });

          wx.showToast({
            title: '已退出登录',
            icon: 'success',
            duration: 2000
          });

          // 可选：跳转到登录页
          // wx.navigateTo({ url: "/pages/login/index" });
        }
      }
    });
  },
});
