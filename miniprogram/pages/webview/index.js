Page({
  data: {
    url: '',
    mode: '',
    paymentId: '',
  },

  onLoad(query) {
    const { url, title, mode, paymentId, contractId, phone } = query;
    const decoded = decodeURIComponent(url || '');
    const navTitle = title ? decodeURIComponent(title) : (mode === 'checkout' ? '选择支付方式' : '加载中...');
    wx.setNavigationBarTitle({ title: navTitle });
    this.setData({
      url: decoded,
      mode: mode || '',
      paymentId: paymentId || '',
    });
    // 签约模式：存 contractId + phone，onShow 时查签约状态
    this.contractId = contractId || '';
    this.phone = phone ? decodeURIComponent(phone) : '';
    this._checkedSign = false;
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

  // 用户点返回 / H5 切回小程序时触发
  onShow() {
    // 支付收银台模式：轮询支付状态
    if (this.data.mode === 'checkout' && this.data.paymentId) {
      this.pollPayment();
      return;
    }
    // 签约模式：查签约状态，签完自动返回详情页（跳过 H5 history）
    if (this.data.mode === 'sign' && this.contractId && this.phone && !this._checkedSign) {
      this._checkedSign = true;
      this.checkSignedAndGoBack();
    }
  },

  // 查签约状态：签完就自动 navigateBack 回详情页
  async checkSignedAndGoBack() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'contractService',
        data: { action: 'getContractDetail', id: this.contractId, phone: this.phone },
      });
      const c = res.result?.data;
      if (!c) { this._checkedSign = false; return; }

      const ss = c.signerStatuses || {};
      const customerSigned = ss.customerSigned === true || ss.customerSigned === 'signed';
      const nannySigned = ss.nannySigned === true || ss.nannySigned === 'signed';

      if (customerSigned || nannySigned) {
        // 已签完 → 自动返回详情页
        wx.showToast({ title: '签署完成', icon: 'success', duration: 1500 });
        setTimeout(() => {
          wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/myOrders/index' }) });
        }, 1000);
      } else {
        // 还没签完，重置标记，下次 onShow 再查
        this._checkedSign = false;
      }
    } catch (err) {
      console.error('[webview] checkSignedAndGoBack error:', err.message);
      this._checkedSign = false;
    }
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

