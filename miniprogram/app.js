// app.js
const { TEMPLATES, topUpIfPermanent } = require('./utils/subscribe');
const RESUME_VIEW_TEMPLATE_ID = TEMPLATES.RESUME_VIEW;

App({
  onLaunch: function () {
    this.globalData = {
      // env 参数说明：
      //   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
      //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
      //   如不填则使用默认环境（第一个创建的环境）
      env: "cloud1-6gyrh73h8e8206ce",
      userInfo: null  // 用户信息
    };
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }

    // 一次性清空工资测评推荐人绑定（已执行可删除整段）
    try {
      const FLAG = 'salary_sharer_reset_v1';
      if (!wx.getStorageSync(FLAG)) {
        wx.removeStorageSync('salary_assessment_sharer');
        wx.setStorageSync(FLAG, 1);
        console.log('🔄 已清空工资测评推荐人绑定');
      }
    } catch (e) {}

    // 检查小程序新版本（有新版本则提示用户立即重启更新）
    this.checkForUpdates();

    // 小程序启动时自动登录（使用 OpenID）
    this.autoLogin();
  },

  /**
   * 自动登录：使用 OpenID 调用 CRM 后端登录接口
   * 无需用户授权，静默登录
   */
  checkForUpdates() {
    try {
      if (!wx.getUpdateManager) {
        console.log('ℹ️ 当前微信版本不支持 getUpdateManager');
        return;
      }

      const updateManager = wx.getUpdateManager();

      updateManager.onCheckForUpdate((res) => {
        if (res && res.hasUpdate) console.log('update available');
      });

      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '发现新版本',
          content: '新版本已准备好，是否立即重启更新？',
          confirmText: '立即更新',
          cancelText: '稍后',
          success: (res) => {
            if (res.confirm) {
              updateManager.applyUpdate();
            }
          }
        });
      });

      updateManager.onUpdateFailed(() => {
        wx.showModal({
          title: '更新失败',
          content: '新版本下载失败，请检查网络后重试，或稍后重新打开小程序。',
          showCancel: false,
          confirmText: '我知道了'
        });
      });
    } catch (e) {
      console.error('检查更新失败(忽略):', e);
    }
  },

  async autoLogin() {
    try {
      // 1. 调用 wx.login 获取 code
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        });
      });

      if (!loginRes.code) {
        console.error('autoLogin: no login code');
        return;
      }

      // 2. 调用云函数获取 OpenID
      const cloudRes = await wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'getOrCreateMe' }
      });

      const openid = cloudRes.result?.data?._openid;
      if (!openid) {
        console.error('autoLogin: no openid');
        return;
      }

      // 缓存 openid：简历公开接口用它识别员工身份（员工看真实姓名，其他身份脱敏）
      try { wx.setStorageSync('openid', openid); } catch (e) { /* ignore */ }

      // 3. 调用 CRM 后端登录接口
      const apiRes = await new Promise((resolve, reject) => {
        wx.request({
          url: 'https://crm.andejiazheng.com/api/miniprogram-users/login',
          method: 'POST',
          data: { openid },
          header: {
            'Content-Type': 'application/json'
          },
          success: resolve,
          fail: reject
        });
      });

      console.log('📡 CRM 登录接口响应:', apiRes);

      // 新契约：按 statusCode + body.code 分支，不再用裸 message 匹配
      const statusCode = apiRes.statusCode;
      const body = apiRes.data || {};
      const errCode = body.code || '';
      // 静默：只有错误才打日志
      if (statusCode !== 200 && statusCode !== 201) {
        console.warn('autoLogin: CRM /miniprogram-users/login 非 2xx:', statusCode);
      }

      if ((statusCode === 200 || statusCode === 201) && body.success) {
        const userData = body.data || {};
        this.globalData.userInfo = userData;

        // 合并保存：不能整体覆盖，否则会清掉之前授权/设置时存入的
        // crmName、crmAvatar、isStaff、nickname、phone 等字段
        const existing = wx.getStorageSync('crmUserInfo') || {};
        const merged = {
          ...userData,                                      // CRM login 最新数据
          phone:     existing.phone     || userData.phone     || '',
          nickname:  existing.nickname  || userData.nickname  || '',
          avatarUrl: existing.avatarUrl || userData.avatarUrl || '',
          avatar:    existing.avatar    || userData.avatar    || '',
          isStaff:   existing.isStaff   || userData.isStaff   || false,
          crmName:   existing.crmName   || userData.crmName   || '',
          crmAvatar: existing.crmAvatar || userData.crmAvatar || '',
        };
        wx.setStorageSync('crmUserInfo', merged);

        // 注：JWT token 流程已下线。当前功能（个人简历、接单大厅、我的合同等）
        // 走 publicRequest + 业务身份标识（phone/openid），不需要 JWT。
        // 以后如果有接口走 authenticatedRequest，再单独接入。

        // 登录成功后拉取未读消息数，更新 tabBar 红点
        if (merged.phone) {
          this.refreshMessageBadge(merged.phone, true);
          // 同步手机号到云数据库 users 集合
          wx.cloud.callFunction({
            name: 'userService',
            data: { action: 'updateMe', data: { phone: merged.phone } }
          }).catch(err => console.warn('sync phone err:', err.message));
        }
      } else if (statusCode === 404 && errCode === 'USER_NOT_REGISTERED') {
        // 当前 openid 在 CRM 尚未建号；等用户主动点手机号授权登录时再调 register
        console.log('ℹ️ 该 openid 尚未在 CRM 注册，等待用户手机号授权登录');
      } else if (statusCode === 409) {
        // 唯一索引冲突类错误：按 code 分流
        const dupTip = {
          DUPLICATE_PHONE:    '手机号已绑定其他微信账号',
          DUPLICATE_USERNAME: '该用户名已被占用',
          DUPLICATE_OPENID:   '该微信账号已绑定其他记录',
        }[errCode];
        console.warn('autoLogin conflict:', errCode || body.message);
      }
      // 其他非 2xx 已在上面统一 warn
    } catch (err) {
      console.error('autoLogin error:', err.message);
    }
  },

  onShow() {
    // 1. 每次切到前台时，计算员工是否需要订阅提醒
    this.calcSubscribeReminder();

    // 2. 刷新未读消息红点
    const crmUserInfo = wx.getStorageSync('crmUserInfo');
    if (crmUserInfo && crmUserInfo.phone) {
      this.refreshMessageBadge(crmUserInfo.phone);
    }

    // 3. 尝试为永久授权用户补配额（每天最多一次，避免频繁调用）
    if (crmUserInfo && crmUserInfo.isStaff) {
      const today = new Date().toDateString();
      if (wx.getStorageSync('topUpDate') !== today) {
        wx.setStorageSync('topUpDate', today);
        topUpIfPermanent();
      }
    }
  },

  /**
   * 计算是否需要展示订阅提醒（只存标记，不弹窗）
   * 实际弹窗必须在用户点击事件中调用 wx.requestSubscribeMessage
   */
  calcSubscribeReminder() {
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    if (!crmUserInfo.isStaff || !crmUserInfo.phone) {
      this.globalData.needSubscribeReminder = false;
      return;
    }

    wx.getSetting({
      withSubscriptions: true,
      success: (res) => {
        const itemSettings = (res.subscriptionsSetting || {}).itemSettings || {};
        // 已永久授权 → 不再提醒
        if (itemSettings[RESUME_VIEW_TEMPLATE_ID] === 'accept') {
          console.log('✅ 已永久订阅，无需提醒');
          this.globalData.needSubscribeReminder = false;
          return;
        }
        // 今天已提示过 → 不再提醒
        const today = new Date().toLocaleDateString();
        const lastDate = wx.getStorageSync('staffSubPromptDate');
        this.globalData.needSubscribeReminder = (lastDate !== today);
        console.log('📨 订阅提醒标记:', this.globalData.needSubscribeReminder);
      },
      fail: () => {
        this.globalData.needSubscribeReminder = false;
      }
    });
  },

  /** 拉取未读数并更新所有页面的 tabBar 红点（5 分钟内复用缓存，force=true 强制刷新） */
  async refreshMessageBadge(phone, force = false) {
    const now = Date.now();
    // 命中缓存：跳过网络请求，但仍把缓存未读数刷到当前页 tabBar（自定义 tabBar 每页一个实例）
    if (!force && this.globalData.lastBadgeRefresh
        && (now - this.globalData.lastBadgeRefresh) < 5 * 60 * 1000) {
      this._applyTabBarBadge(this.globalData.messageUnreadCount || 0);
      return;
    }
    try {
      const res = await wx.cloud.callFunction({
        name: 'notificationService',
        data: { action: 'getList', phone, page: 1, pageSize: 1 },
      });
      const count = res?.result?.data?.unreadCount || 0;
      // 存全局，消息页 onShow 时也可读取
      this.globalData.messageUnreadCount = count;
      this.globalData.lastBadgeRefresh = now;
      this._applyTabBarBadge(count);
    } catch (e) {
      console.warn('[app] refreshMessageBadge failed:', e.message);
    }
  },

  /** 把未读数刷到当前所有已渲染页面的 tabBar 实例 */
  _applyTabBarBadge(count) {
    const pages = getCurrentPages();
    pages.forEach(p => {
      if (typeof p.getTabBar === 'function' && p.getTabBar()) {
        p.getTabBar().setData({ messageBadge: count });
      }
    });
  }
});
