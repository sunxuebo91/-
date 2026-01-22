// 测试小程序用户管理 API
Page({
  data: {
    logs: [],
    testResults: {
      loginTest: null,
      registerTest: null
    }
  },

  onLoad() {
    this.addLog('📱 小程序用户管理 API 测试页面');
    this.addLog('点击下方按钮开始测试');
  },

  addLog(msg) {
    const logs = this.data.logs;
    const timestamp = new Date().toLocaleTimeString();
    logs.push(`[${timestamp}] ${msg}`);
    this.setData({ logs });
    console.log(msg);
  },

  clearLogs() {
    this.setData({ logs: [] });
  },

  // 测试登录接口
  async testLoginApi() {
    this.addLog('');
    this.addLog('🧪 ========== 测试登录接口 ==========');
    
    try {
      // 1. 获取 OpenID
      this.addLog('📡 步骤1: 获取 OpenID...');
      const cloudRes = await wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'getOrCreateMe' }
      });

      const openid = cloudRes.result?.data?._openid;
      if (!openid) {
        this.addLog('❌ 获取 OpenID 失败');
        this.setData({ 'testResults.loginTest': 'failed' });
        return;
      }

      this.addLog(`✅ OpenID: ${openid}`);

      // 2. 调用登录接口
      this.addLog('📡 步骤2: 调用登录接口...');
      this.addLog(`📡 URL: POST https://crm.andejiazheng.com/api/miniprogram-users/login`);
      this.addLog(`📡 参数: { openid: "${openid}" }`);

      const res = await new Promise((resolve, reject) => {
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

      this.addLog(`📡 HTTP 状态码: ${res.statusCode}`);
      this.addLog(`📦 响应数据: ${JSON.stringify(res.data, null, 2)}`);

      if (res.statusCode === 200 && res.data && res.data.success) {
        this.addLog('✅ 登录接口测试成功！');
        this.addLog(`✅ 用户ID: ${res.data.data?.userId || '未返回'}`);
        this.addLog(`✅ 手机号: ${res.data.data?.phone || '未授权'}`);
        this.addLog(`✅ 昵称: ${res.data.data?.nickname || '未设置'}`);
        this.addLog(`✅ 是否已授权手机号: ${res.data.data?.hasPhone ? '是' : '否'}`);
        this.setData({ 'testResults.loginTest': 'success' });
      } else {
        this.addLog(`⚠️ 登录接口返回失败: ${res.data?.message || '未知错误'}`);
        this.setData({ 'testResults.loginTest': 'failed' });
      }
    } catch (err) {
      this.addLog(`❌ 登录接口请求失败: ${err.errMsg || err.message || JSON.stringify(err)}`);
      this.setData({ 'testResults.loginTest': 'error' });
    }
  },

  // 测试注册接口
  async testRegisterApi() {
    this.addLog('');
    this.addLog('🧪 ========== 测试注册接口 ==========');
    
    try {
      // 1. 获取 OpenID
      this.addLog('📡 步骤1: 获取 OpenID...');
      const cloudRes = await wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'getOrCreateMe' }
      });

      const openid = cloudRes.result?.data?._openid;
      if (!openid) {
        this.addLog('❌ 获取 OpenID 失败');
        this.setData({ 'testResults.registerTest': 'failed' });
        return;
      }

      this.addLog(`✅ OpenID: ${openid}`);

      // 2. 调用注册接口（使用测试数据）
      this.addLog('📡 步骤2: 调用注册接口...');
      this.addLog(`📡 URL: POST https://crm.andejiazheng.com/api/miniprogram-users/register`);
      
      const testData = {
        openid: openid,
        phone: '13800138000',  // 测试手机号
        nickname: '测试用户',
        avatar: 'https://thirdwx.qlogo.cn/mmopen/test.jpg',
        gender: 1,
        city: '北京市',
        province: '北京'
      };

      this.addLog(`📡 参数: ${JSON.stringify(testData, null, 2)}`);

      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: 'https://crm.andejiazheng.com/api/miniprogram-users/register',
          method: 'POST',
          data: testData,
          header: {
            'Content-Type': 'application/json'
          },
          success: resolve,
          fail: reject
        });
      });

      this.addLog(`📡 HTTP 状态码: ${res.statusCode}`);
      this.addLog(`📦 响应数据: ${JSON.stringify(res.data, null, 2)}`);

      if (res.statusCode === 200 && res.data && res.data.success) {
        this.addLog('✅ 注册接口测试成功！');
        this.addLog(`✅ 用户ID: ${res.data.data?.userId || '未返回'}`);
        this.addLog(`✅ 是否新用户: ${res.data.data?.isNewUser ? '是' : '否'}`);
        this.addLog(`✅ 消息: ${res.data.data?.message || res.data.message}`);
        this.setData({ 'testResults.registerTest': 'success' });
      } else {
        this.addLog(`⚠️ 注册接口返回失败: ${res.data?.message || '未知错误'}`);
        this.setData({ 'testResults.registerTest': 'failed' });
      }
    } catch (err) {
      this.addLog(`❌ 注册接口请求失败: ${err.errMsg || err.message || JSON.stringify(err)}`);
      this.setData({ 'testResults.registerTest': 'error' });
    }
  },

  // 测试所有接口
  async testAllApis() {
    this.clearLogs();
    this.addLog('🚀 开始测试所有接口...');
    
    await this.testLoginApi();
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
    await this.testRegisterApi();
    
    this.addLog('');
    this.addLog('🎉 所有测试完成！');
  }
});

