// 兜底工种列表（CRM 不可达时使用）
const FALLBACK_SERVICE_TYPES = [
  { value: 'yuesao',        label: '月嫂' },
  { value: 'zhujia-yuer',   label: '住家育儿嫂' },
  { value: 'baiban-yuer',   label: '白班育儿' },
  { value: 'baojie',        label: '保洁' },
  { value: 'baiban-baomu',  label: '白班保姆' },
  { value: 'zhujia-baomu',  label: '住家保姆' },
  { value: 'yangchong',     label: '养宠' },
  { value: 'xiaoshi',       label: '小时工' },
  { value: 'zhujia-hulao',  label: '住家护老' },
  { value: 'jiajiao',       label: '家教' },
  { value: 'peiban',        label: '陪伴师' },
];

Page({
  data: {
    form: { name: '', phone: '', remark: '' },
    serviceTypes: [],      // { value, label }[]，动态从 CRM 加载
    serviceTypeIndex: -1,
    submitting: false,
    customerInfo: null,
    customerLoading: true,
    _pendingOrderType: '', // 订单工种暂存，待 serviceTypes 加载后自动匹配
  },

  async onLoad() {
    // 并行加载工种列表和关联订单，均完成后再尝试自动匹配
    await Promise.all([
      this.loadJobTypes(),
      this.loadCustomerInfo(),
    ]);
    this._tryAutoMatch();
  },

  /** 从 CRM 动态拉取工种列表 */
  async loadJobTypes() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'referralService',
        data: { action: 'getJobTypes' },
      });
      const types = (res.result && res.result.data) || [];
      this.setData({ serviceTypes: types.length ? types : FALLBACK_SERVICE_TYPES });
    } catch (e) {
      console.warn('[referralSubmit] 工种列表加载失败，使用兜底:', e);
      this.setData({ serviceTypes: FALLBACK_SERVICE_TYPES });
    }
  },

  /** 用暂存的订单工种在已加载的 serviceTypes 里找到对应下标 */
  _tryAutoMatch() {
    const { serviceTypes, _pendingOrderType } = this.data;
    if (!_pendingOrderType || !serviceTypes.length) return;
    // 同时匹配 value（英文 key）和 label（中文），兼容两种来源
    const idx = serviceTypes.findIndex(
      t => t.value === _pendingOrderType || t.label === _pendingOrderType
    );
    if (idx >= 0) this.setData({ serviceTypeIndex: idx });
  },

  /** 从推荐人记录读 sourceCustomerId，再调 baobei 拉取客户需求 */
  async loadCustomerInfo() {
    try {
      const referrerRes = await wx.cloud.callFunction({
        name: 'referralService',
        data: { action: 'getReferrerInfo' },
      });
      const referrer = referrerRes.result && referrerRes.result.data;
      const customerId = referrer && referrer.sourceCustomerId;
      if (!customerId) {
        this.setData({ customerLoading: false });
        return;
      }

      const customerRes = await wx.cloud.callFunction({
        name: 'baobei',
        data: { action: 'getCustomerById', id: customerId },
      });
      const raw = customerRes.result && customerRes.result.data;
      if (raw) {
        const needs = raw.needs || {};
        const orderType = needs.orderType || raw.orderType || '';
        this.setData({
          customerInfo: {
            id:             raw.id || customerId,
            name:           raw.name || '',
            orderType,
            salary:         needs.salary         || raw.salary         || '',
            serviceAddress: needs.serviceAddress || raw.serviceAddress || '',
            onboardingTime: needs.onboardingTime || raw.onboardingTime || '',
          },
          _pendingOrderType: orderType,
        });
      }
    } catch (e) {
      console.warn('[referralSubmit] 加载关联订单失败:', e);
    } finally {
      this.setData({ customerLoading: false });
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onServiceTypeChange(e) {
    this.setData({ serviceTypeIndex: Number(e.detail.value) });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const { form, serviceTypeIndex } = this.data;

    // 基础校验
    if (!form.name.trim()) return wx.showToast({ title: '请输入阿姨姓名', icon: 'none' });
    if (!form.phone.trim()) return wx.showToast({ title: '请输入手机号', icon: 'none' });
    if (!/^1[3-9]\d{9}$/.test(form.phone)) return wx.showToast({ title: '手机号格式不正确', icon: 'none' });
    if (serviceTypeIndex < 0) return wx.showToast({ title: '请选择服务类型', icon: 'none' });

    this.setData({ submitting: true });

    // 后端去重检查
    const isDuplicate = await this.checkDuplicate();
    if (isDuplicate) {
      this.setData({ submitting: false });
      return;
    }

    // 提交推荐
    try {
      const res = await wx.cloud.callFunction({
        name: 'referralService',
        data: {
          action: 'submitReferral',
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          serviceType: this.data.serviceTypes[serviceTypeIndex].value, // 英文 key
          remark: form.remark.trim() || undefined,
        },
      });

      if (res.result && res.result.success) {
        wx.showToast({ title: '推荐提交成功', icon: 'success' });
        setTimeout(() => wx.redirectTo({ url: '/pages/myReferrals/index' }), 1200);
      } else {
        const msg = (res.result && res.result.message) || '提交失败，请重试';
        wx.showToast({ title: msg, icon: 'none' });
        this.setData({ submitting: false });
      }
    } catch (e) {
      console.error('提交推荐失败:', e);
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' });
      this.setData({ submitting: false });
    }
  },

  // 调用后端去重，命中则弹窗拦截并返回 true
  async checkDuplicate() {
    const { phone } = this.data.form;
    try {
      const res = await wx.cloud.callFunction({
        name: 'referralService',
        data: { action: 'checkDuplicate', phone: phone || undefined },
      });
      const { isDuplicate, matchField } = (res.result && res.result.data) || {};
      if (isDuplicate) {
        const fieldText = matchField === 'phone' ? '手机号' : '身份证号';
        wx.showModal({
          title: '录入失败',
          content: `该阿姨${fieldText}已在系统中存在，无法重复录入。如有疑问请联系客服。`,
          showCancel: false,
          confirmText: '我知道了',
          confirmColor: '#8766F3',
        });
        return true;
      }
      return false;
    } catch (e) {
      console.error('去重检查失败:', e);
      return false; // 网络异常时放行，由后端二次校验
    }
  },
});
