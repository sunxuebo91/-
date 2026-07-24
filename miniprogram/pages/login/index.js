const { generateNickname } = require('../../utils/randomNickname.js');
const { loadShareLogo } = require('../../utils/shareLogo.js');

Page({
  data: {
    agreed: false,
    me: {
      avatarUrl: "",
      nickname: "",
    },
    shareLogo: '', // 品牌 LOGO URL（云存储临时链接）
    statusBarHeight: 20, // 状态栏高度（iOS/Android 自适应）
    navBarHeight: 44,    // 导航栏内容高度
  },

  async onLoad(options) {
    console.log('📱 登录页加载');

    // 登录成功后要跳回的目标页（如 /pages/aiMatch/index），由来源页通过 url 参数传入
    // 注意：微信框架已对 options 做过一次 decode，这里直接取值，异常兜底为 null
    try {
      this._redirect = (options && options.redirect) || null;
    } catch (e) {
      this._redirect = null;
    }

    // 自适应状态栏 + 导航栏高度
    try {
      const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      // 胶囊按钮位置 → 导航栏内容高度计算
      const menuRect = wx.getMenuButtonBoundingClientRect
        ? wx.getMenuButtonBoundingClientRect()
        : null;
      if (menuRect && menuRect.top) {
        // 导航栏内容高度 = (胶囊顶 - 状态栏高) * 2 + 胶囊高
        const navContentHeight = (menuRect.top - sysInfo.statusBarHeight) * 2 + menuRect.height;
        this.setData({
          statusBarHeight: sysInfo.statusBarHeight || 20,
          navBarHeight: navContentHeight || 44,
        });
      } else {
        this.setData({
          statusBarHeight: sysInfo.statusBarHeight || 20,
          navBarHeight: 44,
        });
      }
    } catch (e) {
      console.warn('读取系统信息失败，使用默认导航栏高度', e);
    }

    // 加载品牌 LOGO
    loadShareLogo(this);

    // 加载用户信息（用于微信登录）
    this.loadMe();
  },

  // 自定义导航栏返回按钮
  onNavBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/home/index' });
    }
  },

  async loadMe() {
    try {
      const resp = await wx.cloud.callFunction({
        name: "userService",
        data: { action: "getOrCreateMe" },
      });
      const me = (resp.result && resp.result.data) || {};
      this.setData({ me });
    } catch (e) {
      console.error("加载用户信息失败", e);
    }
  },

  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  async onGetPhoneNumber(e) {
    // 未勾选协议时自动勾选（点击登录即视为同意）
    if (!this.data.agreed) {
      this.setData({ agreed: true });
    }

    console.log("手机号授权回调", e);

    if (e.detail.errMsg !== "getPhoneNumber:ok") {
      wx.showToast({ title: "未授权", icon: "none" });
      return;
    }

    wx.showLoading({ title: "登录中..." });

    try {
      // 1. 生成随机昵称（用户后续可在设置页修改）
      const randomNick = generateNickname();
      console.log('🎲 生成随机昵称:', randomNick);

      // 2. 调用云函数解密手机号并保存到云数据库
      const res = await wx.cloud.callFunction({
        name: "userService",
        data: {
          action: "loginByPhone",
          code: e.detail.code,
          nickname: randomNick,
          avatarUrl: '', // 默认无头像，用户可在设置页自行上传
        },
      });

      if (res.result && res.result.success) {
        const userData = res.result.data;
        const phone = userData.phone;
        const openid = userData._openid;

        console.log("✅ 手机号登录成功，手机号:", phone);
        console.log("✅ OpenID:", openid);

        // 兜底：CRM 接口未返回成功也保证本地有基础登录态（含 phone/openid），
        // 否则后续依赖 crmUserInfo.phone 的模块（如我的视频）会判定未登录
        const baseUserInfo = {
          phone,
          openid,
          _openid: openid,
          nickname: randomNick,
          avatar: '',
          avatarUrl: '',
        };
        wx.setStorageSync('crmUserInfo', baseUserInfo);
        const app0 = getApp();
        if (app0 && app0.globalData) app0.globalData.userInfo = baseUserInfo;

        // 3. 调用 CRM 后端注册接口，同步用户信息
        // crmConflict: CRM 返回 409 时置 true；用于阻止后续"登录成功"提示与跳转，
        // 避免用户在账号冲突场景下看到误导性的"登录成功"
        let crmConflict = false;
        try {

          // 调用 CRM 后端注册接口
          const crmRes = await new Promise((resolve, reject) => {
            wx.request({
              url: 'https://crm.andejiazheng.com/api/miniprogram-users/register',
              method: 'POST',
              data: {
                openid: openid,
                phone: phone,
                nickname: randomNick,
                avatar: '',
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

          // 新契约：按 statusCode + body.code 分支，不解析裸 message
          const crmStatus = crmRes.statusCode;
          const crmBody = crmRes.data || {};
          const crmErrCode = crmBody.code || '';

          if ((crmStatus === 200 || crmStatus === 201) && crmBody.success) {
            console.log('✅ 用户信息已同步到 CRM 后端');

            const crmData = crmBody.data || {};

            // 保存 CRM Token（注册/登录接口返回的 JWT，供 authenticatedRequest 使用）
            const crmToken = crmRes.data.access_token || crmRes.data.token
              || crmData.access_token || crmData.token;
            if (crmToken) {
              wx.setStorageSync('access_token', crmToken);
              wx.setStorageSync('token', crmToken);
              console.log('✅ CRM Token 已保存');
            } else {
              console.warn('⚠️ CRM 注册接口未返回 token，尝试调用 miniprogram-login 获取');
              // 用 wx.login code + phone 换 JWT
              try {
                const freshLogin = await new Promise((resolve, reject) => {
                  wx.login({ success: resolve, fail: reject });
                });
                const tokenRes = await new Promise((resolve, reject) => {
                  wx.request({
                    url: 'https://crm.andejiazheng.com/api/auth/miniprogram-login',
                    method: 'POST',
                    data: { code: freshLogin.code, phone },
                    header: { 'Content-Type': 'application/json' },
                    success: resolve,
                    fail: reject,
                  });
                });
                const tokenBody = tokenRes.data || {};
                const loginToken = tokenBody.access_token || tokenBody.token
                  || tokenBody.data?.access_token || tokenBody.data?.token;
                if (loginToken) {
                  wx.setStorageSync('access_token', loginToken);
                  wx.setStorageSync('token', loginToken);
                  console.log('✅ JWT Token（miniprogram-login）已保存');
                } else {
                  console.warn('⚠️ miniprogram-login 未返回 token:', tokenBody);
                }
              } catch (tokenErr) {
                console.warn('⚠️ 获取 JWT Token 失败（不影响主流程）:', tokenErr);
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
              nickname: randomNick,
              // 默认无头像，用户可在设置页自行上传
              avatar: '',
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
          } else if (crmStatus === 409) {
            // 唯一索引冲突：手机号 / 用户名 / openid 已被占用
            // 设置 crmConflict 以阻止下方的"登录成功"覆盖此提示并阻止跳转
            crmConflict = true;
            const tip = {
              DUPLICATE_PHONE:    '该手机号已绑定其他微信，请联系客服处理',
              DUPLICATE_USERNAME: '该用户名已被占用',
              DUPLICATE_OPENID:   '该微信账号已绑定其他记录',
            }[crmErrCode] || crmBody.message || '账号冲突，请联系客服';
            wx.showToast({ title: tip, icon: 'none', duration: 2500 });
            console.warn('⚠️ CRM 注册冲突: code=', crmErrCode);
          } else {
            console.warn('⚠️ CRM 注册接口异常: statusCode=', crmStatus, 'code=', crmErrCode, 'msg=', crmBody.message);
          }
        } catch (crmErr) {
          console.error('❌ 调用 CRM 注册接口失败:', crmErr);
          // CRM 接口失败不影响登录流程
        }

        // 4. 登录成功提示与跳转：CRM 账号冲突（409）时跳过，留在登录页让用户处理
        if (!crmConflict) {
          wx.showToast({ title: "登录成功" });
          // 存句柄：用户在 1.5s 内退出登录页时 onUnload 里清掉，避免跳转打到已销毁页面
          this._loginJumpTimer = setTimeout(() => {
            // 来源页带了 redirect（如 AI 匹配）时优先跳回目标页
            if (this._redirect) {
              wx.redirectTo({
                url: this._redirect,
                fail: () => { wx.switchTab({ url: '/pages/home/index' }); },
              });
              return;
            }
            const pages = getCurrentPages();
            if (pages.length > 1) {
              wx.navigateBack();
            } else {
              wx.switchTab({ url: '/pages/home/index' });
            }
          }, 1500);
        }
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

  onUnload() {
    // 清掉登录成功后的延时跳转，避免打到已销毁页面
    if (this._loginJumpTimer) {
      clearTimeout(this._loginJumpTimer);
      this._loginJumpTimer = null;
    }
  },
});


