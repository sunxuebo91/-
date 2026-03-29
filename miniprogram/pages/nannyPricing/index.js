const SHARE_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得最新合同/安得褓贝定稿.jpg';
const userService = require('../../services/userService.js');

Page({
  data: {
    // 家政服务人员等级列表
    levels: [
      {
        id: 1,
        name: '铜牌家政员',
        price: '6000-7500',
        experience: '1-2年同城经验',
        color: '#CD7F32',
        bgColor: '#FFF4E6',
        skills: [
          { icon: '🧹', name: '居家保洁' },
          { icon: '🍲', name: '家常菜制作' },
          { icon: '👕', name: '衣物洗涤熨烫' },
          { icon: '🏠', name: '居家整理' },
          { icon: '🧊', name: '冰箱整理' }
        ]
      },
      {
        id: 2,
        name: '金牌家政师',
        price: '7500-10000',
        experience: '2-5年同城经验',
        color: '#FFB800',
        bgColor: '#FFF9E6',
        skills: [
          { icon: '🧹', name: '卫生清洁7无标准' },
          { icon: '🍽️', name: '营养膳食搭配' },
          { icon: '🍰', name: '西餐或烘焙制作' },
          { icon: '📋', name: '菜谱制定' },
          { icon: '📦', name: '整理收纳' }
        ]
      },
      {
        id: 3,
        name: '皇冠家政师',
        price: '10000',
        experience: '5年以上同城经验',
        color: '#FF6B35',
        bgColor: '#FFE8E0',
        skills: [
          { icon: '🍽️', name: '丰富口味餐品制作' },
          { icon: '🏢', name: '大面积服务(200㎡及以上)' },
          { icon: '👨‍👩‍👧', name: '多家庭成员服务(4人及以上)' },
          { icon: '🏠', name: '生活起居管理' },
          { icon: '🚗', name: '陪同属主家庭接待或出行' }
        ]
      }
    ],
    // 额外服务
    extraServices: [
      { icon: '🚗', name: '车辆驾驶' },
      { icon: '📖', name: '英语能力' },
      { icon: '🐾', name: '宠物照护' },
      { icon: '🍷', name: '宴会安排' },
      { icon: '🎓', name: '高等教育学历' },
      { icon: '💼', name: '雇主出行安排' },
      {
        icon: '❤️',
        name: '家庭特殊人群',
        name2: '照护',
        desc: '(如失能人员、先天性疾病人员、孤独症儿童等)'
      },
      { icon: '🧤', name: '特殊服务', desc: '(如徒手清洁地面等)' }
    ],
    shareLogo: ''
  },

  onShareAppMessage() {
    return {
      title: '保姆报价｜星级价格体系',
      path: '/pages/nannyPricing/index',
      imageUrl: this.data.shareLogo || '/images/default-goods-image.png'
    };
  },

  onShareTimeline() {
    return {
      title: '保姆报价｜星级价格体系',
      imageUrl: this.data.shareLogo || '/images/default-goods-image.png'
    };
  },

  onLoad() {
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

