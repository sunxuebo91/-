// pages/myLikes/index.js
// 我的心动阿姨：AI 匹配里"标记合适"的阿姨列表，可直接申请面试
const { publicRequest } = require('../../utils/request.js');

// 工种 code -> 中文标签（与 aiMatch/index.js 保持一致）
const JOB_TYPE_LABEL_MAP = {
  yuexin: '月嫂',
  yuesao: '月嫂',
  'zhujia-yuer': '住家育儿嫂',
  'baiban-yuer': '白班育儿嫂',
  yuer: '育儿嫂',
  baomu: '保姆',
  'baiban-baomu': '白班保姆',
  'zhujia-baomu': '住家保姆',
  xiaoshi: '小时工',
  'zhujia-hulao': '住家护老',
  hugong: '护工',
  peiban: '陪伴师',
  jiajiao: '家教',
};

Page({
  data: {
    items: [],
    loading: true,
  },

  onShow() {
    this.loadLikes();
  },

  async loadLikes() {
    // 取登录态手机号，逻辑与 aiMatch 事件上报一致
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    if (!crmUserInfo.phone) {
      this.setData({ items: [], loading: false });
      wx.showModal({
        title: '请先登录',
        content: '登录后才能查看你标记过的心动阿姨',
        confirmText: '去登录',
        confirmColor: '#7B5BF5',
        success: (r) => {
          // 登录页支持 redirect 参数，登录成功后自动跳回本页
          if (r.confirm) {
            wx.navigateTo({
              url: `/pages/login/index?redirect=${encodeURIComponent('/pages/myLikes/index')}`,
            });
          }
        },
      });
      return;
    }

    this.setData({ loading: true });
    try {
      const resp = await publicRequest({
        url: `/resumes/match/my-likes?phone=${encodeURIComponent(crmUserInfo.phone)}`,
        method: 'GET',
      });
      if (!resp || resp.success === false) {
        throw new Error((resp && (resp.errMsg || resp.message)) || '加载失败');
      }
      const items = ((resp.data && resp.data.items) || []).map((it) => this._formatItem(it));
      this.setData({ items, loading: false });
    } catch (e) {
      console.warn('[myLikes] 加载心动列表失败:', e);
      this.setData({ items: [], loading: false });
      wx.showToast({ title: e.message || '加载失败，请稍后重试', icon: 'none' });
    }
  },

  _formatItem(item) {
    const rawPhotos = Array.isArray(item.personalPhoto)
      ? item.personalPhoto
      : (item.personalPhoto ? [item.personalPhoto] : []);
    const photos = rawPhotos.map((p) => (typeof p === 'string' ? p : (p.url || p.fileUrl || p.path || ''))).filter(Boolean);

    const uniformPhotoUrl = (() => {
      const raw = item.uniformPhoto;
      if (!raw) return '';
      if (typeof raw === 'string') return raw;
      if (Array.isArray(raw)) {
        const first = raw[0];
        if (!first) return '';
        return typeof first === 'string' ? first : (first.url || first.fileUrl || first.path || '');
      }
      return raw.url || raw.fileUrl || raw.path || '';
    })();

    const infoParts = [];
    const nativeRaw = item.nativePlace || item.currentAddress || '';
    const nativeShort = nativeRaw ? String(nativeRaw).slice(0, 3) : '';
    if (nativeShort) infoParts.push(`${nativeShort.replace(/(省|市|自治区|特别行政区)$/, '')}人`);
    if (item.age) infoParts.push(`${item.age}岁`);
    if (item.experienceYears) infoParts.push(`${item.experienceYears}年经验`);

    // 月嫂（含旧 code yuexin）按 26 天计价，小时工是时薪，其余按月
    const priceUnit = ['yuesao', 'yuexin'].includes(item.jobType)
      ? '/26天'
      : (item.jobType === 'xiaoshi' ? '/小时' : '/月');

    return {
      _id: item._id,
      name: item.name || '阿姨',
      coverFileId: uniformPhotoUrl || photos[0] || item.avatarUrl || '',
      jobTypeLabel: JOB_TYPE_LABEL_MAP[item.jobType] || '',
      infoLine: infoParts.join(' · '),
      priceMonth: item.expectedSalary || '',
      priceUnit,
      // lastEvent === 'interview' → 已申请过面试，按钮置灰
      applied: item.lastEvent === 'interview',
      // 面试通知要找到对应专属顾问
      sharerInfo: item.sharerInfo
        ? {
            phone: item.sharerInfo.phone || '',
            name: item.sharerInfo.name || '',
          }
        : null,
    };
  },

  // 点卡片 → 简历详情（入参与 aiMatch 的 tapDetail 同款）
  tapCard(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/resumeDetail/index?id=${id}` });
  },

  // 申请面试：与 aiMatch 的 tapSuper 完全同契约
  tapInterview(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.items.find((it) => it._id === id);
    if (!item || item.applied) return;
    if (this._submitting) return;

    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    if (!crmUserInfo.phone) {
      wx.showModal({
        title: '请先登录',
        content: '申请面试需要先登录，方便顾问与您取得联系',
        confirmText: '去登录',
        confirmColor: '#7B5BF5',
        success: (r) => {
          if (r.confirm) {
            wx.navigateTo({
              url: `/pages/login/index?redirect=${encodeURIComponent('/pages/myLikes/index')}`,
            });
          }
        },
      });
      return;
    }

    this._submitting = true;
    wx.showLoading({ title: '提交中...', mask: true });
    wx.cloud.callFunction({
      name: 'notificationService',
      data: {
        action: 'sendInterviewRequest',
        customerPhone: crmUserInfo.phone,
        customerName: crmUserInfo.nickname || crmUserInfo.name || '小程序客户',
        nurseName: item.name || '',
        resumeId: item._id,
        // 优先用简历的"分享人/销售"——有就走专属顾问通知
        sharerPhone: (item.sharerInfo && item.sharerInfo.phone) || '',
        needsSummary: '',
      },
    }).then((res) => {
      wx.hideLoading();
      const result = (res && res.result) || {};
      const data = result.data || {};
      if (result.success === true && data.delivery !== 'failed') {
        // 本地把该卡置为已申请态（duplicated 也算：顾问已在跟进）
        this._markApplied(item._id);
        if (data.duplicated === true) {
          wx.showToast({ title: '顾问正在跟进中，请稍候', icon: 'none' });
        } else {
          const target = data.notifyTarget || '顾问';
          wx.showToast({ title: `已通知${target}`, icon: 'success' });
        }
      } else if (result.success === true && data.delivery === 'failed') {
        // 云函数承认投递失败，如实提示，不再假成功
        wx.showToast({ title: '通知失败，请稍后重试', icon: 'none' });
      } else {
        wx.showToast({ title: result.errMsg || '通知失败，请重试', icon: 'none' });
      }
    }).catch((err) => {
      wx.hideLoading();
      console.warn('[myLikes] 面试通知失败:', err);
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    }).finally(() => {
      this._submitting = false;
    });
  },

  _markApplied(id) {
    this.setData({
      items: this.data.items.map((it) => (it._id === id ? { ...it, applied: true } : it)),
    });
  },

  goAiMatch() {
    wx.navigateTo({ url: '/pages/aiMatch/index' });
  },
});
