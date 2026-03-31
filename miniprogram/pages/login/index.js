Page({
  data: {
    agreed: false,
    me: {
      avatarUrl: "",
      nickname: "",
    },
    avatarUrl: "", // 新选择的头像
    nickname: "", // 新输入的昵称
  },

  async onLoad() {
    console.log('📱 登录页加载');

    // 加载用户信息（用于微信登录）
    this.loadMe();
  },

  async loadMe() {
    try {
      const resp = await wx.cloud.callFunction({
        name: "userService",
        data: { action: "getOrCreateMe" },
      });
      const me = (resp.result && resp.result.data) || {};
      this.setData({
        me,
        nickname: me.nickname || "",
        avatarUrl: me.avatarUrl || ""
      });
    } catch (e) {
      console.error("加载用户信息失败", e);
    }
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ avatarUrl });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  async onGetPhoneNumber(e) {
    if (!this.data.agreed) {
      wx.showToast({ title: "请先同意《用户协议》和《隐私政策》", icon: "none" });
      return;
    }

    console.log("手机号授权回调", e);

    if (e.detail.errMsg !== "getPhoneNumber:ok") {
      wx.showToast({ title: "未授权", icon: "none" });
      return;
    }

    wx.showLoading({ title: "登录中..." });

    try {
      // 1. 如果有新头像，先上传到云存储
      let avatarUrl = this.data.avatarUrl;
      let cloudAvatarUrl = avatarUrl;  // 云存储的头像URL

      if (avatarUrl && avatarUrl.startsWith("http://tmp/")) {
        try {
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: `avatars/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
            filePath: avatarUrl,
          });
          cloudAvatarUrl = uploadRes.fileID;
        } catch (uploadErr) {
          console.error("上传头像失败", uploadErr);
          // 上传失败不影响登录流程
        }
      }

      // 2. 调用云函数解密手机号并保存到云数据库
      const res = await wx.cloud.callFunction({
        name: "userService",
        data: {
          action: "loginByPhone",
          code: e.detail.code,
          nickname: (this.data.nickname || '').trim() || '用户',
          avatarUrl: cloudAvatarUrl,
        },
      });

      if (res.result && res.result.success) {
        const userData = res.result.data;
        const phone = userData.phone;
        const openid = userData._openid;

        console.log("✅ 手机号登录成功，手机号:", phone);
        console.log("✅ OpenID:", openid);

        // 3. 调用 CRM 后端注册接口，同步用户信息
        try {

          // 调用 CRM 后端注册接口
          const crmRes = await new Promise((resolve, reject) => {
            wx.request({
              url: 'https://crm.andejiazheng.com/api/miniprogram-users/register',
              method: 'POST',
              data: {
                openid: openid,
                phone: phone,
                nickname: (this.data.nickname || '').trim() || '用户',
                avatar: cloudAvatarUrl || '',
                gender: 0,  // 0未知 1男 2女，可以后续添加性别选择
                city: '',
                province: ''
              },
              header: {
                'Content-Type': 'application/json'
              },
              success: resolve,
              fail: reject
            });
          });

          console.log('📡 CRM 注册接口响应:', crmRes);

          if (crmRes.data && crmRes.data.success) {
            console.log('✅ 用户信息已同步到 CRM 后端');

            // 构建完整的用户信息对象
            // isStaff 由后端通过手机号查员工表返回，直接存入缓存供权限判断
            const userInfo = {
              ...crmRes.data.data,
              phone: phone,
              nickname: (this.data.nickname || '').trim() || '用户',
              avatar: cloudAvatarUrl || '',
              openid: openid,
              isStaff: crmRes.data.data?.isStaff === true
            };

            console.log('💾 准备保存的用户信息:', userInfo);

            // 保存用户信息到全局和本地存储
            const app = getApp();
            app.globalData.userInfo = userInfo;
            wx.setStorageSync('crmUserInfo', userInfo);

            console.log('✅ 用户信息已保存到本地存储');
          } else {
            console.warn('⚠️ CRM 注册接口返回失败:', crmRes.data?.message);
          }
        } catch (crmErr) {
          console.error('❌ 调用 CRM 注册接口失败:', crmErr);
          // CRM 接口失败不影响登录流程
        }

        // 4. 登录成功提示
        wx.showToast({ title: "登录成功" });
        setTimeout(() => {
          const pages = getCurrentPages();
          if (pages.length > 1) {
            wx.navigateBack();
          } else {
            wx.switchTab({ url: '/pages/home/index' });
          }
        }, 1500);
      } else {
        wx.showToast({ title: "登录失败", icon: "none" });
      }
    } catch (err) {
      console.error("登录失败", err);
      wx.showToast({ title: "登录失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  openUserAgreement() {
    wx.navigateTo({ url: "/pages/legal/userAgreement/index" });
  },

  openPrivacyPolicy() {
    wx.navigateTo({ url: "/pages/legal/privacyPolicy/index" });
  },

  // 暂不登录：满足微信登录规范，必须提供可用的取消/跳过选项
  onSkipLogin() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/home/index' });
    }
  },
});


