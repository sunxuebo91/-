// pages/aiMatch/index.js
// AI 心动匹配：语音/文字识别客户需求，AI 智能推荐10位阿姨，探探式滑动浏览
const resumeService = require('../../services/resume.js');

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
};

Page({
  data: {
    // 自定义导航栏
    statusBarHeight: 20,
    navBarHeight: 44,

    // 输入阶段
    inputText: '',
    recording: false,
    matching: false,
    isStaff: false,

    // 结果阶段
    resultReady: false,
    needs: {},
    cards: [],
    stackCards: [],
    currentIndex: 0,
    cardStyle: 'z-index: 20;',
    swipeDirection: '',
    animating: false,
  },

  manager: null,

  onLoad() {
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    this.setData({ isStaff: crmUserInfo.isStaff === true });
    this._initNavBar();
    this._initVoicePlugin();
  },

  // ────────────────────────────── 自定义导航栏 ──────────────────────────────
  _initNavBar() {
    try {
      const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const menuRect = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
      if (menuRect && menuRect.top) {
        const navContentHeight = (menuRect.top - sysInfo.statusBarHeight) * 2 + menuRect.height;
        this.setData({
          statusBarHeight: sysInfo.statusBarHeight || 20,
          navBarHeight: navContentHeight || 44,
        });
      } else {
        this.setData({
          statusBarHeight: sysInfo.statusBarHeight || 20,
          navBarHeight: 44,
        });
      }
    } catch (e) {
      console.warn('[aiMatch] 读取系统信息失败，使用默认导航栏高度', e);
    }
  },

  onNavBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/home/index' });
    }
  },

  // ────────────────────────────── 语音识别 ──────────────────────────────
  _initVoicePlugin() {
    try {
      const plugin = requirePlugin('WechatSI');
      this.manager = plugin.getRecordRecognitionManager();
      this.manager.onStop = (res) => {
        const result = (res && res.result) || '';
        if (result) {
          const merged = `${this.data.inputText}${result}`.slice(0, 300);
          this.setData({ inputText: merged });
        }
        this.setData({ recording: false });
      };
      this.manager.onError = (res) => {
        console.warn('[aiMatch] 语音识别错误', res);
        wx.showToast({ title: '语音识别失败，请重试', icon: 'none' });
        this.setData({ recording: false });
      };
    } catch (e) {
      console.warn('[aiMatch] WechatSI 插件加载失败', e);
    }
  },

  onInputText(e) {
    this.setData({ inputText: e.detail.value });
  },

  onVoiceStart() {
    if (!this.manager) {
      wx.showToast({ title: '当前环境不支持语音识别', icon: 'none' });
      return;
    }
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.manager.start({ duration: 60000, lang: 'zh_CN' });
        this.setData({ recording: true });
      },
      fail: () => {
        wx.showModal({
          title: '需要录音权限',
          content: '请在设置中开启录音权限后重试',
          confirmText: '去设置',
          success: (r) => {
            if (r.confirm) wx.openSetting();
          },
        });
      },
    });
  },

  onVoiceEnd() {
    if (this.manager && this.data.recording) {
      this.manager.stop();
    }
  },

  // ────────────────────────────── AI 匹配 ──────────────────────────────
  async matchNow() {
    const text = (this.data.inputText || '').trim();
    if (!text) {
      wx.showToast({ title: '请输入或说出您的需求', icon: 'none' });
      return;
    }

    this.setData({ matching: true });
    try {
      const parseRes = await wx.cloud.callFunction({
        name: 'aiMatchService',
        data: { action: 'parseNeeds', text },
      });
      const result = parseRes.result || {};
      if (!result.success) throw new Error(result.errMsg || '需求解析失败');

      const needs = result.data || {};
      this.setData({ needs });
      await this._fetchAndScoreResumes(needs);
    } catch (e) {
      console.error('[aiMatch] 匹配失败:', e);
      wx.showToast({ title: e.message || '匹配失败，请重试', icon: 'none' });
    } finally {
      this.setData({ matching: false });
    }
  },

  async _fetchAndScoreResumes(needs) {
    // 逐步放宽筛选条件，确保总能凑够候选简历
    const attempts = [
      { page: 1, pageSize: 50, jobType: needs.jobType || '', maternityNurseLevel: needs.level || '', keyword: needs.city || '' },
      { page: 1, pageSize: 50, jobType: needs.jobType || '', maternityNurseLevel: needs.level || '' },
      { page: 1, pageSize: 50, jobType: needs.jobType || '' },
      { page: 1, pageSize: 50 },
    ];

    let list = [];
    for (const params of attempts) {
      try {
        const resp = await resumeService.getResumeList(params);
        list = (resp.success && resp.data && resp.data.items) || [];
      } catch (e) {
        list = [];
      }
      if (list.length >= 5) break;
    }

    const scored = list.map((item) => ({ item, score: this._scoreResume(item, needs) }));
    scored.sort((a, b) => b.score - a.score);
    const matchedCards = scored.slice(0, 20).map((s) => this._formatCard(s.item, s.score));

    this.setData({ cards: matchedCards, currentIndex: 0, resultReady: true });
    this._refreshStack();

    if (matchedCards.length === 0) {
      wx.showToast({ title: '暂无匹配的阿姨，换个说法试试', icon: 'none' });
    }
  },

  _scoreResume(item, needs) {
    let score = 0;
    if (needs.jobType && item.jobType === needs.jobType) score += 40;
    if (needs.level && item.maternityNurseLevel === needs.level) score += 20;

    if (needs.city) {
      const addr = `${item.nativePlace || ''}${item.currentAddress || ''}`;
      if (addr.includes(needs.city)) score += 15;
    }

    if (needs.priceMax && item.expectedSalary) {
      score += Number(item.expectedSalary) <= Number(needs.priceMax) ? 15 : -10;
    }

    if (needs.ageMin || needs.ageMax) {
      const age = Number(item.age) || 0;
      const okMin = !needs.ageMin || age >= needs.ageMin;
      const okMax = !needs.ageMax || age <= needs.ageMax;
      if (okMin && okMax) score += 10;
    }

    if (needs.skills && needs.skills.length) {
      const skillsText = `${(item.skills || []).join(' ')} ${item.selfIntroduction || ''}`;
      score += needs.skills.filter((s) => skillsText.includes(s)).length * 8;
    }

    if (needs.keywords && needs.keywords.length) {
      const text = `${item.name || ''} ${item.nativePlace || ''} ${item.currentAddress || ''} ${item.selfIntroduction || ''}`;
      score += needs.keywords.filter((k) => text.includes(k)).length * 5;
    }

    score += Math.min(Number(item.experienceYears) || 0, 10);
    return score;
  },

  _formatCard(item, score) {
    const isStaff = this.data.isStaff;
    const name = isStaff ? item.name : (item.name ? `${item.name.charAt(0)}阿姨` : '阿姨');

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

    const jobTypeLabel = JOB_TYPE_LABEL_MAP[item.jobType] || '';

    const infoParts = [];
    const nativeRaw = item.nativePlace || item.currentAddress || '';
    const nativeShort = nativeRaw ? String(nativeRaw).slice(0, 3) : '';
    if (nativeShort) infoParts.push(`${nativeShort.replace(/(省|市|自治区|特别行政区)$/, '')}人`);
    if (item.age) infoParts.push(`${item.age}岁`);
    if (item.experienceYears) infoParts.push(`${item.experienceYears}年经验`);
    const infoLine = infoParts.join(' · ');

    const priceUnit = item.jobType === 'yuexin' ? '/26天' : '/月';

    return {
      _id: item._id,
      name,
      coverFileId: uniformPhotoUrl || photos[0] || item.avatarUrl || '',
      jobTypeLabel,
      infoLine,
      tags: (item.skills || []).slice(0, 4),
      intro: item.selfIntroduction ? String(item.selfIntroduction).slice(0, 50) : '',
      priceMonth: item.expectedSalary || '',
      priceUnit,
      score,
    };
  },

  // ────────────────────────────── 探探式滑动 ──────────────────────────────
  _refreshStack() {
    const { cards, currentIndex } = this.data;
    const stackCards = cards.slice(currentIndex, currentIndex + 3).map((c, i) => ({
      ...c,
      stackStyle: i === 0 ? '' : `transform: translateY(${i * 16}rpx) scale(${1 - i * 0.05}); z-index:${10 - i}; opacity:${i === 2 ? 0.7 : 1};`,
    }));
    this.setData({ stackCards });
  },

  onTouchStart(e) {
    if (Number(e.currentTarget.dataset.index) !== 0 || this.data.animating) return;
    const t = e.touches[0];
    this._startX = t.clientX;
    this._startY = t.clientY;
    this._dx = 0;
    this._dy = 0;
  },

  onTouchMove(e) {
    if (Number(e.currentTarget.dataset.index) !== 0 || this.data.animating) return;
    const t = e.touches[0];
    const dx = t.clientX - this._startX;
    const dy = t.clientY - this._startY;
    this._dx = dx;
    this._dy = dy;
    const rotate = dx / 15;
    this.setData({
      cardStyle: `z-index: 20; transform: translate(${dx}px, ${dy}px) rotate(${rotate}deg);`,
      swipeDirection: dx > 40 ? 'like' : (dx < -40 ? 'nope' : ''),
    });
  },

  onTouchEnd(e) {
    if (Number(e.currentTarget.dataset.index) !== 0 || this.data.animating) return;
    const dx = this._dx || 0;
    if (Math.abs(dx) > 100) {
      this._triggerSwipe(dx > 0 ? 'like' : 'nope');
    } else {
      this.setData({
        cardStyle: 'z-index: 20; transform: translate(0,0) rotate(0deg); transition: transform 0.25s ease-out;',
        swipeDirection: '',
      });
    }
  },

  tapLike() {
    this._triggerSwipe('like');
  },

  tapDislike() {
    this._triggerSwipe('nope');
  },

  _triggerSwipe(direction) {
    if (this.data.animating || this.data.currentIndex >= this.data.cards.length) return;
    const flyX = direction === 'like' ? 700 : -700;
    const rotate = direction === 'like' ? 25 : -25;
    this.setData({
      animating: true,
      cardStyle: `z-index: 20; transform: translate(${flyX}px, -40px) rotate(${rotate}deg); transition: transform 0.35s ease-out; opacity: 0;`,
      swipeDirection: direction,
    });
    setTimeout(() => this._afterSwipe(), 350);
  },

  _afterSwipe() {
    const nextIndex = this.data.currentIndex + 1;
    this.setData({ currentIndex: nextIndex, cardStyle: 'z-index: 20;', swipeDirection: '', animating: false }, () => {
      this._refreshStack();
    });
  },

  tapDetail(e) {
    const id = (e.currentTarget.dataset.id) || (this.data.cards[this.data.currentIndex] || {})._id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/resumeDetail/index?id=${id}` });
  },

  resetMatch() {
    this.setData({
      resultReady: false,
      inputText: '',
      needs: {},
      cards: [],
      stackCards: [],
      currentIndex: 0,
      cardStyle: 'z-index: 20;',
      swipeDirection: '',
    });
  },

  onUnload() {
    if (this.manager && this.data.recording) {
      try { this.manager.stop(); } catch (e) {}
    }
  },
});