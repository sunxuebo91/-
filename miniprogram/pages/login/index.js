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

            const crmData = crmRes.data.data || {};

            // 保存 CRM Token（注册/登录接口返回的 JWT，供 authenticatedRequest 使用）
            const crmToken = crmRes.data.access_token || crmRes.data.token
              || crmData.access_token || crmData.token;
            if (crmToken) {
              wx.setStorageSync('access_token', crmToken);
              wx.setStorageSync('token', crmToken);
              console.log('✅ CRM Token 已保存');
            } else {
              console.warn('⚠️ CRM 注册接口未返回 token，尝试调用 miniprogram-login 获取');
              // 尝试用 openid + phone 换取 token（兼容不同版本的 CRM 后端）
              try {
                const loginRes = await new Promise((resolve, reject) => {
                  wx.request({
                    url: 'https://crm.andejiazheng.com/api/miniprogram-users/login',
                    method: 'POST',
                    data: { openid, phone },
                    header: { 'Content-Type': 'application/json' },
                    success: resolve,
                    fail: reject,
                  });
                });
                const loginToken = loginRes.data?.access_token || loginRes.data?.token
                  || loginRes.data?.data?.access_token || loginRes.data?.data?.token;
                if (loginToken) {
                  wx.setStorageSync('access_token', loginToken);
                  wx.setStorageSync('token', loginToken);
                  console.log('✅ CRM Token（miniprogram-login）已保存');
                }
              } catch (tokenErr) {
                console.warn('⚠️ 获取 CRM Token 失败（不影响主流程）:', tokenErr);
              }
            }

            // 额外调用 staff/info 接口，用手机号拉取 CRM 管理员维护的真实姓名和头像
            // 该接口只有员工才有记录，普通用户会返回 404 / success:false，catch 后静默处理
            let crmName = crmData.name || crmData.nickname || '';
            let crmAvatar = crmData.avatar || crmData.avatarUrl || '';
            try {
              const staffRes = await new Promise((resolve, reject) => {
                wx.request({
                  url: `https://crm.andejiazheng.com/api/resumes/staff/info?phone=${phone}`,
                  method: 'GET',
                  success: resolve,
                  fail: reject
                });
              });
              if (staffRes.data && staffRes.data.success && staffRes.data.data) {
                const staffData = staffRes.data.data;
                crmName = staffData.name || crmName;
                crmAvatar = staffData.avatar || crmAvatar;
                console.log('✅ 员工档案已拉取:', crmName, crmAvatar);
              }
            } catch (staffErr) {
              console.log('ℹ️ 非员工或 staff/info 接口异常，跳过:', staffErr);
            }

            // 构建完整的用户信息对象
            const userInfo = {
              ...crmData,
              phone: phone,
              nickname: (this.data.nickname || '').trim() || '用户',
              // 小程序上传的头像保留在 avatar 字段（用于小程序内展示）
              avatar: cloudAvatarUrl || '',
              // CRM 管理员维护的真实姓名和头像，分享时优先读取，不会被设置页覆盖
              crmName,
              crmAvatar,
              openid: openid,
              isStaff: crmData.isStaff === true
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


