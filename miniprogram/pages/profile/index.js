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
      const resp = await wx.cloud.callFunction({
        name: "userService",
        data: { action: "getOrCreateMe" },
      });
      const me = (resp.result && resp.result.data) || {};
      this.setData({
        me: {
          ...this.data.me,
          ...me,
        },
      });
    } catch (e) {
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
});
