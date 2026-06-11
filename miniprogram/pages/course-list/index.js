const courseApi = require('../../utils/course-api.js');

/**
 * 把后端各种可能字段统一成 { progressPercent, progressText, statusLabel }
 * 进度口径：
 *  - 进度条 = max(已完成章节占比, 后端给的按时长百分比)，让"已开始但未学完"的状态也有显示
 *  - "已学 X / Y 节" 中的 X 用 completed（保留防快进语义）；
 *    当 completed=0 但按时长有进度时，文案改为"进度 X%"，避免显示成"已学 0 / Y 节"误导用户
 *  - 只要任一进度 > 0，就视为"学习中"
 */
function decorateCourses(list) {
  return (list || []).map((c) => {
    const total = Number(c.chapterCount || c.totalChapters || (c.chapters && c.chapters.length) || 0);
    const completed = Number(c.completedChapterCount || c.completedChapters || c.finishedChapters || 0);
    const startedChapters = Number(c.startedChapterCount || c.startedChapters || c.inProgressChapters || 0);
    const timePercent = Number(c.progressPercent || c.percent || c.progress || 0);
    const chapterPercent = total > 0 ? (completed / total) * 100 : 0;

    let percent = Math.max(chapterPercent, timePercent);
    percent = Math.max(0, Math.min(100, Math.round(percent)));

    const allDone = total > 0 ? completed >= total : percent >= 100;
    const hasProgress = completed > 0 || startedChapters > 0 || timePercent > 0;

    let progressText = '';
    if (allDone) {
      progressText = '已学完';
    } else if (total > 0 && completed > 0) {
      progressText = `已学 ${completed} / ${total} 节`;
    } else if (total > 0 && hasProgress) {
      progressText = `进度 ${percent}% · 共 ${total} 节`;
    } else if (total > 0) {
      progressText = `共 ${total} 节`;
    } else {
      progressText = '尚未开始';
    }

    return {
      ...c,
      progressPercent: allDone ? 100 : percent,
      progressText,
      statusLabel: allDone ? '已学完' : (hasProgress ? '学习中' : '未开始'),
      statusTone: allDone ? 'done' : (hasProgress ? 'progress' : 'idle'),
    };
  });
}

Page({
  data: {
    loading: true,
    // 状态：'ok' | 'empty' | 'not_enrolled' | 'need_wechat_login' | 'error'
    status: 'ok',
    errorMsg: '',
    notEnrolledMsg: '',
    courses: [],
  },

  onShow() {
    this.bootstrap();
  },

  async onPullDownRefresh() {
    await this.bootstrap();
    wx.stopPullDownRefresh();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      await courseApi.ensureLogin({ silent: true });
      const list = await courseApi.getCourses();
      if (list && list[0]) {
        console.log('[course-list] 后端列表项原始字段示例:', Object.keys(list[0]), list[0]);
      }
      const courses = decorateCourses(list);
      this.setData({
        loading: false,
        status: (!courses || courses.length === 0) ? 'empty' : 'ok',
        courses,
      });
    } catch (err) {
      const code = err && err.message;
      if (code === 'NEED_WECHAT_LOGIN') {
        this.setData({ loading: false, status: 'need_wechat_login' });
      } else if (code === 'NOT_ENROLLED' || code === 'AUTH_FAILED') {
        this.setData({
          loading: false,
          status: 'not_enrolled',
          notEnrolledMsg: (err && err.userMessage) || '该手机号未开通网课',
        });
      } else {
        this.setData({
          loading: false,
          status: 'error',
          errorMsg: (err && err.message) || '加载失败',
        });
      }
    }
  },

  goWechatLogin() {
    wx.navigateTo({ url: '/pages/login/index' });
  },

  onRetry() {
    this.bootstrap();
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/course-detail/index?id=${id}` });
  },

  contactService() {
    wx.switchTab({ url: '/pages/profile/index' });
  },
});
