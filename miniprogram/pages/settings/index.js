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
      const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
      const openid = crmUserInfo.openid || crmUserInfo._openid || '';

      let serverMe = {};

      if (openid) {
        // 主链路：从 CRM 拉取（权威来源）
        try {
          const crmRes = await new Promise((resolve, reject) => {
            wx.request({
              url: `https://crm.andejiazheng.com/api/miniprogram-users/info?openid=${openid}`,
              method: 'GET',
              success: resolve,
              fail: reject,
            });
          });
          if (crmRes.data && crmRes.data.success && crmRes.data.data) {
            const d = crmRes.data.data;
            serverMe = {
              nickname:  d.nickname  || '',
              avatarUrl: d.avatar    || '',   // CRM 字段是 avatar，映射到 avatarUrl
              phone:     d.phone     || '',
              role:      d.isStaff ? 'staff' : 'customer',
            };
            console.log('✅ CRM loadMe:', serverMe);
          }
        } catch (e) {
          console.warn('⚠️ CRM /info 失败，降级到微信云函数:', e);
        }
      }

      // 兜底：wx 云函数（openid 还没有，或 CRM 没返回数据时）
      if (!serverMe.phone && !serverMe.nickname) {
        const resp = await wx.cloud.callFunction({
          name: 'userService',
          data: { action: 'getOrCreateMe' },
        });
        const wxMe = (resp.result && resp.result.data) || {};
        serverMe = {
          nickname:  wxMe.nickname  || crmUserInfo.nickname  || '',
          avatarUrl: wxMe.avatarUrl || crmUserInfo.avatarUrl || crmUserInfo.avatar || '',
          phone:     wxMe.phone     || crmUserInfo.phone     || '',
          role:      wxMe.role      || 'customer',
        };
        console.log('✅ 云函数 loadMe 兜底:', serverMe);
      }

      const mergedMe = Object.assign({}, this.data.me, serverMe);

      // 如果已有临时数据（用户正在编辑），保留临时数据
      const tempNickname  = this.data.tempNickname  || mergedMe.nickname  || '';
      const tempAvatarUrl = this.data.tempAvatarUrl || mergedMe.avatarUrl || '';

      this.setData({ me: mergedMe, tempNickname, tempAvatarUrl });
      console.log('setData 后的 me:', this.data.me);
    } catch (e) {
      console.error('loadMe 失败:', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({
      tempAvatarUrl: avatarUrl,
    });
  },

  onNicknameInput(e) {
    // 实时更新昵称（用户选择微信昵称时会触发此事件）
    const nickname = e.detail.value.trim();
    this.setData({
      tempNickname: nickname,
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
        const updatedUser = res.result.data || {};
        console.log("授权成功，返回的用户数据:", updatedUser);
        console.log("updatedUser.phone:", updatedUser.phone);
        
        // 验证手机号是否存在
        if (!updatedUser.phone) {
          console.error("云函数返回的数据中没有 phone 字段！");
          wx.showToast({ title: "获取手机号失败", icon: "none" });
          return;
        }
        
        // 同步昵称/头像到本地缓存，供分享时直接读取
        const savedNickname = this.data.tempNickname || this.data.me.nickname;
        if (savedNickname) wx.setStorageSync('userName', savedNickname);
        if (avatarUrl) wx.setStorageSync('userAvatar', avatarUrl);

        // 同步更新 crmUserInfo 本地存储，确保个人中心页能显示最新数据
        const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
        if (updatedUser.phone) crmUserInfo.phone = updatedUser.phone;
        if (savedNickname) crmUserInfo.nickname = savedNickname;
        if (avatarUrl) crmUserInfo.avatarUrl = avatarUrl;
        // ⚠️ 不用 loginByPhone 的 role 判断 isStaff：
        //    loginByPhone 查的是小程序云数据库，员工可能在那里是 "customer"
        //    用 staff/info 接口（CRM User 表）才是权威来源
        wx.setStorageSync('crmUserInfo', crmUserInfo);

        // 用手机号调 staff/info 确认是否员工，并拉取 CRM 真实姓名和头像
        const staffPhone = updatedUser.phone;
        wx.request({
          url: `https://crm.andejiazheng.com/api/resumes/staff/info?phone=${staffPhone}`,
          method: 'GET',
          success: (staffRes) => {
            if (staffRes.data && staffRes.data.success && staffRes.data.data) {
              const staffData = staffRes.data.data;
              const cur = wx.getStorageSync('crmUserInfo') || {};
              cur.isStaff = true;
              cur.crmName = staffData.name || cur.crmName || '';
              cur.crmAvatar = staffData.avatar || cur.crmAvatar || '';
              wx.setStorageSync('crmUserInfo', cur);
              console.log('✅ 已同步更新 crmUserInfo:', cur);
            } else {
              // 非员工：不修改 isStaff（保留原值，避免误降级）
              console.log('ℹ️ staff/info 无数据，非员工用户');
            }
          },
          fail: () => {}
        });

        // 同步到 CRM 后端（openid + phone + nickname + avatar 全量写入）
        const crmSyncInfo = wx.getStorageSync('crmUserInfo') || {};
        const syncOpenid = updatedUser._openid || crmSyncInfo.openid || crmSyncInfo._openid || '';
        if (syncOpenid) {
          wx.request({
            url: 'https://crm.andejiazheng.com/api/miniprogram-users/register',
            method: 'POST',
            header: { 'Content-Type': 'application/json' },
            data: {
              openid:   syncOpenid,
              phone:    updatedUser.phone || crmSyncInfo.phone || '',
              nickname: savedNickname || '',
              avatar:   avatarUrl || crmSyncInfo.avatarUrl || crmSyncInfo.avatar || '',
            },
            success: (r) => console.log('✅ 手机授权后已同步到CRM:', r.data),
            fail:    () => {}
          });
        }

        // 同步更新全局 app.globalData.userInfo
        const app = getApp();
        if (app.globalData && app.globalData.userInfo) {
          if (updatedUser.phone) app.globalData.userInfo.phone = updatedUser.phone;
          if (savedNickname) app.globalData.userInfo.nickname = savedNickname;
          if (avatarUrl) app.globalData.userInfo.avatarUrl = avatarUrl;
        }

        // 用云函数已返回的最新数据直接刷新 me（含手机号）
        const newMe = Object.assign({}, this.data.me, updatedUser);
        console.log("合并后的 newMe:", newMe);
        console.log("合并后的 newMe.phone:", newMe.phone);
        this.setData({ me: newMe }, () => {
          console.log("setData 完成，当前 me:", this.data.me);
          console.log("setData 完成，me.phone:", this.data.me.phone);
        });
        wx.showToast({ title: "授权成功" });
        // 延迟刷新角色等信息（避免竞态条件）
        setTimeout(() => this.loadMe(), 500);
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

      const res = await wx.cloud.callFunction({
        name: "userService",
        data: {
          action: "updateMe",
          data: {
            nickname: tempNickname,
            avatarUrl: avatarUrl,
          },
        },
      });

      console.log('updateMe 云函数返回:', res);

      // 检查云函数是否成功
      if (!res.result || !res.result.success) {
        console.error('updateMe 云函数调用失败:', res);
        throw new Error(res.result?.errMsg || '保存失败');
      }

      // 同步到本地缓存，供分享卡片/海报直接读取（避免还要异步调云函数）
      wx.setStorageSync('userName', tempNickname);
      if (avatarUrl) wx.setStorageSync('userAvatar', avatarUrl);

      // 同步更新 crmUserInfo 本地存储，确保个人中心页能显示最新数据
      const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
      crmUserInfo.nickname = tempNickname;
      if (avatarUrl) crmUserInfo.avatarUrl = avatarUrl;
      wx.setStorageSync('crmUserInfo', crmUserInfo);
      console.log('✅ 已同步更新 crmUserInfo:', crmUserInfo);

      // 同步到 CRM 后端（PATCH 只更新传入字段，不会覆盖手机号等其他字段）
      const saveOpenid = crmUserInfo.openid || crmUserInfo._openid || '';
      if (saveOpenid) {
        wx.request({
          url: 'https://crm.andejiazheng.com/api/miniprogram-users/update-profile',
          method: 'PATCH',
          header: { 'Content-Type': 'application/json' },
          data: {
            openid:   saveOpenid,
            nickname: tempNickname,
            avatar:   avatarUrl || crmUserInfo.avatarUrl || crmUserInfo.avatar || '',
          },
          success: (r) => console.log('✅ 昵称/头像已同步到CRM:', r.data),
          fail:    () => {}
        });
      } else {
        console.warn('⚠️ 无 openid，跳过 CRM 同步');
      }

      // 同步更新全局 app.globalData.userInfo
      const app = getApp();
      if (app.globalData && app.globalData.userInfo) {
        app.globalData.userInfo.nickname = tempNickname;
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

