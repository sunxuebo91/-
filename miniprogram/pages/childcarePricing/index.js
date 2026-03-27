const SHARE_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得最新合同/安得褓贝定稿.jpg';
const userService = require('../../services/userService.js');

Page({
  data: {
    // 育儿师等级列表
    levels: [
      {
        id: 1,
        name: '金牌育儿师',
        price: '6000-7000',
        experience: '1-3户',
        color: '#FFB800',
        bgColor: '#FFF9E6',
        skills: [
          { icon: '👶', name: '辅食制作' },
          { icon: '🏠', name: '日常护理' },
          { icon: '🧹', name: '卫生清洁' },
          { icon: '🎓', name: '早教训练' }
        ]
      },
      {
        id: 2,
        name: '皇冠育儿师',
        price: '7000-8000',
        experience: '2年左右',
        color: '#FF6B6B',
        bgColor: '#FFE8E8',
        skills: [
          { icon: '🌸', name: '花样辅食制作' },
          { icon: '🎵', name: '潜能开发' },
          { icon: '📖', name: '习惯培养' },
          { icon: '👶', name: '儿童阅读训练' },
          { icon: '💪', name: '自理能力培养' }
        ]
      },
      {
        id: 3,
        name: '钻石育儿师',
        price: '8000-13000',
        experience: '3-5年',
        color: '#00C9A7',
        bgColor: '#E6FFF9',
        skills: [
          { icon: '🎓', name: '科学早教' },
          { icon: '😊', name: '小儿推拿' },
          { icon: '🩺', name: '思维训练' },
          { icon: '🌱', name: '行为认知' },
          { icon: '📋', name: '学龄前辅导' },
          { icon: '👁️', name: '疾病观察和护理' }
        ]
      },
      {
        id: 4,
        name: '首席育儿师',
        price: '13000起',
        experience: '5年以上',
        color: '#8766F3',
        bgColor: '#F0EBFF',
        skills: [
          { icon: '📋', name: '营养食谱' },
          { icon: '🛡️', name: '健康把控' },
          { icon: '👤', name: '性格培养' },
          { icon: '❤️', name: '家庭互动' },
          { icon: '💡', name: '智力开发' },
          { icon: '📋', name: '课业辅导' },
          { icon: '😊', name: '儿童情绪管理' },
          { icon: '🤝', name: '儿童社交训练' }
        ]
      }
    ],
    // 额外服务
    extraServices: [
      { icon: '🚗', name: '车辆驾驶' },
      { icon: '🔤', name: '英语能力' },
      { icon: '🏢', name: '大面积服务' },
      { icon: '🍽️', name: '多餐品制作' },
      { icon: '🎓', name: '高等教育学历' },
      { icon: '😊', name: '双胞胎或多胞胎照护' },
      { icon: '🩺', name: '先天性疾病儿童照护' },
      { icon: '/images/special-child-icon.svg', name: '特殊儿童(如孤独症等)照护', isImage: true }
    ],
    shareLogo: ''
  },

  onShareAppMessage() {
    return {
      title: '育儿报价｜星级价格体系',
      path: '/pages/childcarePricing/index',
      imageUrl: this.data.shareLogo || '/images/default-goods-image.png'
    };
  },

  onShareTimeline() {
    return {
      title: '育儿报价｜星级价格体系',
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

