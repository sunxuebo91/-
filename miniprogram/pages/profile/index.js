const userService = require('../../services/userService.js');

Page({
  data: {
    me: {
      nickname: "",
      avatarUrl: "",
    },
    isLoggedIn: false,
  },

  onShow() {
    // 更新自定义 tabBar 选中状态（我的现在是索引2）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 2
      });
    }
    this.loadMe();
    this.refreshLoginStatus();
    this.checkPendingContact();
  },


  async loadMe() {
    try {
      // 1. 先从云函数获取最新数据（确保数据同步）
      const resp = await wx.cloud.callFunction({
        name: "userService",
        data: { action: "getOrCreateMe" },
      });
      const cloudMe = (resp.result && resp.result.data) || {};
      console.log('📦 云函数返回的用户信息:', cloudMe);

      // 2. 从本地存储获取 CRM 用户信息
      let crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
      console.log('📦 本地存储的 CRM 用户信息:', crmUserInfo);
      console.log('🪪 crmName / crmAvatar:', crmUserInfo.crmName, '/', crmUserInfo.crmAvatar);

      // 2.5 兜底：手机号存在但 crmName 缺失时，主动拉一次员工档案（非员工返回失败也无害）
      if (crmUserInfo.phone && !crmUserInfo.crmName) {
        const fetched = await this._fetchStaffInfo(crmUserInfo.phone);
        if (fetched && (fetched.name || fetched.avatar)) {
          crmUserInfo = {
            ...crmUserInfo,
            crmName: fetched.name || crmUserInfo.crmName || '',
            crmAvatar: fetched.avatar || crmUserInfo.crmAvatar || '',
            isStaff: true,
          };
          wx.setStorageSync('crmUserInfo', crmUserInfo);
          console.log('🪪 补拉员工档案完成:', crmUserInfo.crmName, crmUserInfo.crmAvatar);
        }
      }

      // 3. 合并数据：云函数数据优先，但本地存储的 nickname 作为补充
      const mergedMe = {
        ...this.data.me,
        ...cloudMe, // 云函数数据优先（phone、role、_openid 等）
      };

      // nickname: CRM 管理员维护的真实姓名（crmName）优先，其次云端，再次本地
      mergedMe.nickname = crmUserInfo.crmName || cloudMe.nickname || crmUserInfo.nickname || '';
      // avatar: CRM 管理员维护的真实头像（crmAvatar）优先，其次云端，再次本地
      mergedMe.avatarUrl = crmUserInfo.crmAvatar
        || cloudMe.avatarUrl || crmUserInfo.avatarUrl || crmUserInfo.avatar || '';
      mergedMe.avatar = mergedMe.avatarUrl; // wxml 同时用 me.avatar / me.avatarUrl
      // 透传 crmName / crmAvatar，方便其它模块（分享卡片/海报）直接读取
      if (crmUserInfo.crmName) mergedMe.crmName = crmUserInfo.crmName;
      if (crmUserInfo.crmAvatar) mergedMe.crmAvatar = crmUserInfo.crmAvatar;
      // phone: 云端有值则用云端，否则用本地存储
      mergedMe.phone = cloudMe.phone || crmUserInfo.phone || '';
      // 员工/推荐官身份：cloud users.role 或 crmUserInfo 缓存任一命中即生效（用于"我推荐的"等入口可见性）
      mergedMe.isStaff = cloudMe.role === 'staff' || cloudMe.role === 'admin'
        || cloudMe.isStaff === true || crmUserInfo.isStaff === true;
      mergedMe.isReferrer = cloudMe.role === 'referrer' || cloudMe.role === '推荐官'
        || cloudMe.isReferrer === true || crmUserInfo.isReferrer === true;

      this.setData({
        me: mergedMe,
      });
      console.log('✅ 合并后的用户信息:', mergedMe);
    } catch (e) {
      console.error('❌ 加载用户信息失败:', e);
      // 云函数失败时，尝试从本地存储读取
      const crmUserInfo = wx.getStorageSync('crmUserInfo');
      if (crmUserInfo && (crmUserInfo.nickname || crmUserInfo.phone)) {
        this.setData({
          me: {
            ...this.data.me,
            ...crmUserInfo,
          },
        });
        console.log('✅ 云函数失败，使用本地存储:', crmUserInfo);
      }
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  /** 用手机号查 CRM 员工档案；非员工/接口异常都视为查不到，静默返回 null */
  _fetchStaffInfo(phone) {
    return new Promise((resolve) => {
      wx.request({
        url: `https://crm.andejiazheng.com/api/resumes/staff/info?phone=${encodeURIComponent(phone)}`,
        method: 'GET',
        success: (res) => {
          const body = (res && res.data) || {};
          if ((res.statusCode === 200 || res.statusCode === 201) && body.success && body.data) {
            resolve(body.data);
          } else {
            resolve(null);
          }
        },
        fail: () => resolve(null),
      });
    });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/settings/index" });
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


  onTapHelp() {
    wx.showToast({ title: "请联系客服", icon: "none" });
  },


  onTapSettings() {
    wx.navigateTo({ url: "/pages/settings/index" });
  },

  goResumeManage() {
    wx.navigateTo({ url: "/pages/admin/resumeManage/index" });
  },

  goBabyDiary() {
    wx.navigateTo({ url: "/pages/babyDiary/list/index" });
  },

  goMyOrders() {
    wx.navigateTo({ url: "/pages/myOrders/index" });
  },

  goSalaryAssessment() {
    wx.navigateTo({ url: "/pages/salaryAssessment/index" });
  },

  goCourse() {
    wx.navigateTo({ url: "/pages/course-list/index" });
  },

  goReferral() {
    wx.navigateTo({ url: "/pages/myReferrals/index" });
  },

  goPoster() {
    // 推荐海报：员工先在客户列表里挑一个客户，再跳 /pages/poster/index?customerId=xxx
    // 由该页 _getReferrerRegisterMiniCodePath 生成带 staffId/staffPhone/staffOpenid 归属的二维码
    wx.navigateTo({ url: "/pages/posterCustomerList/index" });
  },


  // 跳转到测试页面
  goTestPage() {
    wx.navigateTo({
      url: '/pages/test-customer-service/index'
    });
  },

  // 退出登录
  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      confirmText: '退出',
      confirmColor: '#8b5cf6',
      success: (res) => {
        if (res.confirm) {
          // 清除本地存储的用户信息
          wx.removeStorageSync('crmUserInfo');
          wx.removeStorageSync('token');
          // 同步清除我的网课的学员 token / 学员信息，避免下次进入时复用旧账号数据
          wx.removeStorageSync('student_token');
          wx.removeStorageSync('student_info');

          // 清除全局用户信息
          const app = getApp();
          if (app.globalData) {
            app.globalData.userInfo = null;
          }

          // 重置页面数据
          this.setData({
            me: {
              nickname: "",
              avatarUrl: "",
            }
          });

          wx.showToast({
            title: '已退出登录',
            icon: 'success',
            duration: 2000
          });

          // 可选：跳转到登录页
          // wx.navigateTo({ url: "/pages/login/index" });
        }
      }
    });
  },
});
