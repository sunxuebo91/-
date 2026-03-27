const userService = require('../../services/userService.js');

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
    ],
    isLoggedIn: false,
  },

  onLoad() {
    // 加载消息列表
    this.loadMessages();
  },

  onShow() {
    // 登录保护
    if (!userService.requireLogin()) return;

    // 更新自定义 tabBar 选中状态（消息是索引1）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      });
    }

    // 刷新消息列表
    this.loadMessages();

    // 同步登录态，并处理登录后待打开的客服
    this.refreshLoginStatus();
    this.checkPendingContact();
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
