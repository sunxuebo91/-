const userService = require('../../services/userService.js');

Page({
  data: {
    me: {
      nickname: "",
      avatarUrl: "",
    },
    isLoggedIn: false,
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
    this.loadMe();
    this.refreshLoginStatus();
    this.checkPendingContact();
  },


  async loadMe() {
    try {
      // 1. 先从云函数获取最新数据（确保数据同步）
      const resp = await wx.cloud.callFunction({
        name: "userService",
        data: { action: "getOrCreateMe" },
      });
      const cloudMe = (resp.result && resp.result.data) || {};
      console.log('📦 云函数返回的用户信息:', cloudMe);

      // 2. 从本地存储获取 CRM 用户信息
      const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
      console.log('📦 本地存储的 CRM 用户信息:', crmUserInfo);

      // 3. 合并数据：云函数数据优先，但本地存储的 nickname 作为补充
      // 注意：云端可能没有 nickname 字段，此时应使用本地存储的值
      const mergedMe = {
        ...this.data.me,
        ...cloudMe, // 云函数数据优先（phone、role、_openid 等）
      };

      // nickname: 云端有值则用云端，否则用本地存储
      mergedMe.nickname = cloudMe.nickname || crmUserInfo.nickname || '';
      // avatar: 云端有值则用云端，否则用本地存储
      mergedMe.avatarUrl = cloudMe.avatarUrl || crmUserInfo.avatarUrl || crmUserInfo.avatar || '';
      // phone: 云端有值则用云端，否则用本地存储
      mergedMe.phone = cloudMe.phone || crmUserInfo.phone || '';

      this.setData({
        me: mergedMe,
      });
      console.log('✅ 合并后的用户信息:', mergedMe);
    } catch (e) {
      console.error('❌ 加载用户信息失败:', e);
      // 云函数失败时，尝试从本地存储读取
      const crmUserInfo = wx.getStorageSync('crmUserInfo');
      if (crmUserInfo && (crmUserInfo.nickname || crmUserInfo.phone)) {
        this.setData({
          me: {
            ...this.data.me,
            ...crmUserInfo,
          },
        });
        console.log('✅ 云函数失败，使用本地存储:', crmUserInfo);
      }
      wx.showToast({ title: "加载失败", icon: "none" });
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


  // 跳转到测试页面
  goTestPage() {
    wx.navigateTo({
      url: '/pages/test-customer-service/index'
    });
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
