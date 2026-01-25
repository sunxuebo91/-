Page({
  data: {
    appId: '',
    corpId: 'wwd371cf73c0afad95',
    serviceUrl: 'https://work.weixin.qq.com/kfid/kfc47b5be2af8291841',
    systemInfo: {},
    apiSupported: false,
    logs: []
  },

  onLoad() {
    this.addLog('页面加载', 'info');
    this.getAppId();
    this.checkEnvironment();
  },

  // 获取小程序 AppID
  getAppId() {
    try {
      const accountInfo = wx.getAccountInfoSync();
      const appId = accountInfo.miniProgram.appId;
      this.setData({ appId });
      this.addLog(`小程序 AppID: ${appId}`, 'info');
    } catch (e) {
      this.addLog(`获取 AppID 失败: ${e.message}`, 'error');
    }
  },

  // 检查环境
  checkEnvironment() {
    try {
      const systemInfo = wx.getSystemInfoSync();
      this.setData({ systemInfo });
      this.addLog(`微信版本: ${systemInfo.version}`, 'info');
      this.addLog(`基础库版本: ${systemInfo.SDKVersion}`, 'info');
      this.addLog(`系统: ${systemInfo.system}`, 'info');

      // 检查 API 是否存在
      const apiSupported = typeof wx.openCustomerServiceChat === 'function';
      this.setData({ apiSupported });
      
      if (apiSupported) {
        this.addLog('✓ wx.openCustomerServiceChat API 存在', 'success');
      } else {
        this.addLog('✗ wx.openCustomerServiceChat API 不存在', 'error');
      }

      // 检查基础库版本
      const sdkVersion = systemInfo.SDKVersion;
      const minVersion = '2.14.4'; // openCustomerServiceChat 最低要求版本
      
      if (this.compareVersion(sdkVersion, minVersion) >= 0) {
        this.addLog(`✓ 基础库版本满足要求 (>= ${minVersion})`, 'success');
      } else {
        this.addLog(`✗ 基础库版本过低，需要 >= ${minVersion}`, 'error');
      }

    } catch (e) {
      this.addLog(`环境检测失败: ${e.message}`, 'error');
    }
  },

  // 测试 API
  testAPI() {
    this.addLog('开始测试 API...', 'info');

    if (!wx.openCustomerServiceChat) {
      this.addLog('✗ API 不存在', 'error');
      wx.showToast({
        title: 'API 不支持',
        icon: 'none'
      });
      return;
    }

    this.addLog('✓ API 存在，准备调用', 'success');

    // 正确的调用方式：extInfo.url 填写客服链接
    wx.openCustomerServiceChat({
      extInfo: {
        url: this.data.serviceUrl  // 修改：url 应该填写客服链接
      },
      corpId: this.data.corpId,
      success: (res) => {
        this.addLog('✓ API 调用成功', 'success');
        this.addLog(`返回结果: ${JSON.stringify(res)}`, 'info');
      },
      fail: (err) => {
        this.addLog('✗ API 调用失败', 'error');
        this.addLog(`错误信息: ${err.errMsg}`, 'error');

        if (err.errCode) {
          this.addLog(`错误代码: ${err.errCode}`, 'error');
        }
      }
    });
  },

  // 打开客服会话
  openCustomerService() {
    this.addLog('用户点击打开客服会话', 'info');

    if (!wx.openCustomerServiceChat) {
      this.addLog('✗ API 不支持', 'error');
      wx.showModal({
        title: '不支持',
        content: '当前环境不支持企业微信客服功能',
        showCancel: false
      });
      return;
    }

    this.addLog('正在打开客服会话...', 'info');

    wx.showLoading({
      title: '连接中...',
      mask: true
    });

    const startTime = Date.now();

    wx.openCustomerServiceChat({
      extInfo: {
        url: this.data.serviceUrl  // 修改：url 应该填写客服链接
      },
      corpId: this.data.corpId,
      success: (res) => {
        const duration = Date.now() - startTime;
        wx.hideLoading();
        this.addLog('✓ 客服会话打开成功', 'success');
        this.addLog(`返回: ${JSON.stringify(res)}`, 'info');
        this.addLog(`耗时: ${duration}ms`, 'info');

        // 检测是否是鸿蒙系统
        const systemInfo = wx.getSystemInfoSync();
        const isHarmonyOS = systemInfo.system && systemInfo.system.toLowerCase().includes('harmony');

        if (isHarmonyOS) {
          this.addLog('⚠️ 检测到鸿蒙系统', 'warning');
          this.addLog('鸿蒙系统可能存在兼容性问题，客服窗口可能无法显示', 'warning');
        }

        // 等待一下，看是否会弹出客服窗口
        setTimeout(() => {
          if (isHarmonyOS) {
            // 鸿蒙系统特殊提示
            wx.showModal({
              title: '鸿蒙系统兼容性问题',
              content: 'API调用成功但窗口未显示。这是鸿蒙系统的已知兼容性问题。\n\n建议解决方案：\n1. 使用网页方式打开客服\n2. 在iOS或Android原生系统测试\n3. 等待微信更新修复',
              confirmText: '复制客服链接',
              cancelText: '知道了',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  this.copyServiceUrl();
                }
              }
            });
          } else {
            this.addLog('提示: 如果没有弹出客服窗口，可能是企业微信后台配置问题', 'info');
            this.addLog('请检查: 1.客服是否在线 2.小程序是否已添加到接入场景 3.客服链接是否正确', 'info');
          }
        }, 2000);

        if (!isHarmonyOS) {
          wx.showToast({
            title: '调用成功',
            icon: 'success',
            duration: 1500
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        this.addLog('✗ 客服会话打开失败', 'error');
        this.addLog(`错误: ${err.errMsg}`, 'error');
        if (err.errCode) {
          this.addLog(`错误码: ${err.errCode}`, 'error');
        }

        let errorMsg = err.errMsg || '未知错误';

        if (errorMsg.indexOf('开发者工具') > -1) {
          errorMsg = '请在真机上测试此功能';
        } else if (errorMsg.indexOf('permission') > -1) {
          errorMsg = '小程序未获得客服权限';
        } else if (errorMsg.indexOf('invalid') > -1) {
          errorMsg = '客服配置信息无效';
        }

        wx.showModal({
          title: '打开失败',
          content: errorMsg,
          showCancel: false
        });
      }
    });
  },

  // 清空日志
  clearLogs() {
    this.setData({ logs: [] });
  },

  // 复制客服链接
  copyServiceUrl() {
    wx.setClipboardData({
      data: this.data.serviceUrl,
      success: () => {
        this.addLog('客服链接已复制', 'success');
        wx.showToast({
          title: '链接已复制',
          icon: 'success'
        });
      }
    });
  },

  // 添加日志
  addLog(text, type = 'info') {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    const logs = this.data.logs;
    logs.push({ time, text, type });
    
    // 只保留最近50条
    if (logs.length > 50) {
      logs.shift();
    }
    
    this.setData({ logs });
    console.log(`[${type.toUpperCase()}] ${text}`);
  },

  // 版本比较
  compareVersion(v1, v2) {
    const arr1 = v1.split('.');
    const arr2 = v2.split('.');
    const len = Math.max(arr1.length, arr2.length);

    for (let i = 0; i < len; i++) {
      const num1 = parseInt(arr1[i] || 0);
      const num2 = parseInt(arr2[i] || 0);
      
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    
    return 0;
  }
});

