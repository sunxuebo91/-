const userService = require('../../services/userService.js');
const sharerUtils = require('../../utils/sharerUtils.js');
const assessmentShareImage = require('../../utils/assessmentShareImage.js');

// 走云函数中转把简历同步到 CRM（绕开小程序 request 合法域名限制）
// fire-and-forget：失败仅打日志，不阻塞答题流程
function submitResumeToCrm(payload) {
  console.log('[salaryAssessment][CRM] callFunction submitResumeToCrm payload=', payload);
  return wx.cloud.callFunction({
    name: 'salaryAssessment',
    data: { action: 'submitResumeToCrm', ...payload },
    timeout: 15000,
  }).then(res => {
    const r = res && res.result;
    if (r && r.success) {
      console.log('[salaryAssessment][CRM] ✅ 简历同步成功:', r.data);
    } else {
      console.error('[salaryAssessment][CRM] ❌ 简历同步失败:', r && r.errMsg);
    }
    return r;
  }).catch(err => {
    console.error('[salaryAssessment][CRM] ❌ 云函数调用异常:', err);
    return null;
  });
}

const JOB_TYPES = [
  { value: 'yuexin', label: '月嫂' },
  { value: 'yuying', label: '育儿嫂' },
  { value: 'baomu',  label: '保姆' },
  { value: 'huli',   label: '护老/陪护' },
];

const EDUCATIONS = [
  { value: 'primary',    label: '小学及以下' },
  { value: 'middle',     label: '初中' },
  { value: 'high',       label: '高中/中专' },
  { value: 'college',    label: '大专' },
  { value: 'bachelor',   label: '本科及以上' },
];

Page({
  data: {
    sharerInfo: null,
    isShared: false,
    form: {
      name: '',
      phone: '',
      jobType: '',
      jobTypeLabel: '',
      age: '',
      experienceYears: '',
      education: '',
      educationLabel: '',
      city: '',
    },
    JOB_TYPES,
    EDUCATIONS,
    submitting: false,
    isLoggedIn: false,
    isStaff: false,
  },

  onLoad(options) {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });

    const sharer = sharerUtils.parseSharerFromOptions(options);
    if (sharer) {
      sharerUtils.saveSharer(sharer);
      this.setData({ sharerInfo: sharer, isShared: true });
      sharerUtils.fetchAndMergeSharer(sharer, merged => {
        if (merged) this.setData({ sharerInfo: merged });
      });
    } else {
      const cached = sharerUtils.getSharer();
      if (cached) this.setData({ sharerInfo: cached, isShared: true });
    }

    this.checkLogin();
    this.checkStaffRole();
  },

  onShow() {
    if (!this.data.isLoggedIn) this.checkLogin();
    if (!this.data.isStaff) this.checkStaffRole();
  },

  onReady() {
    // 生成分享缩略图（fire-and-forget，失败回退到品牌兜底图）
    assessmentShareImage.prepareShareImage(this).catch(() => {});
  },

  // 员工身份识别：先读缓存，未命中再走云函数兜底
  async checkStaffRole() {
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    let isStaff = crmUserInfo.isStaff === true;
    if (!isStaff) {
      try {
        const res = await wx.cloud.callFunction({
          name: 'userService',
          data: { action: 'getOrCreateMe' },
        });
        const cloudUser = res?.result?.data || {};
        isStaff = cloudUser.role === 'staff' || cloudUser.isStaff === true;
        if (isStaff) {
          crmUserInfo.isStaff = true;
          wx.setStorageSync('crmUserInfo', crmUserInfo);
        }
      } catch (e) {
        console.warn('[salaryAssessment] 检查员工角色失败(忽略):', e);
      }
    }
    if (isStaff !== this.data.isStaff) this.setData({ isStaff });
  },

  // 员工分享入口：把"通用邀测海报"塞进 storage 后跳到海报生成页
  // 同时把朋友圈文案预先复制到剪贴板，员工长按粘贴即可
  onStaffShare() {
    const summary = {
      _generic: true,
      jobTypeLabel: '家政从业者',
      tagline: '测一测你能拿多少',
    };
    try {
      wx.setStorageSync('pendingAssessmentPoster', { summary, savedAt: Date.now() });
    } catch (e) {}

    const moment = '测一测你能拿多少薪资？AI 30题5分钟出报告，免费！家政从业者必看';
    const go = () => wx.navigateTo({ url: '/pages/salaryAssessmentPoster/index' });
    wx.setClipboardData({ data: moment, success: go, fail: go });
  },

  checkLogin() {
    const isLoggedIn = userService.isLoggedIn();
    this.setData({ isLoggedIn });
    if (isLoggedIn) this.prefillFromUser();
  },

  prefillFromUser() {
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const localName = wx.getStorageSync('userName') || '';
    const localPhone = wx.getStorageSync('userPhone') || '';
    const form = { ...this.data.form };
    if (!form.name) form.name = localName || crmUserInfo.name || crmUserInfo.nickname || '';
    if (!form.phone) form.phone = crmUserInfo.phone || localPhone || '';
    this.setData({ form });
  },

  onTapLogin() {
    wx.navigateTo({ url: '/pages/login/index' });
  },

  // 微信手机号授权（与 settings / referrerRegister 同款流程）
  async onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showToast({ title: '未授权手机号', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '获取中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'loginByPhone', code: e.detail.code },
      });
      const phone = res && res.result && res.result.data && res.result.data.phone;
      if (!phone) throw new Error('获取手机号失败');
      this.setData({ 'form.phone': phone });
      try {
        const cached = wx.getStorageSync('crmUserInfo') || {};
        cached.phone = phone;
        wx.setStorageSync('crmUserInfo', cached);
        wx.setStorageSync('userPhone', phone);
      } catch (_) {}
      wx.hideLoading();
    } catch (err) {
      wx.hideLoading();
      console.error('[salaryAssessment] getPhoneNumber failed:', err);
      wx.showToast({ title: err.message || '授权失败，请重试', icon: 'none' });
    }
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({ [`form.${field}`]: value });
  },

  onJobTypeChange(e) {
    const idx = Number(e.detail.value);
    const jt = JOB_TYPES[idx];
    if (!jt) return;
    this.setData({ 'form.jobType': jt.value, 'form.jobTypeLabel': jt.label });
  },

  onEducationChange(e) {
    const idx = Number(e.detail.value);
    const edu = EDUCATIONS[idx];
    if (!edu) return;
    this.setData({ 'form.education': edu.value, 'form.educationLabel': edu.label });
  },

  validate() {
    const f = this.data.form;
    if (!f.name || !f.name.trim()) return '请填写姓名';
    if (!/^1[3-9]\d{9}$/.test(f.phone)) return '请填写正确的手机号';
    if (!f.jobType) return '请选择应聘工种';
    if (!f.age || Number(f.age) < 18 || Number(f.age) > 70) return '请填写正确的年龄（18-70）';
    if (f.experienceYears === '' || Number(f.experienceYears) < 0) return '请填写工作年限';
    if (!f.education) return '请选择学历';
    return '';
  },

  onContactAdvisor() {
    const sharerInfo = this.data.sharerInfo;
    if (!sharerInfo || !sharerInfo.phone) {
      wx.showToast({ title: '暂无联系方式', icon: 'none' });
      return;
    }
    wx.makePhoneCall({
      phoneNumber: sharerInfo.phone,
      fail: () => wx.showToast({ title: '拨打电话失败', icon: 'none' })
    });
  },

  async onStart() {
    if (this.data.submitting) return;

    if (!this.data.isLoggedIn) {
      wx.showModal({
        title: '请先登录',
        content: '工资测评需登录后参与，方便您获取测评报告',
        confirmText: '去登录',
        confirmColor: '#8b5cf6',
        success: r => { if (r.confirm) wx.navigateTo({ url: '/pages/login/index' }); }
      });
      return;
    }

    const errMsg = this.validate();
    if (errMsg) {
      wx.showToast({ title: errMsg, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });

    const f = this.data.form;
    const sourceStaff = this.data.sharerInfo || sharerUtils.getSharer();

    try {
      const res = await wx.cloud.callFunction({
        name: 'salaryAssessment',
        data: {
          action: 'start',
          basicInfo: {
            name: f.name.trim(),
            phone: f.phone.trim(),
            jobType: f.jobType,
            age: Number(f.age),
            experienceYears: Number(f.experienceYears),
            education: f.education,
            city: (f.city || '').trim(),
          },
          sourceStaff: sourceStaff || {},
        },
        timeout: 30000,
      });

      const result = res && res.result;
      if (!result || !result.success || !result.data || !result.data.assessmentId) {
        throw new Error((result && result.errMsg) || '登记失败');
      }

      const assessmentId = result.data.assessmentId;
      wx.setStorageSync('current_assessment', {
        assessmentId,
        jobType: f.jobType,
        jobTypeLabel: f.jobTypeLabel,
        basicInfo: {
          name: f.name.trim(),
          phone: f.phone.trim(),
          age: Number(f.age),
          experienceYears: Number(f.experienceYears),
          education: f.education,
          educationLabel: f.educationLabel,
          city: (f.city || '').trim(),
        },
      });

      // 直连 CRM 创建简历，绑定员工归属（fire-and-forget，不阻塞答题）
      const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
      submitResumeToCrm({
        openid: crmUserInfo.openid || '',
        name: f.name.trim(),
        phone: f.phone.trim(),
        jobType: f.jobType,
        age: Number(f.age),
        experienceYears: Number(f.experienceYears),
        education: f.education,
        city: (f.city || '').trim(),
        source: '小程序测评',
        sourceStaffId:     (sourceStaff && sourceStaff.id)    || '',
        sourceStaffPhone:  (sourceStaff && sourceStaff.phone) || '',
        sourceStaffOpenid: (sourceStaff && sourceStaff.openid) || '',
        assessmentId,
      });

      wx.hideLoading();
      this.setData({ submitting: false });
      wx.navigateTo({ url: `/pages/salaryAssessment/quiz?assessmentId=${assessmentId}&jobType=${f.jobType}` });
    } catch (e) {
      console.error('[salaryAssessment] start failed:', e);
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: e.message || '登记失败，请重试', icon: 'none' });
    }
  },

  onShareAppMessage() {
    const query = sharerUtils.buildShareQuery();
    return {
      title: '测一测：你能拿多少工资？AI 智能评估你的家政薪资水平',
      path: `/pages/salaryAssessment/index?${query}`,
      imageUrl: assessmentShareImage.getShareImage(),
    };
  },
  onShareTimeline() {
    return {
      title: '测一测：你能拿多少工资？AI 智能评估你的家政薪资水平',
      query: sharerUtils.buildShareQuery(),
      imageUrl: assessmentShareImage.getShareImage(),
    };
  },
});