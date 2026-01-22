Page({
  data: {
    me: {
      nickname: "",
      avatarUrl: "",
    },
  },

  onShow() {
    // 更新自定义 tabBar 选中状态（我的现在是索引2）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 2
      });
    }
    this.loadMe();
  },

  async loadMe() {
    try {
      // 1. 先尝试从本地存储获取 CRM 用户信息
      const crmUserInfo = wx.getStorageSync('crmUserInfo');
      console.log('📦 本地存储的 CRM 用户信息:', crmUserInfo);

      if (crmUserInfo && (crmUserInfo.nickname || crmUserInfo.phone)) {
        // 如果有 CRM 用户信息，直接使用
        this.setData({
          me: {
            ...this.data.me,
            ...crmUserInfo,
          },
        });
        console.log('✅ 使用 CRM 用户信息:', crmUserInfo);
        return;
      }

      // 2. 如果没有 CRM 用户信息，从云函数获取
      const resp = await wx.cloud.callFunction({
        name: "userService",
        data: { action: "getOrCreateMe" },
      });
      const me = (resp.result && resp.result.data) || {};
      console.log('📦 云函数返回的用户信息:', me);

      this.setData({
        me: {
          ...this.data.me,
          ...me,
        },
      });
    } catch (e) {
      console.error('❌ 加载用户信息失败:', e);
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/index" });
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
