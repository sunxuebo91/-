// index.js
Page({
  data: {
  },

  onShow() {
    // 更新自定义 tabBar 选中状态（首页是索引1）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      });
    }
  },

  // 跳转到服务详情
  goService(e) {
    const type = e.currentTarget.dataset.type;
    console.log('服务类型:', type);
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 跳转到简历列表
  goResumeList(e) {
    const type = e.currentTarget.dataset.type;
    console.log('简历类型:', type);
    wx.switchTab({
      url: '/pages/resumeList/index'
    });
  }
});
