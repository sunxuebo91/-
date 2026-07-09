Page({
  data: {
    me: {
      nickname: "",
      avatarUrl: "",
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

      // 合并本地 crmUserInfo（手机号/真实姓名等）
      const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
      const mergedMe = Object.assign({}, this.data.me, serverMe);
      if (!mergedMe.nickname && crmUserInfo.nickname) {
        mergedMe.nickname = crmUserInfo.nickname;
      }
      if (!mergedMe.avatarUrl && (crmUserInfo.avatarUrl || crmUserInfo.avatar)) {
        mergedMe.avatarUrl = crmUserInfo.avatarUrl || crmUserInfo.avatar;
      }
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
    }
  },

  onChooseAvatar(e) {
    this.setData({ tempAvatarUrl: e.detail.avatarUrl });
  },

  onNicknameInput(e) {
    this.setData({ tempNickname: e.detail.value.trim() });
  },

  onNicknameBlur(e) {
    this.setData({ tempNickname: e.detail.value.trim() });
  },

  async onSave() {
    const { tempNickname, tempAvatarUrl, me } = this.data;

    // 昵称可选：未填时保留原昵称或用兜底（手机号后四位）
    const finalNickname = (tempNickname || '').trim()
      || (me.nickname || '').trim()
      || (me.phone ? `用户${me.phone.slice(-4)}` : '安得褓贝用户');

    wx.showLoading({ title: "保存中..." });

    try {
      // 上传新头像到云存储
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

      // 同步本地缓存（分享卡片/海报直接读取）
      wx.setStorageSync('userName', finalNickname);
      if (avatarUrl) wx.setStorageSync('userAvatar', avatarUrl);

      // 同步 crmUserInfo（个人中心页能立即看到）
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
