Page({
  data: {
    messages: [
      // 示例消息数据 - 实际使用时从云数据库获取
      // {
      //   id: '1',
      //   title: '订单通知',
      //   content: '您的订单已确认，保姆将于明天上午9:00到达',
      //   time: '10:30',
      //   icon: '/images/icons/notification.svg',
      //   read: false
      // },
      // {
      //   id: '2',
      //   title: '服务提醒',
      //   content: '您预约的育儿嫂服务即将开始，请做好准备',
      //   time: '昨天',
      //   icon: '/images/icons/notification.svg',
      //   read: true
      // }
    ]
  },

  onLoad() {
    // 加载消息列表
    this.loadMessages();
  },

  onShow() {
    // 更新自定义 tabBar 选中状态（消息是索引1）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      });
    }

    // 刷新消息列表
    this.loadMessages();
  },

  // 加载消息列表
  loadMessages() {
    // TODO: 从云数据库获取消息
    // 这里可以调用云函数获取系统通知
    // 例如：订单通知、服务提醒、系统公告等

    // 示例：模拟加载消息
    // this.setData({
    //   messages: [
    //     {
    //       id: '1',
    //       title: '订单通知',
    //       content: '您的订单已确认，保姆将于明天上午9:00到达',
    //       time: '10:30',
    //       icon: '/images/icons/notification.svg',
    //       read: false
    //     }
    //   ]
    // });
  },

  // 小程序客服回调
  handleContact(e) {
    console.log('客服消息回调:', e.detail);
    // 可以在这里处理用户从客服消息返回的情况
    if (e.detail.path) {
      console.log('用户点击的消息路径:', e.detail.path);
    }
    if (e.detail.query) {
      console.log('用户点击的消息参数:', e.detail.query);
    }
  },

  // 跳转到测试页面
  goTestPage() {
    wx.navigateTo({
      url: '/pages/test-customer-service/index'
    });
  },

  // 点击消息项
  onMessageTap(e) {
    const id = e.currentTarget.dataset.id;
    console.log('点击消息:', id);

    // 标记消息为已读
    const messages = this.data.messages.map(msg => {
      if (msg.id === id) {
        return { ...msg, read: true };
      }
      return msg;
    });

    this.setData({ messages });

    // TODO: 跳转到消息详情页或执行相应操作
    wx.showToast({
      title: '消息详情功能开发中',
      icon: 'none'
    });
  }
});
