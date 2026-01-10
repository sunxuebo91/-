// 引入认证服务
const authService = require('../../services/auth.js');

Page({
  data: {
    agreed: false,
    me: {
      avatarUrl: "",
      nickname: "",
    },
    avatarUrl: "", // 新选择的头像
    nickname: "", // 新输入的昵称
    username: "", // 账号
    password: "", // 密码
    showAccountModal: false, // 是否显示账号密码登录弹窗
    checking: true, // 正在检查登录状态
  },

  async onLoad() {
    console.log('📱 登录页加载');

    // 检查是否已登录（验证 Token 有效性）
    await this.checkLoginStatus();

    // 加载用户信息（用于微信登录）
    this.loadMe();
  },

  /**
   * 检查登录状态（验证 Token 有效性）
   */
  async checkLoginStatus() {
    const token = authService.getLocalToken();

    if (!token) {
      console.log('❌ 未找到 Token，显示登录界面');
      this.setData({ checking: false });
      return;
    }

    console.log('🔍 检测到本地 Token，验证有效性...');

    try {
      // 调用后端 API 验证 Token 是否有效
      const isValid = await authService.validateToken();

      if (isValid) {
        console.log('✅ Token 有效，用户已登录，跳转到首页');
        wx.switchTab({
          url: '/pages/home/index'
        });
      } else {
        console.log('⚠️ Token 无效，清除本地数据');
        authService.logout();
        this.setData({ checking: false });
      }
    } catch (error) {
      console.error('❌ Token 验证失败:', error);

      // 如果是 401 错误，说明 Token 已过期
      if (error.message && error.message.includes('登录已过期')) {
        console.log('⚠️ Token 已过期，清除本地数据');
        authService.logout();
      }

      this.setData({ checking: false });
    }
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

  onUsernameInput(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  // 显示账号密码登录弹窗
  showAccountLoginModal() {
    this.setData({ showAccountModal: true });
  },

  // 隐藏账号密码登录弹窗
  hideAccountLoginModal() {
    this.setData({
      showAccountModal: false,
      username: "",
      password: "",
    });
  },

  // 阻止事件冒泡
  stopPropagation() {},

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

    // 检查是否设置了昵称
    if (!this.data.nickname || !this.data.nickname.trim()) {
      wx.showToast({ title: "请先输入昵称", icon: "none" });
      return;
    }

    wx.showLoading({ title: "登录中..." });

    try {
      // 1. 如果有新头像，先上传到云存储
      let avatarUrl = this.data.avatarUrl;
      if (avatarUrl && avatarUrl.startsWith("http://tmp/")) {
        try {
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: `avatars/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
            filePath: avatarUrl,
          });
          avatarUrl = uploadRes.fileID;
        } catch (uploadErr) {
          console.error("上传头像失败", uploadErr);
          // 上传失败不影响登录流程
        }
      }

      // 2. 调用云函数解密手机号并保存信息
      const res = await wx.cloud.callFunction({
        name: "userService",
        data: {
          action: "loginByPhone",
          code: e.detail.code,
          nickname: this.data.nickname.trim(),
          avatarUrl: avatarUrl,
        },
      });

      if (res.result && res.result.success) {
        // 手机号登录成功
        console.log("✅ 手机号登录成功");

        wx.showToast({ title: "登录成功" });
        setTimeout(() => {
          wx.navigateBack();
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




  // 账号密码登录（使用"安得家政"API）
  async onAccountLogin() {
    const { username, password } = this.data;

    if (!username || !username.trim()) {
      wx.showToast({ title: "请输入账号", icon: "none" });
      return;
    }

    if (!password || !password.trim()) {
      wx.showToast({ title: "请输入密码", icon: "none" });
      return;
    }

    wx.showLoading({ title: "登录中..." });

    try {
      console.log('🔐 调用"安得家政"API 登录:', username.trim());

      // 调用"安得家政"的登录 API
      const response = await authService.login(username.trim(), password.trim());

      console.log('📡 登录响应:', response);

      if (response && response.success && response.data) {
        // 检查 access_token
        const token = response.data.access_token || response.data.token || response.data.accessToken;

        if (!token) {
          console.error('❌ 响应中未找到 token:', response.data);
          wx.showToast({
            title: '登录响应格式错误，未找到访问令牌',
            icon: 'none',
            duration: 3000
          });
          return;
        }

        // 保存认证数据
        authService.saveAuthData({
          access_token: token,
          user: response.data.user,
          openid: response.data.openid
        });

        console.log('✅ 登录成功:', response.data.user?.name);

        this.hideAccountLoginModal();
        wx.showToast({ title: "登录成功" });

        setTimeout(() => {
          wx.switchTab({
            url: '/pages/home/index'
          });
        }, 1500);
      } else {
        const errorMsg = response?.message || '账号或密码错误';
        console.error('❌ 登录失败:', response);
        wx.showToast({
          title: errorMsg,
          icon: "none",
          duration: 3000
        });
      }
    } catch (err) {
      console.error("❌ 登录错误:", err);

      let errorMsg = '网络异常，请重试';

      // 检查是否是域名校验问题
      if (err.errMsg && err.errMsg.includes('request:fail')) {
        errorMsg = '网络请求失败，请检查开发者工具设置中是否关闭了域名校验';
      }

      wx.showModal({
        title: '登录失败',
        content: `错误信息：${err.errMsg || err.message || '未知错误'}\n\n如果是开发环境，请在开发者工具的"详情"→"本地设置"中勾选"不校验合法域名"`,
        showCancel: false
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 跳转到注册页面
  goRegister() {
    wx.navigateTo({ url: "/pages/register/index" });
  },

  openUserAgreement() {
    wx.navigateTo({ url: "/pages/legal/userAgreement/index" });
  },

  openPrivacyPolicy() {
    wx.navigateTo({ url: "/pages/legal/privacyPolicy/index" });
  },
});


