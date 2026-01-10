Page({
  data: {
    username: "",
    password: "",
    confirmPassword: "",
    nickname: "",
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  onConfirmPasswordInput(e) {
    this.setData({ confirmPassword: e.detail.value });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  async onRegister() {
    const { username, password, confirmPassword, nickname } = this.data;

    // 验证账号
    if (!username || !username.trim()) {
      wx.showToast({ title: "请输入账号", icon: "none" });
      return;
    }

    if (!/^[a-zA-Z0-9]{4,20}$/.test(username.trim())) {
      wx.showToast({ title: "账号必须是4-20位字母或数字", icon: "none" });
      return;
    }

    // 验证密码
    if (!password || password.length < 6) {
      wx.showToast({ title: "密码至少6位", icon: "none" });
      return;
    }

    if (password !== confirmPassword) {
      wx.showToast({ title: "两次密码不一致", icon: "none" });
      return;
    }

    // 验证昵称
    if (!nickname || !nickname.trim()) {
      wx.showToast({ title: "请输入昵称", icon: "none" });
      return;
    }

    wx.showLoading({ title: "注册中..." });

    try {
      const res = await wx.cloud.callFunction({
        name: "userService",
        data: {
          action: "accountRegister",
          username: username.trim(),
          password: password,
          nickname: nickname.trim(),
        },
      });

      if (res.result && res.result.success) {
        wx.showModal({
          title: "注册成功",
          content: "请返回登录页面使用账号密码登录",
          showCancel: false,
          success: () => {
            wx.navigateBack();
          },
        });
      } else {
        wx.showToast({ 
          title: res.result?.errMsg || "注册失败", 
          icon: "none" 
        });
      }
    } catch (err) {
      console.error("注册失败", err);
      wx.showToast({ title: "注册失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  goLogin() {
    wx.navigateBack();
  },
});

