const userService = require('../../services/userService.js');

Page({
  data: {},

  onLoad() {
    if (!userService.requireLogin()) return;
    // 页面加载
  },

  onShareAppMessage() {
    return {
      title: '安得阿姨上户须知',
      path: '/pages/houseRules/index'
    };
  },

  onShareTimeline() {
    return {
      title: '安得阿姨上户须知'
    };
  }
});

