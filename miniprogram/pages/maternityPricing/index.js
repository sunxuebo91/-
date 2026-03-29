const SHARE_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得最新合同/安得褓贝定稿.jpg';
const userService = require('../../services/userService.js');

Page({
  data: {
    // 月嫂等级列表
    levels: [
      {
        id: 1,
        name: '初级',
        price: '11,800',
        experience: '1年以内',
        color: '#95D5B2',
        bgColor: '#E8F5E9',
        skills: [
          { icon: '👶', name: '护理5个以内宝宝' },
          { icon: '🤱', name: '母乳喂养指导' },
          { icon: '🍼', name: '科学喂养' },
          { icon: '🛁', name: '洗澡抚触' }
        ]
      },
      {
        id: 2,
        name: '银牌',
        price: '13,800',
        experience: '1-2年',
        color: '#B0BEC5',
        bgColor: '#ECEFF1',
        skills: [
          { icon: '👶', name: '护理10个以内宝宝' },
          { icon: '🤱', name: '母乳喂养指导' },
          { icon: '🍼', name: '科学喂养' },
          { icon: '🛁', name: '洗澡抚触' },
          { icon: '🧹', name: '产妇护理' },
          { icon: '🍲', name: '月子餐制作' }
        ]
      },
      {
        id: 3,
        name: '金牌',
        price: '15,800',
        experience: '2-3年经验',
        color: '#FFB800',
        bgColor: '#FFF9E6',
        skills: [
          { icon: '👶', name: '10-30个宝宝护理' },
          { icon: '💝', name: '日常护理娴熟' },
          { icon: '🍲', name: '月子餐制作' },
          { icon: '🧘', name: '多种产褥操' },
          { icon: '🤱', name: '乳房护理' },
          { icon: '🍼', name: '科学喂养' },
          { icon: '🛁', name: '洗澡抚触' }
        ]
      },
      {
        id: 4,
        name: '铂金',
        price: '17,800',
        experience: '5-7年经验',
        color: '#90CAF9',
        bgColor: '#E3F2FD',
        skills: [
          { icon: '⭐', name: '5-7年经验' },
          { icon: '😊', name: '35-50个宝宝护理' },
          { icon: '❤️', name: '日常护理娴熟' },
          { icon: '⚠️', name: '紧急情况处理' },
          { icon: '🍜', name: '月子餐灵活安排' },
          { icon: '💆', name: '按摩开背产后修复' },
          { icon: '👶', name: '开奶追奶催乳' },
          { icon: '😊', name: '简单小儿推拿' }
        ]
      },
      {
        id: 5,
        name: '钻石',
        price: '19,800',
        experience: '7-9年经验',
        color: '#4ECDC4',
        bgColor: '#E0F7F6',
        skills: [
          { icon: '⭐', name: '7-9年经验' },
          { icon: '😊', name: '50-65个宝宝护理' },
          { icon: '❤️', name: '日常护理娴熟' },
          { icon: '⚠️', name: '紧急情况处理' },
          { icon: '🍲', name: '高级月子餐制作' },
          { icon: '💆', name: '按摩开背产后修复' },
          { icon: '🤱', name: '开奶追奶催乳疏通' },
          { icon: '😊', name: '熟练小儿推拿' }
        ]
      },
      {
        id: 6,
        name: '皇冠',
        price: '21,800',
        experience: '9年以上经验',
        color: '#E74C3C',
        bgColor: '#FFEBEE',
        skills: [
          { icon: '⭐', name: '9年以上经验' },
          { icon: '😊', name: '65个以上宝宝护理' },
          { icon: '❤️', name: '日常护理娴熟' },
          { icon: '👤', name: '一定医护基础' },
          { icon: '🍲', name: '高级月子餐制作' },
          { icon: '💆', name: '按摩开背产后修复' },
          { icon: '🤱', name: '开奶追奶催乳疏通' },
          { icon: '😊', name: '熟练小儿推拿' }
        ]
      }
    ],
    // 分享封面（云存储临时链接）
    shareLogo: ''
  },

  onLoad() {
    this.loadShareLogo();
  },

  onShareAppMessage() {
    return {
      title: '月嫂报价｜星级价格体系',
      path: '/pages/maternityPricing/index',
      imageUrl: this.data.shareLogo || '/images/default-goods-image.png'
    };
  },

  onShareTimeline() {
    return {
      title: '月嫂报价｜星级价格体系',
      imageUrl: this.data.shareLogo || '/images/default-goods-image.png'
    };
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
