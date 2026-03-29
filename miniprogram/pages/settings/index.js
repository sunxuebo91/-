Page({
  data: {
    me: {
      nickname: "",
      avatarUrl: "",
      phone: "",
    },
    tempAvatarUrl: "", // 临时头像
    tempNickname: "", // 临时昵称
  },

  onLoad() {
    this.loadMe();
  },

  onShow() {
    // 从登录页返回时，重新拉取一次，确保手机号/头像昵称等信息自动同步展示
    this.loadMe();
  },


  async loadMe() {
    try {
      const resp = await wx.cloud.callFunction({
        name: "userService",
        data: { action: "getOrCreateMe" },
      });
      const me = (resp.result && resp.result.data) || {};

      console.log("loadMe 返回的数据:", me);

      // 如果已有临时数据（用户正在编辑），保留临时数据
      const tempNickname = this.data.tempNickname || me.nickname || "";
      const tempAvatarUrl = this.data.tempAvatarUrl || me.avatarUrl || "";

      this.setData({
        me,
        tempNickname,
        tempAvatarUrl,
      });

      console.log("setData 后的 me:", this.data.me);
    } catch (e) {
      console.error("loadMe 失败:", e);
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({
      tempAvatarUrl: avatarUrl,
    });
  },

  onNicknameBlur(e) {
    const nickname = e.detail.value.trim();
    this.setData({
      tempNickname: nickname,
    });
  },

  async onGetPhoneNumber(e) {
    console.log("手机号授权回调", e);

    if (e.detail.errMsg !== "getPhoneNumber:ok") {
      wx.showToast({ title: "未授权", icon: "none" });
      return;
    }

    wx.showLoading({ title: "获取中..." });

    try {
      // 如果有新头像，先上传到云存储
      let avatarUrl = this.data.tempAvatarUrl || this.data.me.avatarUrl;
      if (avatarUrl && avatarUrl.startsWith("http://tmp/")) {
        try {
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: `avatars/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
            filePath: avatarUrl,
          });
          avatarUrl = uploadRes.fileID;
        } catch (uploadErr) {
          console.error("上传头像失败", uploadErr);
          // 上传失败不影响授权流程
        }
      }

      // 使用临时数据，而不是 me 中的数据
      const res = await wx.cloud.callFunction({
        name: "userService",
        data: {
          action: "loginByPhone",
          code: e.detail.code,
          nickname: this.data.tempNickname || this.data.me.nickname,
          avatarUrl: avatarUrl,
        },
      });

      console.log("loginByPhone 返回结果:", res);

      if (res.result && res.result.success) {
        console.log("授权成功，返回的用户数据:", res.result.data);
        // 同步昵称/头像到本地缓存，供分享时直接读取
        const savedNickname = this.data.tempNickname || this.data.me.nickname;
        if (savedNickname) wx.setStorageSync('userName', savedNickname);
        if (avatarUrl) wx.setStorageSync('userAvatar', avatarUrl);
        wx.showToast({ title: "授权成功" });
        // 重新加载用户信息，包括手机号
        await this.loadMe();
      } else {
        console.log("授权失败:", res);
        wx.showToast({ title: "授权失败", icon: "none" });
      }
    } catch (err) {
      console.error("授权失败", err);
      wx.showToast({ title: "授权失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  async onSave() {
    const { tempNickname, tempAvatarUrl } = this.data;

    if (!tempNickname) {
      wx.showToast({ title: "请输入昵称", icon: "none" });
      return;
    }

    wx.showLoading({ title: "保存中..." });

    try {
      // 如果有新头像，先上传到云存储
      let avatarUrl = tempAvatarUrl;
      if (avatarUrl && avatarUrl.startsWith("http://tmp/")) {
        try {
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: `avatars/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
            filePath: avatarUrl,
          });
          avatarUrl = uploadRes.fileID;
        } catch (uploadErr) {
          console.error("上传头像失败", uploadErr);
          wx.showToast({ title: "上传头像失败", icon: "none" });
          wx.hideLoading();
          return;
        }
      }

      await wx.cloud.callFunction({
        name: "userService",
        data: {
          action: "updateMe",
          data: {
            nickname: tempNickname,
            avatarUrl: avatarUrl,
          },
        },
      });

      // 同步到本地缓存，供分享卡片/海报直接读取（避免还要异步调云函数）
      wx.setStorageSync('userName', tempNickname);
      if (avatarUrl) wx.setStorageSync('userAvatar', avatarUrl);

      wx.showToast({ title: "保存成功" });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (e) {
      console.error("保存失败", e);
      wx.showToast({ title: "保存失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },
});

