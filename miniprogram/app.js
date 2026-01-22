// app.js
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

    // 小程序启动时自动登录（使用 OpenID）
    this.autoLogin();
  },

  /**
   * 自动登录：使用 OpenID 调用 CRM 后端登录接口
   * 无需用户授权，静默登录
   */
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

      if (apiRes.data && apiRes.data.success) {
        const userData = apiRes.data.data;
        this.globalData.userInfo = userData;

        // 保存到本地存储
        wx.setStorageSync('crmUserInfo', userData);

        console.log('✅ 自动登录成功:', userData);
        console.log('📱 是否已授权手机号:', userData.hasPhone ? '是' : '否');

        // 如果是新用户或未授权手机号，可以在这里做一些提示
        if (!userData.hasPhone) {
          console.log('💡 提示：用户尚未授权手机号，可在首页引导授权');
        }
      } else {
        console.warn('⚠️ CRM 登录接口返回失败:', apiRes.data?.message);
      }
    } catch (err) {
      console.error('❌ 自动登录失败:', err);
      // 登录失败不影响小程序正常使用
    }
  }
});
