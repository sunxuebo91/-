const SHARE_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得最新合同/安得褓贝定稿.jpg';
const userService = require('../../services/userService.js');

Page({
  data: {
    // 护老服务人员等级列表
    levels: [
      {
        id: 1,
        name: '自理老人照护',
        price: '5000',
        experience: '经验1年以上',
        color: '#4CAF50',
        bgColor: '#E8F5E9',
        skills: [
          { icon: '🏠', name: '日常照料' },
          { icon: '💊', name: '健康提醒' },
          { icon: '🤝', name: '陪伴关怀' },
          { icon: '📋', name: '琐事代办' }
        ]
      },
      {
        id: 2,
        name: '半自理老人照护',
        price: '5500',
        experience: '经验2年以上',
        color: '#FF9800',
        bgColor: '#FFF3E0',
        skills: [
          { icon: '🛏️', name: '起居辅助' },
          { icon: '💊', name: '慢病照护' },
          { icon: '🍽️', name: '营养配餐' },
          { icon: '🩹', name: '压疮预防' },
          { icon: '🚨', name: '应急处理' },
          { icon: '🏥', name: '就医陪同' }
        ]
      },
      {
        id: 3,
        name: '不自理老人照护',
        price: '6000',
        experience: '经验3年以上',
        color: '#F44336',
        bgColor: '#FFEBEE',
        skills: [
          { icon: '🛏️', name: '卧床护理' },
          { icon: '💉', name: '管路护理' },
          { icon: '🩹', name: '压疮护理' },
          { icon: '🩺', name: '体征监测' },
          { icon: '🧠', name: '失智照护' },
          { icon: '👁️', name: '全天陪护' },
          { icon: '💪', name: '被动康复' },
          { icon: '🚑', name: '急救处理' }
        ]
      }
    ],
    // 额外服务
    extraServices: [
      { icon: '⚙️', name: '器械操作' },
      { icon: '🌿', name: '中医护理' },
      { icon: '🧠', name: '失智照护' },
      { icon: '🕊️', name: '临终关怀' },
      { icon: '💪', name: '康复辅助' },
      { icon: '🍲', name: '慢病配餐' },
      { icon: '🌙', name: '夜间陪护' },
      { icon: '🚗', name: '驾驶陪同' }
    ],
    shareLogo: ''
  },

  onShareAppMessage() {
    return {
      title: '护老报价｜星级价格体系',
      path: '/pages/eldercarePricing/index',
      imageUrl: this.data.shareLogo || '/images/default-goods-image.png'
    };
  },

  onShareTimeline() {
    return {
      title: '护老报价｜星级价格体系',
      imageUrl: this.data.shareLogo || '/images/default-goods-image.png'
    };
  },

  onLoad() {
    if (!userService.requireLogin()) return;
    this.loadShareLogo();
  },

  async loadShareLogo() {
    try {
      const res = await wx.cloud.getTempFileURL({
        fileList: [SHARE_LOGO_FILE_ID]
      });
      const temp = res?.fileList?.[0]?.tempFileURL;
      if (temp) {
        this.setData({ shareLogo: temp });
      }
    } catch (err) {
      console.error('获取分享LOGO失败:', err);
    }
  }
});

