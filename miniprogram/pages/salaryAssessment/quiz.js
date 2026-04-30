const sharerUtils = require('../../utils/sharerUtils.js');
const assessmentShareImage = require('../../utils/assessmentShareImage.js');

const SECTION_LABELS = {
  hardware: '硬件条件',
  skill: '技能条件',
  personality: '心理素质',
};

const QUESTION_SECONDS = 30; // 每题倒计时秒数

Page({
  data: {
    assessmentId: '',
    jobType: '',
    questions: [],     // 全部 30 题
    answers: {},       // { qId: 'A' }
    currentIdx: 0,
    total: 0,
    sectionLabel: '',
    progressPct: 0,
    loading: true,
    loadingText: '正在加载题目...',
    submitting: false,
    sharerInfo: null,
    isShared: false,
    secondsLeft: QUESTION_SECONDS,
    timerWarn: false,    // ≤5s 橙色
    timerDanger: false,  // ≤3s 红色
  },

  _timerId: null,

  onLoad(options) {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });

    // 同步分享归属
    const sharer = sharerUtils.parseSharerFromOptions(options) || sharerUtils.getSharer();
    if (sharer) this.setData({ sharerInfo: sharer, isShared: true });

    const assessmentId = options.assessmentId || '';
    const jobType = options.jobType || '';
    if (!assessmentId || !jobType) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ assessmentId, jobType });

    this.loadQuestions(jobType);
  },

  async loadQuestions(jobType) {
    this.setData({ loading: true, loadingText: '正在加载题目...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'salaryAssessment',
        data: { action: 'getQuestions', jobType, assessmentId: this.data.assessmentId },
        timeout: 30000,
      });
      const result = res && res.result;
      if (!result || !result.success || !result.data || !Array.isArray(result.data.questions)) {
        throw new Error((result && result.errMsg) || '题目加载失败');
      }
      const questions = result.data.questions;
      this.setData({
        questions,
        total: questions.length,
        loading: false,
        currentIdx: 0,
      });
      this.refreshCurrent();
    } catch (e) {
      console.error('[quiz] loadQuestions failed:', e);
      this.setData({ loading: false });
      wx.showModal({
        title: '题目加载失败',
        content: (e && e.message) || '请稍后重试',
        confirmText: '重试',
        cancelText: '返回',
        confirmColor: '#8b5cf6',
        success: r => {
          if (r.confirm) this.loadQuestions(this.data.jobType);
          else wx.navigateBack();
        }
      });
    }
  },

  refreshCurrent() {
    const { questions, currentIdx, total } = this.data;
    if (!questions.length) return;
    const q = questions[currentIdx];
    this.setData({
      sectionLabel: SECTION_LABELS[q.section] || '',
      progressPct: Math.round(((currentIdx) / total) * 100),
    });
    this.startTimer();
  },

  // ── 倒计时 ─────────────────────────────────────────────────
  startTimer() {
    this.stopTimer();
    this.setData({ secondsLeft: QUESTION_SECONDS, timerWarn: false, timerDanger: false });
    this._timerId = setInterval(() => {
      const left = this.data.secondsLeft - 1;
      if (left <= 0) {
        this.stopTimer();
        this.setData({ secondsLeft: 0, timerWarn: false, timerDanger: true });
        this.onTimeUp();
        return;
      }
      this.setData({
        secondsLeft: left,
        timerWarn: left <= 5 && left > 3,
        timerDanger: left <= 3,
      });
    }, 1000);
  },
  stopTimer() {
    if (this._timerId) { clearInterval(this._timerId); this._timerId = null; }
  },
  onTimeUp() {
    const { currentIdx, total, questions, answers, submitting } = this.data;
    if (submitting) return;
    const q = questions[currentIdx];
    // 未作答时自动选择得分最低的选项（视为漏题，不阻塞流程）
    let nextAnswers = answers;
    if (q && !answers[q.id] && Array.isArray(q.options) && q.options.length) {
      const worst = q.options.reduce((m, o) => (Number(o.score) < Number(m.score) ? o : m), q.options[0]);
      nextAnswers = { ...answers, [q.id]: worst.label };
      this.setData({ answers: nextAnswers });
    }
    wx.showToast({ title: '时间到，自动跳题', icon: 'none', duration: 1200 });
    if (currentIdx >= total - 1) {
      // 最后一题：直接提交
      setTimeout(() => this.onSubmit(), 300);
    } else {
      setTimeout(() => {
        this.setData({ currentIdx: currentIdx + 1 });
        this.refreshCurrent();
      }, 300);
    }
  },

  onSelectOption(e) {
    const { qid, label } = e.currentTarget.dataset;
    if (!qid || !label) return;
    const answers = { ...this.data.answers, [qid]: label };
    this.setData({ answers });
    // 答完自动延时跳下一题（更顺滑）
    setTimeout(() => this.onNext(), 220);
  },

  onPrev() {
    if (this.data.currentIdx <= 0) return;
    this.setData({ currentIdx: this.data.currentIdx - 1 });
    this.refreshCurrent();
  },

  onNext() {
    const { currentIdx, total, questions, answers } = this.data;
    const q = questions[currentIdx];
    if (q && !answers[q.id]) {
      wx.showToast({ title: '请选择一项', icon: 'none' });
      return;
    }
    if (currentIdx >= total - 1) {
      this.onSubmit();
      return;
    }
    this.setData({ currentIdx: currentIdx + 1 });
    this.refreshCurrent();
  },

  async onSubmit() {
    if (this.data.submitting) return;
    this.stopTimer();
    const { questions, answers, assessmentId, jobType } = this.data;

    // 校验全部题已答
    const missing = questions.filter(q => !answers[q.id]);
    if (missing.length) {
      wx.showToast({ title: `还有 ${missing.length} 题未答`, icon: 'none' });
      const idx = questions.findIndex(q => !answers[q.id]);
      if (idx >= 0) this.setData({ currentIdx: idx }, () => this.refreshCurrent());
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });

    try {
      const answersArr = questions.map(q => ({ id: q.id, label: answers[q.id] }));
      const res = await wx.cloud.callFunction({
        name: 'salaryAssessment',
        data: { action: 'evaluate', assessmentId, jobType, answers: answersArr },
        timeout: 10000,
      });
      const result = res && res.result;
      if (!result || !result.success || !result.data || !result.data.result) {
        throw new Error((result && result.errMsg) || '提交失败');
      }

      // 缓存兜底结果到本地，结果页直接渲染、再后台拉真·AI
      wx.setStorageSync('current_assessment_result', {
        assessmentId,
        jobType,
        sectionScores: result.data.sectionScores,
        result: result.data.result,
        aiStatus: result.data.aiStatus || 'scoring',
        completedAt: Date.now(),
      });

      wx.hideLoading();
      this.setData({ submitting: false });
      wx.redirectTo({ url: `/pages/salaryAssessment/result?assessmentId=${assessmentId}` });
    } catch (e) {
      console.error('[quiz] evaluate failed:', e);
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showModal({
        title: '提交失败',
        content: (e && e.message) || '网络异常，请稍后重试',
        confirmText: '重试',
        cancelText: '取消',
        confirmColor: '#8b5cf6',
        success: r => { if (r.confirm) this.onSubmit(); }
      });
    }
  },

  onUnload() { this.stopTimer(); },
  onHide() { this.stopTimer(); },

  // 退出确认
  onBackPress() {
    wx.showModal({
      title: '确定要退出吗？',
      content: '退出后已答的题目不会保存',
      confirmText: '退出',
      confirmColor: '#8b5cf6',
      success: r => { if (r.confirm) { this.stopTimer(); wx.navigateBack(); } }
    });
    return true;
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
