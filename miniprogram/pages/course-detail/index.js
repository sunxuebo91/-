const courseApi = require('../../utils/course-api.js');

const PROGRESS_THROTTLE_MS = 10 * 1000; // 节流：每 10 秒上报一次

/** 本地缓存"最近播放节"。新 key 用 lesson 命名；旧 key 保留读取做迁移兼容 */
const LAST_LESSON_KEY = (courseId) => `course_last_lesson_${courseId}`;
const LEGACY_LAST_KEY = (courseId) => `course_last_chapter_${courseId}`;

/** 把秒转 mm:ss / hh:mm:ss */
function formatDuration(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * 把后端返回的 { chapters:[{ lessons:[...] }] } 转成
 *   { groups:[{ id, title, lessons:[decorated] }], lessons:[flat], showGroupHead }
 *
 * 显示模式按后端规则判定（不按章数）：
 *   hasNamedChapter = chapters.some(c => c.title?.trim())
 *     true  → 分章模式：渲染分组头，节编号用 章序.节序（1.1 / 2.3）
 *     false → 平铺模式：不渲染分组头，节编号用全局连续序号（01 / 02 / ...）
 * 兼容旧返回（章直接是可播放单元，没有 lessons[]）：把章自身当成单节。
 */
function buildView(data) {
  const rawChapters = (data && data.chapters) || [];
  const hasNamedChapter = rawChapters.some(
    (c) => c && c.title && String(c.title).trim()
  );
  const groups = [];
  const lessons = [];
  rawChapters.slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach((ch, gi) => {
      const hasLessons = Array.isArray(ch.lessons) && ch.lessons.length > 0;
      const rawLessons = hasLessons ? ch.lessons : [ch];
      const decoratedLessons = rawLessons.slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((l, li) => {
          const duration = Number(l.duration) || 0;
          const lastPosition = Number(l.lastPosition) || 0;
          const percent = duration > 0
            ? Math.min(100, Math.round((lastPosition / duration) * 100))
            : 0;
          const decorated = {
            ...l,
            chapterId: ch.id,
            chapterTitle: ch.title || '',
            // 分章模式：1.2；平铺模式：循环结束后按 flat 顺序统一回填全局序号
            indexLabel: hasNamedChapter ? `${gi + 1}.${li + 1}` : '',
            durationText: formatDuration(duration),
            progressText: l.completed
              ? '已学完'
              : (lastPosition > 0 ? `已学 ${formatDuration(lastPosition)}` : ''),
            progressPercent: percent,
          };
          lessons.push(decorated);
          return decorated;
        });
      groups.push({
        id: ch.id || `g${gi}`,
        title: ch.title || '',
        order: Number(ch.order) || gi,
        lessons: decoratedLessons,
      });
    });
  if (!hasNamedChapter) {
    lessons.forEach((l, idx) => {
      l.indexLabel = String(idx + 1).padStart(2, '0');
    });
  }
  return { groups, lessons, showGroupHead: hasNamedChapter };
}

Page({
  data: {
    courseId: '',
    loading: true,
    course: null,
    groups: [],        // 章分组（用于 WXML 渲染）
    lessons: [],       // 扁平节列表（用于自动连播 / 续播寻址）
    showGroupHead: false, // 是否渲染章分组头（按 hasNamedChapter 判定）
    playingLessonId: '',
    playingLesson: null,
    playingIndex: -1,
    playUrl: '',
    lastPosition: 0,
    duration: 0,
    buffering: false,
    videoWrapHeight: 422,
  },

  onLoad(query) {
    const id = query && query.id;
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
      return;
    }
    this.setData({ courseId: id });

    // 实例字段（非渲染态）
    this._currentPosition = 0;
    this._lastReportAt = 0;
    this._lastReportPosition = 0;
    this._fallbackDuration = 0;
    this._appHideHandler = () => this._onBackground();
    wx.onAppHide(this._appHideHandler);

    this.loadDetail(true);
  },

  onUnload() {
    if (this._appHideHandler) wx.offAppHide(this._appHideHandler);
    this._reportProgress(true);
  },

  onHide() {
    if (this.videoCtx) this.videoCtx.pause();
    this._reportProgress(true);
  },

  _onBackground() {
    if (this.videoCtx) this.videoCtx.pause();
    this._reportProgress(true);
  },

  async onPullDownRefresh() {
    await this.loadDetail(false);
    wx.stopPullDownRefresh();
  },

  /**
   * 拉课程详情；首次加载时自动选定起播节
   * @param {boolean} autoPick 是否自动选起播节（首次进入时为 true）
   */
  async loadDetail(autoPick) {
    try {
      const data = await courseApi.getCourseDetail(this.data.courseId);
      const { groups, lessons, showGroupHead } = buildView(data);
      this.setData({ loading: false, course: data, groups, lessons, showGroupHead });
      wx.setNavigationBarTitle({ title: (data && data.title) || '课程详情' });

      if (autoPick && lessons.length) {
        // 续播优先级：本地新 key > 本地旧 key（迁移兼容） > 后端 lastLessonId > 后端 lastChapterId > 第一节
        const localNew = wx.getStorageSync(LAST_LESSON_KEY(this.data.courseId)) || '';
        const localOld = wx.getStorageSync(LEGACY_LAST_KEY(this.data.courseId)) || '';
        const backendLast = (data && (data.lastLessonId || data.lastChapterId)) || '';
        const lastId = localNew || localOld || backendLast || '';
        const target = lessons.find((l) => String(l.id) === String(lastId)) || lessons[0];
        this._switchLesson(target);
        // 首次进入：列表滚到正在播放的卡片，避免续播节藏在下方看不见
        if (target && target.id !== lessons[0].id) {
          this._scrollToPlayingLesson();
        }
      } else if (this.data.playingLessonId) {
        // 刷新时把当前播放节最新进度同步进视图（不重建 player）
        const cur = lessons.find((l) => String(l.id) === String(this.data.playingLessonId));
        if (cur) this.setData({ playingLesson: cur });
      }
    } catch (err) {
      this.setData({ loading: false });
      const code = err && err.message;
      if (code === 'AUTH_FAILED' || code === 'NO_TOKEN' || code === 'NOT_ENROLLED' || code === 'NEED_WECHAT_LOGIN') {
        wx.reLaunch({ url: '/pages/course-list/index' });
        return;
      }
      wx.showToast({ title: code || '加载失败', icon: 'none' });
    }
  },

  playLesson(e) {
    const lessonId = e.currentTarget.dataset.id;
    if (!lessonId || String(lessonId) === String(this.data.playingLessonId)) return;
    const lesson = this.data.lessons.find((l) => String(l.id) === String(lessonId));
    if (!lesson) return;
    this._switchLesson(lesson);
  },

  /** 切换播放节：先强制销毁 video 节点再重建，保证 initial-time 生效 */
  _switchLesson(lesson) {
    // 切换前先上报一次旧节进度
    if (this.data.playingLessonId) this._reportProgress(true);

    const newPos = Number(lesson.lastPosition) || 0;
    this._currentPosition = newPos;
    this._lastReportPosition = newPos;
    this._lastReportAt = 0;

    const idx = this.data.lessons.findIndex((l) => String(l.id) === String(lesson.id));

    // 切节重置"是否已成功起播"标志，error 容错用
    this._playStarted = false;

    // 本地记一份"最近播放节"，作为下次进入的续播兜底
    try { wx.setStorageSync(LAST_LESSON_KEY(this.data.courseId), lesson.id); } catch (e) {}

    // 先卸下 video（playingLessonId 置空触发 wx:if 销毁），下一帧再重建
    this.setData({ playingLessonId: '' });
    wx.nextTick(() => {
      this.setData({
        playingLessonId: lesson.id,
        playingLesson: lesson,
        playingIndex: idx,
        playUrl: lesson.playUrl || '',
        lastPosition: newPos,
        duration: Number(lesson.duration) || 0,
        buffering: false,
        videoWrapHeight: 422,
      });
      this.videoCtx = wx.createVideoContext('coursePlayer', this);
    });
  },

  /** 视频元数据加载完成（只触发一次） —— 在这里写 duration，避免 timeupdate 里反复 setData */
  onLoadedMetadata(e) {
    const detail = e.detail || {};
    const dur = Math.floor(detail.duration || 0);
    const w = Number(detail.width) || 0;
    const h = Number(detail.height) || 0;
    const patch = {};
    if (dur && dur !== this.data.duration) patch.duration = dur;
    if (w > 0 && h > 0) {
      // 限制极端比例：最窄 9:16（竖屏），最宽 21:9
      const ratio = Math.max(9 / 16, Math.min(21 / 9, w / h));
      const heightRpx = Math.round(750 / ratio);
      if (heightRpx !== this.data.videoWrapHeight) patch.videoWrapHeight = heightRpx;
    }
    if (Object.keys(patch).length) this.setData(patch);
  },

  /** 高频事件：完全不 setData，只更新实例字段，避免触发渲染层 diff 导致播放卡顿 */
  onTimeUpdate(e) {
    const pos = Math.floor(e.detail.currentTime || 0);
    // 时间在跳 → 一定不在缓冲。兜底清掉残留 buffering 状态（HLS 偶发只触发 waiting 不补 play 的场景）
    if (this.data.buffering && pos !== this._lastTickPosition) {
      this.setData({ buffering: false });
    }
    this._lastTickPosition = pos;
    this._currentPosition = pos;
    if (!this.data.duration) {
      const dur = Math.floor(e.detail.duration || 0);
      if (dur) this._fallbackDuration = dur;
    }
    if (Date.now() - this._lastReportAt >= PROGRESS_THROTTLE_MS) {
      this._reportProgress(false);
    }
  },

  onPlay() {
    this._playStarted = true;
    if (this.data.buffering) this.setData({ buffering: false });
  },
  onWaiting() {
    if (!this.data.buffering) this.setData({ buffering: true });
  },
  /**
   * HLS 在初始加载或切换切片时会偶发触发 error，但播放器自己能恢复。
   * 只有"从未起播 + 进度为 0"的情况下才认为是真失败，弹 toast。
   * 已起播过的，写 warn 日志即可，不打扰用户。
   */
  onError(e) {
    const detail = (e && e.detail) || {};
    if (this._playStarted || (this._currentPosition || 0) > 0) {
      console.warn('[course-detail] transient video error (recoverable):', detail);
      return;
    }
    console.error('[course-detail] video error:', detail);
    wx.showToast({ title: '视频播放失败', icon: 'none' });
  },

  onEnded() {
    this._currentPosition = this.data.duration || this._currentPosition;
    this._reportProgress(true);
    const { lessons, playingLessonId } = this.data;
    const idx = lessons.findIndex((l) => String(l.id) === String(playingLessonId));
    if (idx >= 0 && idx < lessons.length - 1) {
      this._switchLesson(lessons[idx + 1]);
    } else {
      wx.showToast({ title: '已学完最后一节', icon: 'success' });
    }
  },

  /** 把正在播放的节卡片滚到吸顶播放器正下方 */
  _scrollToPlayingLesson() {
    setTimeout(() => {
      const query = wx.createSelectorQuery().in(this);
      query.select('.chapter-card.is-playing').boundingClientRect();
      query.select('.player-sticky').boundingClientRect();
      query.selectViewport().scrollOffset();
      query.exec((res) => {
        const card = res[0], sticky = res[1], scroll = res[2];
        if (!card || !scroll) return;
        const stickyH = (sticky && sticky.height) || 0;
        const target = scroll.scrollTop + card.top - stickyH - 8;
        wx.pageScrollTo({ scrollTop: Math.max(0, target), duration: 320 });
      });
    }, 280);
  },

  _reportProgress(force) {
    const pos = Math.floor(this._currentPosition || 0);
    if (!this.data.courseId || !this.data.playingLessonId) return;
    if (!force && pos === this._lastReportPosition) return;
    this._lastReportAt = Date.now();
    this._lastReportPosition = pos;
    const dur = Math.floor(this.data.duration || this._fallbackDuration || 0);
    courseApi.postProgress({
      courseId: this.data.courseId,
      lessonId: this.data.playingLessonId,
      position: pos,
      duration: dur,
    });
  },
});
