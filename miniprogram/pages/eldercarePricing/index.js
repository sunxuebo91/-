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
    ]
  },

  onShareAppMessage() {
    return {
      title: '护老报价｜星级价格体系',
      path: '/pages/eldercarePricing/index'
    };
  },

  onShareTimeline() {
    return {
      title: '护老报价｜星级价格体系'
    };
  },

  onLoad() {
    // 页面加载
  }
});

