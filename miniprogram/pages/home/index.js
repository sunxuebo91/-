Page({
  onShow() {
    // 更新自定义 tabBar 选中状态（首页是索引0）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0
      });
    }
  },

  goResumeList(e) {
    const jobType = e?.currentTarget?.dataset?.jobtype;
    console.log('🏠 首页点击按钮，工种:', jobType);

    // 跳转到简历列表页（普通页面跳转，带参数）
    wx.navigateTo({
      url: `/pages/resumeList/index?jobType=${jobType}`,
      success: () => {
        console.log('🏠 navigateTo 成功');
      },
      fail: (err) => {
        console.error('🏠 navigateTo 失败:', err);
      }
    });
  },

  goService(e) {
    const type = e?.currentTarget?.dataset?.type;
    console.log('goService type:', type);
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  }
});
