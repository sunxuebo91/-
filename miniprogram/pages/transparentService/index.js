Page({
  data: {

  },

  onLoad(options) {
    // 设置页面标题
    wx.setNavigationBarTitle({
      title: '透明服务'
    });
  },

  // 跳转到月嫂报价页面
  goMaternityPricing() {
    wx.navigateTo({
      url: '/pages/maternityPricing/index'
    });
  },

  // 跳转到育儿报价页面
  goChildcarePricing() {
    wx.navigateTo({
      url: '/pages/childcarePricing/index'
    });
  },

  // 跳转到保姆报价页面
  goNannyPricing() {
    wx.navigateTo({
      url: '/pages/nannyPricing/index'
    });
  },

  // 跳转到护老报价页面
  goEldercarePricing() {
    wx.navigateTo({
      url: '/pages/eldercarePricing/index'
    });
  }
});

