const orderHallService = require('../../services/orderHall.js');
const notificationService = require('../../services/notificationService.js');

const SERVICE_TYPE_MAP = {
  yuesao:          '月嫂',
  'zhujia-yuer':   '住家育儿嫂',
  'baiban-yuer':   '白班育儿',
  baojie:          '保洁',
  'baiban-baomu':  '白班保姆',
  'zhujia-baomu':  '住家保姆',
  yangchong:       '养宠',
  xiaoshi:         '小时工',
  'zhujia-hulao':  '住家护老',
  jiajiao:         '家教',
  peiban:          '陪伴师',
};

Page({
  data: {
    orderId: '',
    title: '',
    serviceTypeLabel: '',
    form: { name: '', phone: '' },
    phoneFromWx: false,
    submitting: false,
  },

  onLoad(options) {
    const orderId = options && options.orderId;
    if (!orderId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const serviceType = (options && options.serviceType) || '';
    this.setData({
      orderId,
      title: (options && decodeURIComponent(options.title || '')) || '',
      serviceTypeLabel: SERVICE_TYPE_MAP[serviceType] || serviceType || '',
    });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const patch = { [`form.${field}`]: value };
    if (field === 'phone') {
      patch.phoneFromWx = false;
    }
    this.setData(patch);
  },

  /** 微信授权获取手机号：拿到 code 走 userService.loginByPhone 兑换为明文手机号 */
  async onGetPhoneNumber(e) {
    const detail = e && e.detail;
    if (!detail || detail.errMsg !== 'getPhoneNumber:ok') {
      return;
    }
    // 部分旧版本会直接带回 phoneNumber（明文），优先使用
    const plain = detail.phoneNumber || '';
    if (plain) {
      this.setData({
        ['form.phone']: plain,
        phoneFromWx: true,
      });
      wx.showToast({ title: '已填入手机号', icon: 'success' });
      return;
    }
    const code = detail.code || '';
    if (!code) {
      wx.showToast({ title: '授权失败，请手动填写', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '获取中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'loginByPhone', code },
      });
      wx.hideLoading();
      const phone = res && res.result && res.result.data && res.result.data.phone;
      if (!phone) throw new Error((res && res.result && res.result.message) || '获取手机号失败');
      this.setData({
        ['form.phone']: phone,
        phoneFromWx: true,
      });
      wx.showToast({ title: '已填入手机号', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('[orderHall/grab] 手机号兑换失败:', err);
      wx.showToast({ title: err.message || '获取手机号失败，请手动填写', icon: 'none' });
    }
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const { form, orderId } = this.data;
    const name = (form.name || '').trim();
    const phone = (form.phone || '').trim();

    if (!name) return wx.showToast({ title: '请输入您的姓名', icon: 'none' });
    if (!phone) return wx.showToast({ title: '请输入手机号', icon: 'none' });
    if (!/^1[3-9]\d{9}$/.test(phone)) return wx.showToast({ title: '手机号格式不正确', icon: 'none' });

    this.setData({ submitting: true });

    const payload = { orderId, name, phone };
    const openid = wx.getStorageSync('openid');
    if (openid) payload.openid = openid;

    try {
      const res = await orderHallService.grabOrder(payload);
      if (res && res.success) {
        // 持久化本次抢单使用的手机号，供"我的抢单"页在未登录 CRM 时也能定位身份
        try { wx.setStorageSync('orderHall_lastPhone', phone); } catch (_) {}

        // 通知订单发布人（员工）：fire-and-forget，不阻塞主流程
        const publisherPhone = res.data && res.data.publisherPhone;
        if (publisherPhone) {
          notificationService.sendOrderGrabNotify({
            publisherPhone,
            auntieName: name,
            serviceTypeLabel: this.data.serviceTypeLabel,
            orderId: this.data.orderId,
          }).catch(e => console.warn('[grab] 通知发布人失败（不影响抢单）:', e));
        }

        wx.showToast({ title: '抢单成功，等待顾问联系', icon: 'success' });
        setTimeout(() => {
          wx.redirectTo({ url: '/pages/orderHall/myGrabs' });
        }, 1200);
      } else {
        const msg = (res && res.message) || '抢单失败，请重试';
        wx.showModal({
          title: '提示',
          content: msg,
          showCancel: false,
          confirmText: '我知道了',
          confirmColor: '#8766F3',
        });
        this.setData({ submitting: false });
      }
    } catch (e) {
      console.error('[orderHall/grab] 抢单失败:', e);
      wx.showToast({ title: e.message || '网络异常', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
