const courseApi = require('../../utils/course-api.js');
const { ensureStaffIdentity } = require('../../utils/staffIdentity.js');
const { extractDominantColor, FALLBACK: COLOR_FALLBACK } = require('../../utils/imageDominantColor.js');
const sharerUtils = require('../../utils/sharerUtils.js');

const PROGRESS_THROTTLE_MS = 10 * 1000; // 节流：每 10 秒上报一次

// 海报 Logo（与简历/工资测评海报共用同一张定稿图）
const POSTER_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得褓贝定稿.png';
// 海报"课程大纲"最多展示节数（超过则截断 + "等 N 节"提示）
const POSTER_OUTLINE_MAX = 8;

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
    // 员工身份 + 课程宣传海报主题色（取自封面主色，悬浮按钮与海报色块共用）
    isStaff: false,
    themeColor: COLOR_FALLBACK.themeColor,
    themeColorDark: COLOR_FALLBACK.themeColorDark,
    generatingPromo: false,
    // 分享归属：客户通过员工分享链接/海报扫码进入时，底部展示顾问联系条
    isShared: false,
    sharerInfo: null,
    sharerIsStaff: false,
  },

  onLoad(query) {
    const options = query || {};

    // 兼容海报小程序码扫码进入：scene 里携带 id
    let qrId = '';
    if (!options.id && options.scene) {
      try {
        const sceneStr = decodeURIComponent(options.scene);
        sceneStr.split('&').forEach(pair => {
          const eqIdx = pair.indexOf('=');
          if (eqIdx > -1 && pair.slice(0, eqIdx) === 'id') {
            qrId = pair.slice(eqIdx + 1);
          }
        });
      } catch (e) {
        console.warn('[course-detail] scene 参数解析失败:', e);
      }
    }
    const id = options.id || qrId;
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

    // 解析分享归属（与 resumeDetail/salaryAssessment 同一套协议）
    this._initSharerFromOptions(options);

    this.loadDetail(true);
    this.checkStaffRole();
  },

  /**
   * 解析分享链路上下文，与 resumeDetail 行为对齐：
   * - shared=1 / sharerId / sharerPhone / scene 任一存在即视为分享访问
   * - sf=1 表示分享者已确认为员工；姓名/头像缺失时异步从云端补全并标记 sharerIsStaff
   */
  _initSharerFromOptions(options) {
    const sharerInfo = sharerUtils.parseSharerFromOptions(options);
    if (!sharerInfo) return;

    this.setData({
      isShared: true,
      sharerInfo,
      sharerIsStaff: options.sf === '1',
    });

    // 分享访问时隐藏 home 按钮
    try { if (wx.hideHomeButton) wx.hideHomeButton(); } catch (e) {}

    // 海报二维码扫码进入：URL 没有顾问姓名/头像，异步拉云端补全
    if ((!sharerInfo.name || sharerInfo.name === '安得褓贝顾问' || !sharerInfo.avatar)
        && (sharerInfo.id || sharerInfo.phone)) {
      sharerUtils.fetchAndMergeSharer(sharerInfo, (merged) => {
        this.setData({ sharerInfo: merged, sharerIsStaff: true });
      });
    }
  },

  // 员工身份检测（与 resumeDetail 一致：缓存命中即返回，否则用 phone 调 CRM 校验）
  async checkStaffRole() {
    try {
      const isStaff = await ensureStaffIdentity();
      if (isStaff !== this.data.isStaff) this.setData({ isStaff });
    } catch (e) {
      console.warn('[course-detail] checkStaffRole failed:', e && e.message);
    }
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

      // 异步提取封面主色（失败用紫色兜底，不阻塞主流程）
      this._refreshThemeColor(data && data.cover);

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

  // ──────────────────────────────────────────────────────────────
  // 课程宣传海报（员工专属）
  // ──────────────────────────────────────────────────────────────

  // 下载图片到本地（兼容 cloud:// 和 https）
  async _downloadImage(url) {
    if (!url) return '';
    if (url.startsWith('cloud://')) {
      const res = await wx.cloud.downloadFile({ fileID: url });
      return res.tempFilePath;
    }
    const res = await new Promise((resolve, reject) => {
      wx.downloadFile({ url, success: resolve, fail: reject });
    });
    return res.tempFilePath;
  },

  // 用封面主色刷新主题色（异步、失败兜底紫色）
  async _refreshThemeColor(coverUrl) {
    if (!coverUrl) return;
    try {
      const localPath = await this._downloadImage(coverUrl);
      const { themeColor, themeColorDark } = await extractDominantColor(this, '#colorSampler', localPath);
      this._coverLocalPath = localPath;
      this.setData({ themeColor, themeColorDark });
    } catch (err) {
      console.warn('[course-detail] theme color failed:', err && err.message);
    }
  },

  // 调云函数生成课程详情页小程序码（带 sharerId+phone，扫码方进入显示"联系顾问"）
  async _getCoursePromoMiniCodePath(courseId, staffId, staffPhone) {
    if (!courseId) return '';
    try {
      const cfRes = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'getCoursePromoMiniCode',
          courseId,
          staffId: staffId || '',
          staffPhone: staffPhone || '',
        },
      });
      const fileID = cfRes && cfRes.result && cfRes.result.fileID;
      if (!fileID) return '';
      const tempRes = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const tempUrl = tempRes && tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL;
      if (!tempUrl) return '';
      return await this._downloadImage(tempUrl);
    } catch (err) {
      console.warn('[course-detail] 获取课程小程序码失败:', err && err.message);
      return '';
    }
  },

  // 悬浮按钮点击：生成课程宣传海报
  onTapPromoCourse() {
    if (this.data.generatingPromo) return;
    if (!this.data.isStaff) return;
    const course = this.data.course;
    if (!course) {
      wx.showToast({ title: '课程信息加载中', icon: 'none' });
      return;
    }
    this._doGenerateCoursePoster();
  },

  async _doGenerateCoursePoster() {
    this.setData({ generatingPromo: true });
    wx.showLoading({ title: '生成海报中...', mask: true });
    try {
      const course = this.data.course || {};
      const courseId = this.data.courseId;

      // 读取员工信息（与简历海报同样的取数链路）
      const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
      const staffId = String(crmUserInfo._id || crmUserInfo.id || crmUserInfo.userId || wx.getStorageSync('userId') || '');
      const staffPhone = crmUserInfo.phone || wx.getStorageSync('userPhone') || '';
      const staffName = crmUserInfo.crmName || crmUserInfo.name || crmUserInfo.nickname || '';
      const staffAvatar = crmUserInfo.crmAvatar || crmUserInfo.avatarUrl || crmUserInfo.avatar || '';

      // 写云库：扫码方据此查到顾问姓名/头像（与简历海报扫码链路对齐）
      if ((staffId || staffPhone) && (staffName || staffPhone)) {
        wx.cloud.callFunction({
          name: 'userService',
          data: {
            action: 'saveStaffProfile',
            staffId: staffId || staffPhone,
            name: staffName,
            phone: staffPhone,
            avatar: staffAvatar,
            company: '安得褓贝',
          },
        }).catch((err) => console.warn('saveStaffProfile 失败(不影响海报生成):', err && err.message));
      }

      // 并行：封面图（已缓存可直接复用）、Logo、QR、顾问头像
      const coverPromise = this._coverLocalPath
        ? Promise.resolve(this._coverLocalPath)
        : (course.cover ? this._downloadImage(course.cover) : Promise.resolve(''));
      const [coverLocalPath, logoLocalPath, qrLocalPath, advisorAvatarPath] = await Promise.all([
        coverPromise,
        this._downloadImage(POSTER_LOGO_FILE_ID),
        this._getCoursePromoMiniCodePath(courseId, staffId, staffPhone),
        staffAvatar ? this._downloadImage(staffAvatar).catch(() => '') : Promise.resolve(''),
      ]);

      const posterPath = await this._drawCoursePosterCanvas({
        course,
        coverLocalPath,
        logoLocalPath,
        qrLocalPath,
        advisorAvatarPath,
        advisor: { name: staffName, phone: staffPhone, company: '安得褓贝' },
        themeColor: this.data.themeColor,
        themeColorDark: this.data.themeColorDark,
      });

      wx.hideLoading();
      wx.showShareImageMenu({
        path: posterPath,
        fail: () => {
          wx.saveImageToPhotosAlbum({
            filePath: posterPath,
            success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
            fail: () => wx.showToast({ title: '请长按图片保存', icon: 'none' }),
          });
        },
      });
    } catch (err) {
      console.error('[course-detail] 生成课程宣传海报失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '海报生成失败', icon: 'none' });
    } finally {
      this.setData({ generatingPromo: false });
    }
  },

  // 课程宣传海报 Canvas 绘制；高度根据章节数动态计算
  _drawCoursePosterCanvas(params) {
    const {
      course, coverLocalPath, logoLocalPath, qrLocalPath, advisorAvatarPath,
      advisor, themeColor, themeColorDark,
    } = params;
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this).select('#coursePosterCanvas')
        .fields({ node: true, size: true })
        .exec(async (res) => {
          try {
            const canvas = res[0] && res[0].node;
            if (!canvas) return reject(new Error('Canvas 未找到'));

            const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
            const W = 375;
            const lessons = this.data.lessons || [];
            const total = lessons.length;

            // 预读封面图，得到实际宽高比 → 决定封面区高度（按宽等比，不裁切；上限 210 控制整体高度，朋友圈友好比例）
            let coverImg = null;
            let coverDrawH = 200; // 无封面时的兜底高度
            if (coverLocalPath) {
              coverImg = canvas.createImage();
              coverImg.src = coverLocalPath;
              await new Promise(r => { coverImg.onload = r; coverImg.onerror = r; });
              const iw = coverImg.width || 1, ih = coverImg.height || 1;
              coverDrawH = Math.min(210, Math.round((W * ih) / iw));
            }

            // 预测量课程介绍实际折行数（按真实字宽）
            const introRaw = course.intro || course.description || course.summary || '';
            const introText = String(introRaw).replace(/\s+/g, ' ').trim()
              || '系统讲授母婴护理全流程要点，理论结合实战，让学员快速胜任岗位。';
            const INTRO_MAX_LINES = 3;
            const INTRO_MAX_W = W - 32;
            canvas.width = W * dpr;
            canvas.height = 100 * dpr; // 临时尺寸仅用于 measureText
            let ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.font = '13px sans-serif';
            let introLineCount = 0;
            {
              let cur = '';
              for (let i = 0; i < introText.length && introLineCount < INTRO_MAX_LINES; i++) {
                const next = cur + introText[i];
                if (ctx.measureText(next).width > INTRO_MAX_W) {
                  introLineCount++;
                  cur = introText[i];
                } else {
                  cur = next;
                }
              }
              if (cur && introLineCount < INTRO_MAX_LINES) introLineCount++;
              introLineCount = Math.max(1, introLineCount);
            }

            // 固定海报高度，导出 1080 × 1980（朋友圈友好比例 ≈ 1:1.83）
            // 高度构成：封面 + 标题条 64 + 介绍区(18+28+lines*20+8) + 大纲头 34 + 节行 26 * showCount + "等N节"行 24 + 间隔 6 + 底部顾问条 110
            const introH = 18 + 28 + introLineCount * 20 + 8;
            const H = 688;
            // 根据剩余高度动态决定大纲展示节数（预留"等 N 节"提示位 24）
            const lessonsBudget = H - coverDrawH - 64 - introH - 34 - 6 - 110 - 24;
            const maxByHeight = Math.max(2, Math.floor(lessonsBudget / 26));
            const showCount = Math.min(POSTER_OUTLINE_MAX, total, maxByHeight);
            const remain = Math.max(0, total - showCount);

            // 设回最终尺寸（这会清空 ctx 状态，需重新 scale）
            canvas.width = W * dpr;
            canvas.height = H * dpr;
            ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);

            // 圆角矩形路径
            const roundRectPath = (x, y, w, h, r) => {
              ctx.beginPath();
              ctx.moveTo(x + r, y);
              ctx.lineTo(x + w - r, y);
              ctx.arcTo(x + w, y, x + w, y + r, r);
              ctx.lineTo(x + w, y + h - r);
              ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
              ctx.lineTo(x + r, y + h);
              ctx.arcTo(x, y + h, x, y + h - r, r);
              ctx.lineTo(x, y + r);
              ctx.arcTo(x, y, x + r, y, r);
              ctx.closePath();
            };

            // 单行截断
            const ellipsize = (text, maxWidth) => {
              if (!text) return '';
              if (ctx.measureText(text).width <= maxWidth) return text;
              let lo = 0, hi = text.length;
              while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                const w = ctx.measureText(text.slice(0, mid) + '…').width;
                if (w <= maxWidth) lo = mid; else hi = mid - 1;
              }
              return text.slice(0, lo) + '…';
            };

            // 多行折行（按字符宽度）
            const wrapText = (text, maxWidth, maxLines) => {
              const lines = [];
              if (!text) return lines;
              let cur = '';
              for (let i = 0; i < text.length; i++) {
                const next = cur + text[i];
                if (ctx.measureText(next).width > maxWidth) {
                  lines.push(cur);
                  cur = text[i];
                  if (lines.length === maxLines - 1) {
                    // 最后一行：把剩余塞进去并裁断
                    const rest = text.slice(i);
                    lines.push(ellipsize(rest, maxWidth));
                    return lines;
                  }
                } else {
                  cur = next;
                }
              }
              if (cur) lines.push(cur);
              return lines;
            };

            // ── L1 背景：浅灰底 ──
            ctx.fillStyle = '#F7F6FB';
            ctx.fillRect(0, 0, W, H);

            // ── L2 顶部封面：按宽等比缩放（不裁切），上方对齐 ──
            //   主题色作底色，封面比例超过 320:375 时居中裁切上下，避免封面过高
            ctx.fillStyle = themeColor;
            ctx.fillRect(0, 0, W, coverDrawH);
            if (coverImg) {
              const iw = coverImg.width || 1, ih = coverImg.height || 1;
              const naturalH = Math.round((W * ih) / iw);
              if (naturalH <= coverDrawH) {
                // 等比缩放即可完整展示
                ctx.drawImage(coverImg, 0, 0, W, naturalH);
              } else {
                // 太高：按宽度填满，上下居中裁切
                const scale = W / iw;
                const dh = ih * scale;
                ctx.drawImage(coverImg, 0, (coverDrawH - dh) / 2, W, dh);
              }
            }

            // ── L3 白色标题栏（封面下方，课程名 + 共 N 节）──
            let y = coverDrawH;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, y, W, 64);
            ctx.fillStyle = '#1A1A22';
            ctx.font = 'bold 19px sans-serif';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText(ellipsize(course.title || '精品课程', W - 32), 16, y + 24);
            ctx.fillStyle = themeColor;
            ctx.font = '12px sans-serif';
            ctx.fillText(`共 ${total} 节 · 专业母婴系统课`, 16, y + 48);
            y += 64;

            // ── L4 课程介绍 ──
            ctx.textBaseline = 'alphabetic';
            y += 18;
            // 主题色"标"
            ctx.fillStyle = themeColor;
            ctx.fillRect(16, y - 2, 4, 18);
            ctx.fillStyle = '#1A1A22';
            ctx.font = 'bold 16px sans-serif';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('课程介绍', 26, y + 12);
            y += 28;

            // introText 已在尺寸预测算时定义
            ctx.fillStyle = '#4A4A55';
            ctx.font = '13px sans-serif';
            const introLines = wrapText(introText, W - 32, INTRO_MAX_LINES);
            introLines.forEach((line) => {
              ctx.fillText(line, 16, y + 12);
              y += 20;
            });
            y += 8;

            // ── L4 课程大纲头 ──
            ctx.fillStyle = themeColor;
            ctx.fillRect(16, y, 4, 18);
            ctx.fillStyle = '#1A1A22';
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText('课程大纲', 26, y + 14);
            // 右侧节数
            ctx.fillStyle = '#9A9AA5';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${total} 节`, W - 16, y + 14);
            ctx.textAlign = 'left';
            y += 34;

            // ── L5 节列表（前 POSTER_OUTLINE_MAX 节）──
            const list = lessons.slice(0, showCount);
            list.forEach((l, i) => {
              const idx = String(l.indexLabel || (i + 1)).padStart(2, '0');
              // 序号徽章
              ctx.fillStyle = themeColor;
              ctx.font = 'bold 12px sans-serif';
              ctx.textBaseline = 'middle';
              ctx.fillText(idx, 16, y + 12);
              // 节标题
              ctx.fillStyle = '#1A1A22';
              ctx.font = '13px sans-serif';
              const title = ellipsize(l.title || `第 ${i + 1} 节`, W - 16 - 38 - 16 - 50);
              ctx.fillText(title, 16 + 38, y + 12);
              // 时长
              if (l.durationText) {
                ctx.fillStyle = '#9A9AA5';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(l.durationText, W - 16, y + 12);
                ctx.textAlign = 'left';
              }
              y += 26;
            });
            if (remain > 0) {
              ctx.fillStyle = themeColor;
              ctx.font = '12px sans-serif';
              ctx.textBaseline = 'middle';
              ctx.textAlign = 'center';
              ctx.fillText(`等 ${remain} 节，扫码查看全部 →`, W / 2, y + 12);
              ctx.textAlign = 'left';
              y += 24;
            }
            y += 6;

            // ── L6 底部顾问条 110px ──
            const BAR_H = 110;
            const BAR_Y = H - BAR_H;
            // 主题色渐变背景
            const gradBar = ctx.createLinearGradient(0, BAR_Y, W, BAR_Y + BAR_H);
            gradBar.addColorStop(0, themeColor);
            gradBar.addColorStop(1, themeColorDark);
            ctx.fillStyle = gradBar;
            ctx.fillRect(0, BAR_Y, W, BAR_H);

            // 左侧顾问头像（圆形）
            const AV = 54;
            const AX = 16, AY = BAR_Y + (BAR_H - AV) / 2;
            ctx.save();
            ctx.beginPath();
            ctx.arc(AX + AV / 2, AY + AV / 2, AV / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            if (advisorAvatarPath) {
              const av = canvas.createImage();
              av.src = advisorAvatarPath;
              await new Promise(r => { av.onload = r; av.onerror = r; });
              ctx.drawImage(av, AX, AY, AV, AV);
            } else {
              // 头像兜底：白底 + 首字
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(AX, AY, AV, AV);
              ctx.fillStyle = themeColor;
              ctx.font = 'bold 22px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              const ch = (advisor.name || '顾').charAt(0);
              ctx.fillText(ch, AX + AV / 2, AY + AV / 2);
              ctx.textAlign = 'left';
            }
            ctx.restore();
            // 头像白色描边
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(AX + AV / 2, AY + AV / 2, AV / 2, 0, Math.PI * 2);
            ctx.stroke();

            // 顾问文字：仅姓名 + 电话两行，与头像垂直居中对齐
            const TX = AX + AV + 14;
            const QW = 78, QH = 78;
            const QX = W - QW - 14, QY = BAR_Y + (BAR_H - QH) / 2;
            const textMaxW = QX - TX - 10;
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 20px sans-serif';
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
            ctx.fillText(ellipsize(advisor.name || '安得褓贝顾问', textMaxW), TX, BAR_Y + 50);
            if (advisor.phone) {
              ctx.fillStyle = 'rgba(255,255,255,0.92)';
              ctx.font = '16px sans-serif';
              ctx.fillText(advisor.phone, TX, BAR_Y + 78);
            }

            // 右侧 QR 圆角白卡
            roundRectPath(QX, QY, QW, QH, 8);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            if (qrLocalPath) {
              const qrImg = canvas.createImage();
              qrImg.src = qrLocalPath;
              await new Promise(r => { qrImg.onload = r; qrImg.onerror = r; });
              ctx.save();
              roundRectPath(QX + 5, QY + 5, QW - 10, QH - 10, 4);
              ctx.clip();
              ctx.drawImage(qrImg, QX + 5, QY + 5, QW - 10, QH - 10);
              ctx.restore();
            } else {
              // 小程序码未生成（云函数未部署 / 调用失败）：白卡内显示占位文案，避免空白看起来像断版
              ctx.save();
              ctx.fillStyle = '#9A9AA5';
              ctx.font = '11px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('小程序码', QX + QW / 2, QY + QH / 2 - 8);
              ctx.fillText('生成中', QX + QW / 2, QY + QH / 2 + 10);
              ctx.restore();
              ctx.textAlign = 'left';
              ctx.textBaseline = 'alphabetic';
            }

            // ── L7 海报水印：安得褓贝 logo 大尺寸淡显，覆盖在内容卡之上，避开底部顾问条 ──
            if (logoLocalPath) {
              const wmImg = canvas.createImage();
              wmImg.src = logoLocalPath;
              await new Promise(r => { wmImg.onload = r; wmImg.onerror = r; });
              const wmSize = 260;
              const wmX = (W - wmSize) / 2;
              // 居中于"封面下沿 ~ 顾问条上沿"之间，避免覆盖底部联系信息
              const wmY = coverDrawH + ((H - BAR_H) - coverDrawH - wmSize) / 2;
              ctx.save();
              ctx.globalAlpha = 0.06;
              ctx.drawImage(wmImg, wmX, wmY, wmSize, wmSize);
              ctx.restore();
            }

            // ── 导出（固定 1080 × 1980，朋友圈友好比例） ──
            wx.canvasToTempFilePath({
              canvas,
              width: W,
              height: H,
              destWidth: 1080,
              destHeight: 1980,
              fileType: 'jpg',
              quality: 0.95,
              success: (r) => resolve(r.tempFilePath),
              fail: (err) => reject(new Error((err && err.errMsg) || '导出失败')),
            });
          } catch (err) {
            reject(err);
          }
        });
    });
  },

  // 客户点击底部"联系顾问"：与 resumeDetail 行为一致，仅暴露电话拨号
  onContactAdvisor() {
    const sharerInfo = this.data.sharerInfo;
    if (!sharerInfo) {
      wx.showToast({ title: '顾问信息不存在', icon: 'none' });
      return;
    }

    const itemList = [];
    const actions = [];

    if (sharerInfo.phone) {
      itemList.push(`拨打电话：${sharerInfo.phone}`);
      actions.push(() => {
        wx.makePhoneCall({
          phoneNumber: sharerInfo.phone,
          fail: (error) => {
            console.error('拨打电话失败:', error);
            wx.showToast({ title: '拨打电话失败', icon: 'none' });
          }
        });
      });
    }

    if (itemList.length === 0) {
      wx.showToast({ title: '暂无联系方式', icon: 'none' });
      return;
    }

    wx.showActionSheet({
      itemList,
      success: (res) => {
        if (res.tapIndex < actions.length) actions[res.tapIndex]();
      }
    });
  },
});
