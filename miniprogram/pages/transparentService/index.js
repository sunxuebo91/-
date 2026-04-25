const userService = require('../../services/userService.js');

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
  },

  // 跳转到服务费报价页面
  goServiceFee() {
    wx.navigateTo({
      url: '/pages/serviceFee/index'
    });
  },

  // 跳转到待产包准备页面
  goMaternityBag() {
    wx.navigateTo({
      url: '/pages/maternityBag/index'
    });
  },

  // 跳转到宝宝疫苗页面
  goBabyVaccine() {
    wx.navigateTo({
      url: '/pages/babyVaccine/index'
    });
  },

  // 跳转到宝宝早教页面
  goBabyEducation() {
    wx.navigateTo({
      url: '/pages/babyEducation/index'
    });
  },

  // 跳转到宝宝辅食页面
  goBabyFood() {
    wx.navigateTo({
      url: '/pages/babyFood/index'
    });
  },

  // 跳转到月子餐谱页面
  goConfinementMeals() {
    wx.navigateTo({
      url: '/pages/confinementMeals/index'
    });
  },

  // 跳转到备孕备产页面
  goPrenatalCare() {
    wx.navigateTo({
      url: '/pages/prenatalCare/index'
    });
  },

  // 跳转到产后康复页面
  goPostpartumRecovery() {
    wx.navigateTo({
      url: '/pages/postpartumRecovery/index'
    });
  },

  // 跳转到产后通乳页面
  goLactationCare() {
    wx.navigateTo({
      url: '/pages/lactationCare/index'
    });
  },

  // 跳转到老人照护页面
  goElderlyCare() {
    wx.navigateTo({
      url: '/pages/elderlyCare/index'
    });
  },

  // 跳转到母婴护理页面
  goMaternalInfantCare() {
    wx.navigateTo({
      url: '/pages/maternalInfantCare/index'
    });
  }
});

