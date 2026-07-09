Page({
  data: {
    url: '',
    mode: '',
    paymentId: '',
  },

  onLoad(query) {
    const { url, title, mode, paymentId } = query;
    const decoded = decodeURIComponent(url || '');
    this.setData({
      url: decoded,
      mode: mode || '',
      paymentId: paymentId || '',
    });
    if (title) {
      wx.setNavigationBarTitle({ title: decodeURIComponent(title) });
    }
    if (mode === 'checkout') {
      wx.setNavigationBarTitle({ title: '选择支付方式' });
    }
  },

  // web-view 加载失败时提示
  onWebViewError() {
    wx.showToast({ title: '页面加载失败', icon: 'none' });
  },

  // H5 通过 wx.miniProgram.postMessage 投递的消息（在特定时机才能拿到，比如返回时）
  onMessage(e) {
    if (this.data.mode !== 'checkout') return;
    console.log('[webview] 收到 H5 消息:', e.detail.data);
  },

  // 用户从收银台切回小程序时触发（关键：此时收银台可能已支付完成）
  onShow() {
    if (this.data.mode !== 'checkout' || !this.data.paymentId) return;
    this.pollPayment();
  },

  // 轮询支付状态：每 2s 查一次，最多 30 次（约 60s）
  async pollPayment() {
    if (this._polling) return;
    this._polling = true;
    const paymentId = this.data.paymentId;
    try {
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const res = await wx.cloud.callFunction({
          name: 'paymentService',
          data: { action: 'queryPayment', paymentId },
        });
        const data = res.result?.data;
        if (data?.paymentStatus === 'paid') {
          wx.showToast({ title: '支付成功', icon: 'success', duration: 2000 });
          setTimeout(() => {
            this._polling = false;
            wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/myOrders/index' }) });
          }, 1500);
          return;
        }
        if (data?.paymentStatus === 'failed' || data?.paymentStatus === 'refunded') {
          this._polling = false;
          wx.showModal({
            title: '支付未完成',
            content: '本次支付未完成，请重新尝试',
            showCancel: false,
            confirmText: '我知道了',
            success: () => wx.navigateBack({ delta: 1 }),
          });
          return;
        }
      }
    } catch (err) {
      console.error('[webview] pollPayment error:', err);
    } finally {
      this._polling = false;
    }
  },

  onUnload() {
    this._polling = false;
  },
});

