// app.js
const RESUME_VIEW_TEMPLATE_ID = 'VXhA_qhgIRRy8avH1X9uE-eLGk--0M5Bs9Q27EEDmrM';

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
        console.log('🔄 检测新版本:', res && res.hasUpdate ? '有' : '无');
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
      console.log('🔐 开始自动登录...');

      // 1. 调用 wx.login 获取 code
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        });
      });

      if (!loginRes.code) {
        console.error('❌ 获取登录 code 失败');
        return;
      }

      console.log('✅ 获取登录 code 成功:', loginRes.code);

      // 2. 调用云函数获取 OpenID
      const cloudRes = await wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'getOrCreateMe' }
      });

      const openid = cloudRes.result?.data?._openid;
      if (!openid) {
        console.error('❌ 获取 OpenID 失败');
        return;
      }

      console.log('✅ 获取 OpenID 成功:', openid);

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

      if (statusCode === 200 && body.success) {
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

        // 调小程序专属登录接口换取 JWT Token，供 authenticatedRequest 使用
        try {
          const tokenRes = await new Promise((resolve, reject) => {
            wx.request({
              url: 'https://crm.andejiazheng.com/api/auth/miniprogram/login',
              method: 'POST',
              data: { openid },
              header: { 'Content-Type': 'application/json' },
              success: resolve,
              fail: reject,
            });
          });
          const jwtToken = tokenRes.data?.data?.token || tokenRes.data?.token;
          if (jwtToken) {
            wx.setStorageSync('access_token', jwtToken);
            wx.setStorageSync('token', jwtToken);
            console.log('✅ 小程序 JWT Token 已保存');
          } else {
            console.warn('⚠️ miniprogram/login 未返回 token:', tokenRes.data);
          }
        } catch (tokenErr) {
          console.warn('⚠️ 获取小程序 JWT Token 失败（不影响主流程）:', tokenErr);
        }

        console.log('✅ 自动登录成功:', merged);
        console.log('📱 是否已授权手机号:', merged.phone ? '是' : '否');

        // 登录成功后拉取未读消息数，更新 tabBar 红点
        if (merged.phone) {
          this.refreshMessageBadge(merged.phone);
          // 同步手机号到云数据库 users 集合
          // 员工若通过账号密码登录，users.phone 可能为空，这里补齐
          // notificationService 依赖 users.phone 查 openid 发订阅消息
          wx.cloud.callFunction({
            name: 'userService',
            data: { action: 'updateMe', data: { phone: merged.phone } }
          }).catch(err => console.warn('⚠️ 同步手机号到云数据库失败（不影响使用）:', err));
        }
      } else if (statusCode === 404 && errCode === 'USER_NOT_REGISTERED') {
        // 当前 openid 在 CRM 尚未建号；等用户主动点手机号授权登录时再调 register
        console.log('ℹ️ 该 openid 尚未在 CRM 注册，等待用户手机号授权登录');
      } else if (statusCode === 409) {
        // 唯一索引冲突类错误：按 code 分流，不解析 message
        const dupTip = {
          DUPLICATE_PHONE:    '手机号已绑定其他微信账号',
          DUPLICATE_USERNAME: '该用户名已被占用',
          DUPLICATE_OPENID:   '该微信账号已绑定其他记录',
        }[errCode];
        console.warn('⚠️ CRM 登录冲突: code=', errCode, 'tip=', dupTip || body.message || '');
      } else {
        console.warn('⚠️ CRM 登录接口异常: statusCode=', statusCode, 'code=', errCode, 'msg=', body.message);
      }
    } catch (err) {
      console.error('❌ 自动登录失败:', err);
      // 登录失败不影响小程序正常使用
    }
  },

  onShow() {
    // 每次切到前台时，计算员工是否需要订阅提醒，结果存到 globalData 供 profile 页读取
    this.calcSubscribeReminder();
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

  /** 拉取未读数并更新所有页面的 tabBar 红点 */
  async refreshMessageBadge(phone) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'notificationService',
        data: { action: 'getList', phone, page: 1, pageSize: 1 },
      });
      const count = res?.result?.data?.unreadCount || 0;
      // 存全局，消息页 onShow 时也可读取
      this.globalData.messageUnreadCount = count;
      // 通知当前 tabBar 实例（如已渲染）
      const pages = getCurrentPages();
      pages.forEach(p => {
        if (typeof p.getTabBar === 'function' && p.getTabBar()) {
          p.getTabBar().setData({ messageBadge: count });
        }
      });
    } catch (e) {
      console.warn('[app] refreshMessageBadge failed:', e.message);
    }
  }
});
