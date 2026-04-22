Page({
  data: {
    name: '',
    agreed: false,
    submitting: false,
    submitted: false,      // 已成功提交申请（按钮文案改为"审批中"并禁用）
    sourceStaffId: '',
    sourceStaffPhone: '',  // 来源员工手机号（作为匹配 token 传给 CRM）
    sourceStaffOpenid: '', // 来源员工 openid（作为匹配 token 传给 CRM）
    sourceCustomerId: '',  // 来源客户订单 ID（扫海报时携带）
    existingPhone: '',     // 已登录用户的手机号
    maskedPhone: '',       // 脱敏展示
    // 状态展示（非 '' 时隐藏表单，改为展示状态卡）
    referrerStatus: '',    // 'pending_approval' | 'approved' | 'rejected' | ''
    referrerInfo: null,    // 推荐人记录
    statusLoading: true,   // 加载状态期间不渲染内容，防闪烁
    sharerInfo: null,      // 来源员工信息（底部展示）
  },

  async onLoad(options) {
    // 普通跳转参数（页内导航 / 旧格式 QR）
    let staffId     = options.staffId || '';
    let staffPhone  = options.p   ? decodeURIComponent(options.p)   : '';
    let staffOpenid = options.o   ? decodeURIComponent(options.o)   : '';
    let customerId  = options.cid ? decodeURIComponent(options.cid) : '';  // 关联客户订单

    // wxacode.get 扫码进入时参数在 scene 里（URI 编码）
    if (options.scene) {
      const scene = decodeURIComponent(options.scene); // e.g. "p=186...&o=xxx&cid=xxx"
      scene.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k === 'p'   || k === 'phone')      staffPhone  = v || '';
        if (k === 'o'   || k === 'openid')     staffOpenid = v || '';
        if (k === 'id'  || k === 'staffId')    staffId     = v || '';
        if (k === 'cid' || k === 'customerId') customerId  = v || '';
      });
    }

    staffId     = staffId     || wx.getStorageSync('referral_source_staff_id')    || '';
    staffPhone  = staffPhone  || wx.getStorageSync('referral_source_staff_phone') || '';
    staffOpenid = staffOpenid || wx.getStorageSync('referral_source_openid')      || '';
    customerId  = customerId  || wx.getStorageSync('referral_source_customer_id') || '';
    // 持久化，防止扫码后被中断再回来时丢失
    if (staffId)     wx.setStorageSync('referral_source_staff_id',    staffId);
    if (staffPhone)  wx.setStorageSync('referral_source_staff_phone', staffPhone);
    if (staffOpenid) wx.setStorageSync('referral_source_openid',      staffOpenid);
    if (customerId)  wx.setStorageSync('referral_source_customer_id', customerId);
    this.setData({
      sourceStaffId:     staffId,
      sourceStaffPhone:  staffPhone,
      sourceStaffOpenid: staffOpenid,
      sourceCustomerId:  customerId,
    });

    // 并行加载：用户信息 + 推荐人状态 + 员工公开信息
    try {
      await Promise.all([
        this.loadMe(),
        this.checkCurrentStatus(),
        this.loadSharerInfo(staffId, staffPhone),
      ]);
    } catch (e) {
      console.warn('[referrerRegister] onLoad error:', e);
    } finally {
      this.setData({ statusLoading: false });
    }
  },

  // 加载来源员工的公开信息（头像、姓名、公司、电话）
  async loadSharerInfo(staffId, staffPhone) {
    if (!staffId && !staffPhone) return;
    try {
      const res = await wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'getStaffPublicInfo', userId: staffId, phone: staffPhone }
      });
      if (res && res.result && res.result.success) {
        const d = res.result.data || {};
        this.setData({
          sharerInfo: {
            name:    d.name    || '安得褓贝顾问',
            phone:   d.phone   || staffPhone || '',
            avatar:  d.avatar  || '',
            company: d.company || '安得褓贝',
          }
        });
      }
    } catch (e) {
      console.warn('加载员工信息失败:', e);
    }
  },

  // 联系顾问
  onContactAdvisor() {
    const info = this.data.sharerInfo;
    if (!info || !info.phone) {
      wx.showToast({ title: '暂无联系方式', icon: 'none' });
      return;
    }
    wx.makePhoneCall({
      phoneNumber: info.phone,
      fail: () => wx.showToast({ title: '拨打电话失败', icon: 'none' })
    });
  },

  // 加载当前用户信息，预填表单
  async loadMe() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'getOrCreateMe' },
      });
      const me = (res.result && res.result.data) || {};
      const update = {};
      if (me.nickname) update.name = me.nickname;
      if (me.phone) {
        update.existingPhone = me.phone;
        update.maskedPhone = me.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
      }
      this.setData(update);
    } catch (e) {
      console.warn('加载用户信息失败:', e);
    }
  },

  // 检查推荐人状态（有记录则展示状态卡，不再跳转）
  async checkCurrentStatus() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'referralService',
        data: { action: 'getReferrerInfo' },
      });
      const info = res.result && res.result.data;
      if (!info) return;

      if (info.approvalStatus === 'approved') {
        // 已通过 → 直接跳推荐列表
        wx.redirectTo({ url: '/pages/myReferrals/index' });
        return;
      }
      // pending_approval / rejected → 展示状态卡
      const update = { referrerStatus: info.approvalStatus, referrerInfo: info };
      // 若 loadMe 未能拿到手机号，从 referrerInfo.phone 补填脱敏展示
      if (!this.data.maskedPhone && info.phone) {
        update.maskedPhone = info.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
      }
      this.setData(update);
    } catch (e) {
      console.warn('检查推荐人状态失败:', e);
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  // 表单前置校验（两条路径复用）
  _validate() {
    const { name, agreed } = this.data;
    if (!name.trim()) { wx.showToast({ title: '请输入您的姓名', icon: 'none' }); return false; }
    if (!agreed)      { wx.showToast({ title: '请先同意返费规则', icon: 'none' }); return false; }
    return true;
  },

  // 路径A：已有手机号，直接提交
  async onSubmitDirect() {
    if (this.data.submitting || !this._validate()) return;
    await this._doRegister(this.data.existingPhone);
  },

  // 路径B：无手机号，微信授权后提交（open-type="getPhoneNumber" 回调）
  async onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showToast({ title: '需要授权手机号才能提交申请', icon: 'none' });
      return;
    }
    if (!this._validate()) return;

    this.setData({ submitting: true });
    wx.showLoading({ title: '登录中...' });

    try {
      // 调用 loginByPhone 解密手机号并写入 users 集合（与正常登录完全一致）
      const loginRes = await wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'loginByPhone', code: e.detail.code },
      });
      const phone = loginRes.result && loginRes.result.data && loginRes.result.data.phone;
      if (!phone) throw new Error('获取手机号失败，请重试');

      wx.hideLoading();
      await this._doRegister(phone);
    } catch (err) {
      wx.hideLoading();
      console.error('手机号授权失败:', err);
      wx.showToast({ title: err.message || '网络异常，请稍后重试', icon: 'none' });
      this.setData({ submitting: false });
    }
  },

  // 确保本地有可用的 JWT（启动时网络抖动未换到 / 用户清过缓存等极端情况兜底）
  // 成本：一次 openid-only 的登录请求，静默，无用户感知
  async _ensureJwtToken() {
    let token = wx.getStorageSync('access_token') || '';
    if (token) return token;
    try {
      const cloudRes = await wx.cloud.callFunction({ name: 'userService', data: { action: 'getOrCreateMe' } });
      const openid = cloudRes && cloudRes.result && cloudRes.result.data && cloudRes.result.data._openid;
      if (!openid) return '';
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
      token = (tokenRes.data && (tokenRes.data.data && tokenRes.data.data.token || tokenRes.data.token)) || '';
      if (token) {
        wx.setStorageSync('access_token', token);
        wx.setStorageSync('token', token);
      }
      return token;
    } catch (e) {
      console.warn('[referrerRegister] 补换 JWT 失败:', e);
      return '';
    }
  },

  // 核心提交逻辑（两条路径最终都调用这里）
  // 直连 CRM：/api/referral/miniprogram/register-referrer
  // 身份三件套 sourceStaffId / sourcePhone / sourceOpenid 一并下发，CRM 端任一命中即可定位 staff
  async _doRegister(phone) {
    const { name, sourceStaffId, sourceStaffPhone, sourceStaffOpenid, sourceCustomerId } = this.data;
    this.setData({ submitting: true });

    const token = await this._ensureJwtToken();
    if (!token) {
      wx.showToast({ title: '登录状态异常，请重启小程序后重试', icon: 'none' });
      this.setData({ submitting: false });
      return;
    }

    try {
      const resp = await new Promise((resolve, reject) => {
        wx.request({
          url: 'https://crm.andejiazheng.com/api/referral/miniprogram/register-referrer',
          method: 'POST',
          header: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          data: {
            name: name.trim(),
            phone,
            sourceStaffId,      // 向后兼容：旧海报里带的是 miniprogram_users._id，CRM 端按 _id 查不到时会降级匹配
            sourcePhone:  sourceStaffPhone,
            sourceOpenid: sourceStaffOpenid,
            sourceCustomerId,
          },
          success: resolve,
          fail: reject,
        });
      });

      const body = resp && resp.data;
      console.log('[registerReferrer] status=', resp && resp.statusCode, 'success=', body && body.success);

      if (body && body.success) {
        wx.removeStorageSync('referral_source_staff_id');
        wx.removeStorageSync('referral_source_staff_phone');
        wx.removeStorageSync('referral_source_openid');
        wx.removeStorageSync('referral_source_customer_id');
        this.setData({ submitting: false, submitted: true });
        wx.showModal({
          title: '申请已提交',
          content: '请等待审核，审核结果将通过消息通知您',
          showCancel: false,
          confirmText: '确定',
          success() {
            wx.switchTab({ url: '/pages/home/index' });
          },
        });
      } else {
        const msg = (body && body.message) || '提交失败，请重试';
        wx.showToast({ title: msg, icon: 'none' });
        this.setData({ submitting: false });
      }
    } catch (e) {
      console.error('提交申请失败:', e);
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
