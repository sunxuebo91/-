const sharerUtils = require('../../utils/sharerUtils.js');
const assessmentShareImage = require('../../utils/assessmentShareImage.js');

const JOB_TYPE_LABELS = {
  yuexin: '月嫂',
  yuying: '育儿嫂',
  baomu:  '保姆',
  huli:   '护老/陪护',
};

const LEVEL_COLORS = {
  '初级': { bg: '#e9ecef', text: '#6c757d' },
  '中级': { bg: '#cfe2ff', text: '#0d6efd' },
  '高级': { bg: '#d1e7dd', text: '#198754' },
  '金牌': { bg: '#fff3cd', text: '#b8860b' },
  '钻石': { bg: '#f3e0ff', text: '#8766F3' },
};

Page({
  data: {
    loading: true,
    assessmentId: '',
    jobType: '',
    jobTypeLabel: '',
    sectionScores: null,
    result: null,
    levelColor: { bg: '#f3e0ff', text: '#8766F3' },
    sharerInfo: null,
    isShared: false,
    aiStatus: 'completed',  // 'scoring' | 'completed' | 'failed'
    showPosterModal: false, // AI 报告完成后弹窗引导分享（每份测评仅弹一次）
  },

  onLoad(options) {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });

    const sharer = sharerUtils.parseSharerFromOptions(options) || sharerUtils.getSharer();
    if (sharer) {
      this.setData({ sharerInfo: sharer, isShared: true });
      sharerUtils.fetchAndMergeSharer(sharer, merged => {
        if (merged) this.setData({ sharerInfo: merged });
      });
    }

    const assessmentId = options.assessmentId || '';
    this.setData({ assessmentId });

    // 优先读本地缓存（quiz 提交后已写入兜底结果）
    const cached = wx.getStorageSync('current_assessment_result');
    if (cached && cached.assessmentId === assessmentId && cached.result) {
      this.applyResult(cached);
      // 兜底中或 scoring 状态 → 后台拉真·AI
      if (cached.aiStatus !== 'completed' || (cached.result && cached.result._fallback)) {
        this.runAIEvaluation();
      }
      return;
    }

    // 无缓存：从云端拉取
    this.loadFromCloud(assessmentId);
  },

  applyResult(data) {
    const jobType = data.jobType || this.data.jobType || '';
    const result = data.result || {};
    const level = result.level || '中级';
    const aiStatus = data.aiStatus || (result._fallback ? 'scoring' : 'completed');
    this.setData({
      loading: false,
      jobType,
      jobTypeLabel: JOB_TYPE_LABELS[jobType] || jobType,
      sectionScores: data.sectionScores || this.data.sectionScores,
      result,
      levelColor: LEVEL_COLORS[level] || LEVEL_COLORS['中级'],
      aiStatus,
    });
    this._maybeShowPosterModal();
  },

  // AI 报告就绪后弹出分享引导（同一份测评仅弹一次）
  _maybeShowPosterModal() {
    if (this.data.aiStatus !== 'completed') return;
    if (!this.data.result || this.data.result._fallback) return;
    const aid = this.data.assessmentId;
    if (!aid) return;
    const storageKey = `posterPromptShown_${aid}`;
    let alreadyShown = false;
    try { alreadyShown = !!wx.getStorageSync(storageKey); } catch (e) {}
    if (alreadyShown) return;
    try { wx.setStorageSync(storageKey, true); } catch (e) {}
    setTimeout(() => {
      if (this.data && !this.data.showPosterModal) {
        this.setData({ showPosterModal: true });
      }
    }, 900);
  },

  onClosePosterModal() {
    this.setData({ showPosterModal: false });
  },

  onModalGoPoster() {
    this.setData({ showPosterModal: false });
    this.onGoPoster();
  },

  async loadFromCloud(assessmentId) {
    if (!assessmentId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    try {
      const res = await wx.cloud.callFunction({
        name: 'salaryAssessment',
        data: { action: 'getResult', assessmentId },
        timeout: 30000,
      });
      const r = res && res.result;
      if (!r || !r.success || !r.data || !r.data.result) {
        throw new Error((r && r.errMsg) || '报告加载失败');
      }
      this.applyResult(r.data);
      if (r.data.aiStatus !== 'completed' || (r.data.result && r.data.result._fallback)) {
        this.runAIEvaluation();
      }
    } catch (e) {
      console.error('[result] load failed:', e);
      this.setData({ loading: false });
      wx.showModal({
        title: '报告加载失败',
        content: (e && e.message) || '请稍后重试',
        showCancel: false,
        confirmColor: '#8b5cf6',
        success: () => wx.navigateBack(),
      });
    }
  },

  // ── 后台拉真·AI 报告（独立 60s 预算，不阻塞 UI）────────────
  async runAIEvaluation() {
    const { assessmentId, aiStatus } = this.data;
    if (!assessmentId) return;
    if (aiStatus === 'completed') return;
    this.setData({ aiStatus: 'scoring' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'salaryAssessment',
        data: { action: 'runAIEvaluation', assessmentId },
        timeout: 60000,
      });
      const r = res && res.result;
      if (!r || !r.success || !r.data || !r.data.result) {
        throw new Error((r && r.errMsg) || 'AI 报告生成失败');
      }
      this.applyResult(r.data);
      // 同步刷新本地缓存
      try {
        wx.setStorageSync('current_assessment_result', {
          assessmentId,
          jobType: this.data.jobType,
          sectionScores: r.data.sectionScores,
          result: r.data.result,
          aiStatus: r.data.aiStatus || 'completed',
          completedAt: Date.now(),
        });
      } catch (e) {}
    } catch (e) {
      console.error('[result] runAIEvaluation failed:', e);
      this.setData({ aiStatus: 'failed' });
    }
  },

  onContactAdvisor() {
    const sharerInfo = this.data.sharerInfo;
    if (!sharerInfo) {
      wx.showToast({ title: '顾问信息不存在', icon: 'none' });
      return;
    }
    if (!sharerInfo.phone) {
      wx.showToast({ title: '暂无联系方式', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: ['拨打电话：' + sharerInfo.phone],
      success: () => {
        wx.makePhoneCall({
          phoneNumber: sharerInfo.phone,
          fail: () => wx.showToast({ title: '拨打电话失败', icon: 'none' })
        });
      }
    });
  },

  // 跳转专属测评海报生成页
  onGoPoster() {
    const { result, sectionScores, jobType, jobTypeLabel, aiStatus } = this.data;
    if (!result) {
      wx.showToast({ title: '报告未就绪', icon: 'none' });
      return;
    }
    if (aiStatus === 'scoring') {
      wx.showToast({ title: 'AI 报告生成中，请稍候', icon: 'none' });
      return;
    }
    const cached = wx.getStorageSync('current_assessment') || {};
    const basicInfo = cached.basicInfo || {};
    const sr = result.salaryRange || {};
    const summary = {
      name: basicInfo.name || '',
      jobType,
      jobTypeLabel,
      totalScore: result.totalScore || 0,
      level: result.level || '中级',
      salaryMin: sr.min || '',
      salaryMax: sr.max || '',
      salaryUnit: sr.unit || '元/月',
      marketComparison: result.marketComparison || '',
      sectionScores: sectionScores || null,
    };
    try {
      wx.setStorageSync('pendingAssessmentPoster', { summary, savedAt: Date.now() });
    } catch (e) {}

    // 朋友圈文案（阿姨自述口吻），预先复制到剪贴板，发圈时长按粘贴即可
    const score = result.totalScore || 0;
    const level = result.level || '中级';
    const moment = `刚做完 AI 工资测评，我拿了 ${score} 分（${level}阿姨），姐妹们也来测一测～`;
    const go = () => wx.navigateTo({ url: '/pages/salaryAssessmentPoster/index' });
    wx.setClipboardData({ data: moment, success: go, fail: go });
  },

  onRetry() {
    wx.showModal({
      title: '重新测评',
      content: '将重新填写信息并答题，是否继续？',
      confirmText: '继续',
      confirmColor: '#8b5cf6',
      success: r => {
        if (r.confirm) {
          try { wx.removeStorageSync('current_assessment_result'); } catch (e) {}
          wx.reLaunch({ url: '/pages/salaryAssessment/index' });
        }
      }
    });
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
