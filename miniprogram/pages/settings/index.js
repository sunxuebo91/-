Page({
  data: {
    me: {
      nickname: "",
      avatarUrl: "",
      phone: "",
    },
    tempAvatarUrl: "", // 临时头像
    tempNickname: "",  // 临时昵称
  },

  onLoad() {
    this.loadMe();
  },

  onShow() {
    this.loadMe();
  },

  async loadMe() {
    try {
      const resp = await wx.cloud.callFunction({
        name: "userService",
        data: { action: "getOrCreateMe" },
      });
      const serverMe = (resp.result && resp.result.data) || {};

      const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
      const mergedMe = Object.assign({}, this.data.me, serverMe);
      // nickname: 云端有值则用云端，否则用本地存储
      if (!mergedMe.nickname && crmUserInfo.nickname) {
        mergedMe.nickname = crmUserInfo.nickname;
      }
      // avatarUrl: 云端有值则用云端，否则用本地存储
      if (!mergedMe.avatarUrl && (crmUserInfo.avatarUrl || crmUserInfo.avatar)) {
        mergedMe.avatarUrl = crmUserInfo.avatarUrl || crmUserInfo.avatar;
      }
      // phone: 云端有值则用云端，否则用本地存储
      if (!mergedMe.phone && crmUserInfo.phone) {
        mergedMe.phone = crmUserInfo.phone;
      }

      // 保留用户正在编辑的临时数据
      const tempNickname = this.data.tempNickname || mergedMe.nickname || "";
      const tempAvatarUrl = this.data.tempAvatarUrl || mergedMe.avatarUrl || "";

      this.setData({
        me: mergedMe,
        tempNickname,
        tempAvatarUrl,
      });
    } catch (e) {
      console.error("loadMe 失败:", e);
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  // 头像选择
  onChooseAvatar(e) {
    this.setData({ tempAvatarUrl: e.detail.avatarUrl });
  },

  // 昵称输入
  onNicknameInput(e) {
    this.setData({ tempNickname: e.detail.value.trim() });
  },

  onNicknameBlur(e) {
    this.setData({ tempNickname: e.detail.value.trim() });
  },

  // 手机号授权
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
        }
      }

      // 用临时数据同步更新
      const res = await wx.cloud.callFunction({
        name: "userService",
        data: {
          action: "loginByPhone",
          code: e.detail.code,
          nickname: this.data.tempNickname || this.data.me.nickname,
          avatarUrl: avatarUrl,
        },
      });

      if (res.result && res.result.success) {
        const updatedUser = res.result.data || {};

        if (!updatedUser.phone) {
          wx.showToast({ title: "获取手机号失败", icon: "none" });
          return;
        }

        // 同步昵称/头像到本地缓存
        const savedNickname = this.data.tempNickname || this.data.me.nickname;
        if (savedNickname) wx.setStorageSync('userName', savedNickname);
        if (avatarUrl) wx.setStorageSync('userAvatar', avatarUrl);

        // 同步 crmUserInfo
        const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
        if (updatedUser.phone) crmUserInfo.phone = updatedUser.phone;
        if (savedNickname) crmUserInfo.nickname = savedNickname;
        if (avatarUrl) crmUserInfo.avatarUrl = avatarUrl;
        wx.setStorageSync('crmUserInfo', crmUserInfo);

        // 同步 app.globalData.userInfo
        const app = getApp();
        if (app.globalData && app.globalData.userInfo) {
          if (updatedUser.phone) app.globalData.userInfo.phone = updatedUser.phone;
          if (savedNickname) app.globalData.userInfo.nickname = savedNickname;
          if (avatarUrl) app.globalData.userInfo.avatarUrl = avatarUrl;
        }

        // 刷新本页
        this.setData({ me: Object.assign({}, this.data.me, updatedUser) });
        wx.showToast({ title: "授权成功" });
        setTimeout(() => this.loadMe(), 500);
      } else {
        wx.showToast({ title: "授权失败", icon: "none" });
      }
    } catch (err) {
      console.error("授权失败", err);
      wx.showToast({ title: "授权失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  // 保存修改（昵称可选）
  async onSave() {
    const { tempNickname, tempAvatarUrl, me } = this.data;

    // 昵称可选：未填时保留原昵称或用兜底（手机号后四位）
    const finalNickname = (tempNickname || '').trim()
      || (me.nickname || '').trim()
      || (me.phone ? `用户${me.phone.slice(-4)}` : '安得褓贝用户');

    wx.showLoading({ title: "保存中..." });

    try {
      // 上传新头像
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

      const res = await wx.cloud.callFunction({
        name: "userService",
        data: {
          action: "updateMe",
          data: {
            nickname: finalNickname,
            avatarUrl: avatarUrl,
          },
        },
      });

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.errMsg || '保存失败');
      }

      // 同步本地缓存
      wx.setStorageSync('userName', finalNickname);
      if (avatarUrl) wx.setStorageSync('userAvatar', avatarUrl);

      // 同步 crmUserInfo
      const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
      crmUserInfo.nickname = finalNickname;
      if (avatarUrl) crmUserInfo.avatarUrl = avatarUrl;
      wx.setStorageSync('crmUserInfo', crmUserInfo);

      // 同步 app.globalData.userInfo
      const app = getApp();
      if (app.globalData && app.globalData.userInfo) {
        app.globalData.userInfo.nickname = finalNickname;
        if (avatarUrl) app.globalData.userInfo.avatarUrl = avatarUrl;
      }

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
