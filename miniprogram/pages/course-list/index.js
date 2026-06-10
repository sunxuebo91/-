const courseApi = require('../../utils/course-api.js');

/**
 * 把后端各种可能字段统一成 { progressPercent, progressText, statusLabel }
 * 进度口径：**已完成章节数 / 总章节数**（防快进刷分数；与课程详情页里的"已学完"语义一致）
 * 后端的 progressPercent（按观看时长算）仅在缺少章节信息时兜底使用
 */
function decorateCourses(list) {
  return (list || []).map((c) => {
    const total = Number(c.chapterCount || c.totalChapters || (c.chapters && c.chapters.length) || 0);
    const completed = Number(c.completedChapterCount || c.completedChapters || c.finishedChapters || 0);

    let percent = 0;
    if (total > 0) {
      percent = Math.round((completed / total) * 100);
    } else {
      percent = Number(c.progressPercent || c.percent || c.progress || 0);
    }
    percent = Math.max(0, Math.min(100, Math.round(percent)));

    const allDone = total > 0 ? completed >= total : percent >= 100;
    let progressText = '';
    if (allDone) {
      progressText = '已学完';
    } else if (total > 0) {
      progressText = `已学 ${completed} / ${total} 节`;
    } else {
      progressText = '尚未开始';
    }

    return {
      ...c,
      progressPercent: allDone ? 100 : percent,
      progressText,
      statusLabel: allDone ? '已学完' : (completed > 0 ? '学习中' : '未开始'),
      statusTone: allDone ? 'done' : (completed > 0 ? 'progress' : 'idle'),
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
