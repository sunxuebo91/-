Page({
  data: {
    messages: []
  },

  onShow() {
    // 更新自定义 tabBar 选中状态（消息是索引1）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      });
    }
  }
});

