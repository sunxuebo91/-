/**
 * 文章接口测试页面
 * 用于诊断文章接口是否正常工作
 */

Page({
  data: {
    testResults: []
  },

  onLoad() {
    console.log('📋 文章接口测试页面加载');
  },

  // 测试文章列表接口
  async testArticleList() {
    this.addLog('🧪 开始测试文章列表接口...');

    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: 'https://crm.andejiazheng.com/api/articles/miniprogram/list?page=1&pageSize=10',
          method: 'GET',
          header: {
            'Content-Type': 'application/json',
            'X-Client-Type': 'miniprogram',
            'X-Platform': 'wechat'
          },
          success: resolve,
          fail: reject
        });
      });

      this.addLog(`✅ 接口响应成功 (状态码: ${res.statusCode})`);
      this.addLog(`📦 响应数据: ${JSON.stringify(res.data, null, 2)}`);
      
      if (res.data && res.data.success) {
        const articles = res.data.data?.list || [];
        this.addLog(`📰 获取到 ${articles.length} 篇文章`);
      } else {
        this.addLog(`⚠️ 接口返回失败: ${res.data?.message || '未知错误'}`);
      }
    } catch (err) {
      this.addLog(`❌ 接口请求失败: ${err.errMsg || err.message || JSON.stringify(err)}`);
    }
  },

  // 测试 Banner 接口（对比）
  async testBannerApi() {
    this.addLog('🧪 开始测试 Banner 接口（对比）...');
    
    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: 'https://crm.andejiazheng.com/api/banners/miniprogram/active',
          method: 'GET',
          success: resolve,
          fail: reject
        });
      });

      this.addLog(`✅ Banner 接口响应成功 (状态码: ${res.statusCode})`);
      this.addLog(`📦 Banner 数据: ${JSON.stringify(res.data, null, 2)}`);
    } catch (err) {
      this.addLog(`❌ Banner 接口请求失败: ${err.errMsg || err.message}`);
    }
  },

  // 测试文章详情接口
  async testArticleDetail() {
    this.addLog('🧪 开始测试文章详情接口...');

    // 使用一个真实的文章 ID（从列表接口获取）
    const testId = '6967700ebaf1a7bfe723665c';

    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `https://crm.andejiazheng.com/api/articles/miniprogram/${testId}`,
          method: 'GET',
          header: {
            'Content-Type': 'application/json',
            'X-Client-Type': 'miniprogram',
            'X-Platform': 'wechat'
          },
          success: resolve,
          fail: reject
        });
      });

      this.addLog(`✅ 详情接口响应成功 (状态码: ${res.statusCode})`);
      this.addLog(`📦 响应数据: ${JSON.stringify(res.data, null, 2)}`);
    } catch (err) {
      this.addLog(`❌ 详情接口请求失败: ${err.errMsg || err.message}`);
    }
  },

  // 测试所有接口
  async testAll() {
    this.setData({ testResults: [] });
    this.addLog('🚀 开始测试所有接口...\n');
    
    await this.testBannerApi();
    this.addLog('\n---\n');
    
    await this.testArticleList();
    this.addLog('\n---\n');
    
    await this.testArticleDetail();
    this.addLog('\n✅ 测试完成！');
  },

  // 添加日志
  addLog(message) {
    console.log(message);
    const results = this.data.testResults;
    results.push(message);
    this.setData({ testResults: results });
  },

  // 清空日志
  clearLog() {
    this.setData({ testResults: [] });
  },

  // 复制日志
  copyLog() {
    const log = this.data.testResults.join('\n');
    wx.setClipboardData({
      data: log,
      success: () => {
        wx.showToast({ title: '日志已复制', icon: 'success' });
      }
    });
  }
});

