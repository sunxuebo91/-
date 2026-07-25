// pages/aiMatch/index.js
// AI 心动匹配：语音/文字识别客户需求，AI 智能推荐10位阿姨，探探式滑动浏览
const { publicRequest } = require('../../utils/request.js');
// needs 白名单规范化（含省份→籍贯纠正兜底），实现见同目录 needs-sanitize.js
const { sanitizeNeeds } = require('./needs-sanitize.js');

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

// 技能 code -> 中文标签（与 mobile-app/src/pages/Resumes.tsx 中 SKILLS_MAP 保持一致）
const SKILLS_LABEL_MAP = {
  chanhou: '产后修复师',
  'teshu-yinger': '特殊婴儿护理',
  yiliaobackground: '医疗背景',
  yuying: '高级育婴师',
  zaojiao: '早教师',
  fushi: '辅食营养师',
  ertui: '小儿推拿师',
  waiyu: '外语',
  zhongcan: '中餐',
  xican: '西餐',
  mianshi: '面食',
  jiashi: '驾驶',
  shouyi: '整理收纳',
  muying: '母婴护理师',
  cuiru: '高级催乳师',
  yuezican: '月子餐营养师',
  yingyang: '营养师',
  'liliao-kangfu': '理疗康复',
  'shuangtai-huli': '双胎护理',
  'yanglao-huli': '养老护理',
};

function translateSkill(code) {
  if (!code) return '';
  const s = String(code);
  // 已经是中文（不包含连字符的纯中文 / 长度>=2 中文）就直接返回
  if (/[\u4e00-\u9fa5]/.test(s) && !s.includes('-')) return s;
  return SKILLS_LABEL_MAP[s] || s;
}

// 诚实匹配：未满足条件 code -> 卡片小标签文案（nativePlace 特殊处理，见 _unmetLabels）
const UNMET_NEED_LABELS = {
  jobType: '工种不符',
  city: '非常驻城市',
  priceMax: '超预算',
  ageRange: '年龄不符',
  level: '等级不符',
};

// 按钮图标：base64 SVG（小程序不支持内联 SVG 标签），viewBox 24x24，胖圆头软糖风
const ICON_UNDO = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOEE5M0I4IiBzdHJva2Utd2lkdGg9IjMuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cG9seWxpbmUgcG9pbnRzPSIzIDUgMyAxMSA5IDExIi8+PHBhdGggZD0iTTQuOSAxNS41YTkgOSAwIDEgMCAyLjEtOS4zTDMgMTEiLz48L3N2Zz4=';
const ICON_NOPE = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRkY1QTZFIiBzdHJva2Utd2lkdGg9IjMuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48bGluZSB4MT0iMTciIHkxPSI3IiB4Mj0iNyIgeTI9IjE3Ii8+PGxpbmUgeDE9IjciIHkxPSI3IiB4Mj0iMTciIHkyPSIxNyIvPjwvc3ZnPg==';
const ICON_LIKE = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzdCNUJGNSI+PHBhdGggZD0iTTIwLjg0IDQuNjFhNS41IDUuNSAwIDAgMC03Ljc4IDBMMTIgNS42N2wtMS4wNi0xLjA2YTUuNSA1LjUgMCAwIDAtNy43OCA3Ljc4bDEuMDYgMS4wNkwxMiAyMS4yM2w3Ljc4LTcuNzggMS4wNi0xLjA2YTUuNSA1LjUgMCAwIDAgMC03Ljc4eiIvPjwvc3ZnPg==';
const ICON_STAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI0ZGRkZGRiIgc3Ryb2tlPSIjRkZGRkZGIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBvbHlnb24gcG9pbnRzPSIxMiAyIDE1LjA5IDguMjYgMjIgOS4yNyAxNyAxNC4xNCAxOC4xOCAyMS4wMiAxMiAxNy43NyA1LjgyIDIxLjAyIDcgMTQuMTQgMiA5LjI3IDguOTEgOC4yNiAxMiAyIi8+PC9zdmc+';

Page({
  data: {
    // 自定义导航栏
    statusBarHeight: 20,
    navBarHeight: 44,

    // 输入阶段
    inputText: '',
    recording: false,
    recordSeconds: 60,   // 录音倒计时（从 60 倒数）
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
    resultEntered: false,  // 结果页是否已入场（控制按钮动画）
    emptyReason: '',       // 空态类型：'no-match'=没匹配到，'finished'=看完了全部推荐
    likeCount: 0,          // 本次会话内"标记合适"的数量（结果头部 chip 用）
    relaxNote: '',         // 放宽提示（strictCount=0 时后端给的说明文案，空串不显示）

    // 操作按钮图标（base64 SVG）
    iconUndo: ICON_UNDO,
    iconNope: ICON_NOPE,
    iconLike: ICON_LIKE,
    iconStar: ICON_STAR,
  },

  manager: null,

  onLoad() {
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    this.setData({ isStaff: crmUserInfo.isStaff === true });
    // 恢复登录前未提交的需求草稿，避免跳登录页回来后输入丢失
    const draft = wx.getStorageSync('aiMatch_draft');
    if (draft) {
      this.setData({ inputText: draft });
    }
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
        this._clearRecordTimer();
        const result = (res && res.result) || '';
        if (result) {
          // 记录成功时间：插件随后可能补发一次 error，用于甄别“假失败”
          this._lastVoiceResultAt = Date.now();
          // 原有文本非空且不以空格/标点结尾时，中间补一个空格再拼
          const prev = this.data.inputText || '';
          const sep = prev && !/[\s，。,.、；;！!？?]$/.test(prev) ? ' ' : '';
          const merged = `${prev}${sep}${result}`.slice(0, 300);
          this.setData({ inputText: merged });
          // 语音输入同样同步草稿
          wx.setStorageSync('aiMatch_draft', merged);
        }
        this.setData({ recording: false, recordSeconds: 60 });
      };
      this.manager.onError = (res) => {
        this._clearRecordTimer();
        // 同声传译插件在 onStop 返回识别结果后，常会补发一次 error；
        // 刚拿到结果的本次录音会话不再提示失败
        if (this._lastVoiceResultAt && Date.now() - this._lastVoiceResultAt < 3000) {
          console.warn('[aiMatch] 识别成功后补发的 error（忽略）', res);
          this.setData({ recording: false, recordSeconds: 60 });
          return;
        }
        console.warn('[aiMatch] 语音识别错误', res);
        wx.showToast({ title: '语音识别失败，请重试', icon: 'none' });
        this.setData({ recording: false, recordSeconds: 60 });
      };
    } catch (e) {
      console.warn('[aiMatch] WechatSI 插件加载失败', e);
    }
  },

  onInputText(e) {
    this.setData({ inputText: e.detail.value });
    // 同步草稿到本地，跳登录页回来后不丢
    wx.setStorageSync('aiMatch_draft', e.detail.value);
  },

  // 工种 chips：点击把对应示例文案填入输入框
  tapTipChip(e) {
    const text = (e && e.currentTarget && e.currentTarget.dataset.text) || '';
    if (!text) return;
    this.setData({ inputText: text });
    wx.setStorageSync('aiMatch_draft', text);
  },

  onVoiceStart() {
    if (!this.manager) {
      wx.showToast({ title: '当前环境不支持语音识别', icon: 'none' });
      return;
    }
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        // 新一次录音会话开始，清掉上一轮的成功标记，避免掩盖真实失败
        this._lastVoiceResultAt = 0;
        this.manager.start({ duration: 60000, lang: 'zh_CN' });
        this.setData({ recording: true, recordSeconds: 60 });
        this._startRecordTimer();
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
    this._clearRecordTimer();
    if (this.manager && this.data.recording) {
      this.manager.stop();
    }
  },

  // 录音倒计时：从 60 每秒倒数，归零自动结束（与 manager 的 60s duration 对齐）
  _startRecordTimer() {
    this._clearRecordTimer();
    this._recordTimer = setInterval(() => {
      const next = (this.data.recordSeconds || 60) - 1;
      if (next <= 0) {
        this.setData({ recordSeconds: 0 });
        this.onVoiceEnd();
        return;
      }
      this.setData({ recordSeconds: next });
    }, 1000);
  },

  _clearRecordTimer() {
    if (this._recordTimer) {
      clearInterval(this._recordTimer);
      this._recordTimer = null;
    }
  },

  // ────────────────────────────── AI 匹配 ──────────────────────────────
  async matchNow() {
    // 录音中先收尾再继续匹配，避免录音回调和匹配流程打架
    if (this.data.recording) {
      this.onVoiceEnd();
    }

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

      // 白名单规范化：字段漂移归一 + 非法字段剔除，防止条件静默丢失
      const needs = sanitizeNeeds(result.data || {});
      this.setData({ needs });
      await this._matchResumes(needs);
      // 匹配成功，需求已消费，清掉草稿
      wx.removeStorageSync('aiMatch_draft');
    } catch (e) {
      console.error('[aiMatch] 匹配失败:', e);
      wx.showToast({ title: e.message || '匹配失败，请重试', icon: 'none' });
    } finally {
      this.setData({ matching: false });
    }
  },

  // 服务端匹配：POST /api/resumes/match，返回已按 matchScore 降序的脱敏简历
  async _matchResumes(needs) {
    // 带上客户手机号，后端可用于"略过降权"等个性化；未登录不带
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const body = { needs, limit: 20 };
    if (crmUserInfo.phone) body.customerPhone = crmUserInfo.phone;

    const resp = await publicRequest({
      url: '/resumes/match',
      method: 'POST',
      data: body,
    });

    // 后端明确失败（success === false）不是"未匹配到"：抛错走 matchNow 的 catch 提示
    if (!resp || resp.success === false) {
      throw new Error((resp && (resp.errMsg || resp.message)) || '匹配失败');
    }

    const data = resp.data || {};
    const items = data.items || [];

    // 诚实匹配：strictCount=0 时后端给放宽说明；旧数据无 meta 则不显示
    const meta = data.meta || {};
    const relaxNote = (meta.strictCount === 0 && meta.relaxNote) ? String(meta.relaxNote) : '';

    // 曝光/操作/已选去重表随新一轮匹配重置
    this._impressedIds = {};
    this._actedIds = {};
    this._likedIds = {};

    if (!items.length) {
      // 未匹配到：走独立的"未匹配到"空态（与"看完了"区分）
      this.setData({
        cards: [],
        stackCards: [],
        currentIndex: 0,
        resultReady: true,
        resultEntered: true,
        emptyReason: 'no-match',
        likeCount: 0,
        relaxNote: '',
      });
      return;
    }

    const matchedCards = items.map((item) => this._formatCard(item));
    this.setData({
      cards: matchedCards,
      currentIndex: 0,
      resultReady: true,
      resultEntered: true,
      emptyReason: '',
      likeCount: 0,
      relaxNote,
    });
    this._refreshStack();
  },

  // 诚实匹配：未满足条件 code -> 卡片小标签文案（向后兼容：无 unmetNeeds 返回空数组）
  _unmetLabels(unmetNeeds) {
    if (!Array.isArray(unmetNeeds) || !unmetNeeds.length) return [];
    const nativePlace = String((this.data.needs && this.data.needs.nativePlace) || '')
      .replace(/(省|市|人)$/, '');
    return unmetNeeds.map((code) => {
      if (code === 'nativePlace') {
        return nativePlace ? `非${nativePlace}籍` : '非本地籍贯';
      }
      return UNMET_NEED_LABELS[code] || '';
    }).filter(Boolean);
  },

  _formatCard(item) {
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

    // 月嫂（含旧 code yuexin）按 26 天计价，小时工的 expectedSalary 是时薪，其余按月
    const priceUnit = ['yuesao', 'yuexin'].includes(item.jobType)
      ? '/26天'
      : (item.jobType === 'xiaoshi' ? '/小时' : '/月');

    return {
      _id: item._id,
      name,
      coverFileId: uniformPhotoUrl || photos[0] || item.avatarUrl || '',
      jobTypeLabel,
      infoLine,
      // 把销售归属信息带出去，方便"面试"按钮直接拿来通知对应的专属顾问
      sharerInfo: item.sharerInfo
        ? {
            phone: item.sharerInfo.phone || '',
            name: item.sharerInfo.name || '',
          }
        : null,
      tags: (item.skills || []).slice(0, 3).map(translateSkill),
      intro: item.selfIntroduction ? String(item.selfIntroduction).slice(0, 50) : '',
      priceMonth: item.expectedSalary || '',
      priceUnit,
      // 服务端匹配分（0-100）与推荐理由，直接透传到卡片
      matchScore: Number(item.matchScore) || 0,
      matchReason: item.matchReason || '',
      // 诚实匹配：该候选人未满足的显式条件小标签（旧数据无此字段则为空，不显示）
      unmetLabels: this._unmetLabels(item.unmetNeeds),
    };
  },

  // ────────────────────────────── 探探式滑动 ──────────────────────────────
  _refreshStack() {
    const { cards, currentIndex } = this.data;
    const stackCards = cards.slice(currentIndex, currentIndex + 3).map((c, i) => ({
      ...c,
      // 关键：每张卡片堆叠时给 transition 字段，让切卡时下一张"放大顶上来"有动画
      stackStyle: i === 0
        ? 'transition: transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.35s ease;'
        : `transform: translateY(${i * 20}rpx) scale(${1 - i * 0.06}); z-index:${10 - i}; opacity:${i === 2 ? 0.65 : 1}; transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s ease;`,
    }));
    this.setData({ stackCards });

    // 曝光上报：顶部卡片每张只报一次（去重表在 _matchResumes / resetMatch 里重置）
    const top = stackCards[0];
    this._impressedIds = this._impressedIds || {};
    if (top && top._id && !this._impressedIds[top._id]) {
      this._impressedIds[top._id] = true;
      this._track('impression', top._id);
    }
  },

  // 匹配事件上报：POST /api/resumes/match/event，静默失败不影响主流程
  _track(event, resumeId) {
    if (!resumeId) return;
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const body = { resumeId, event };
    if (crmUserInfo.phone) body.customerPhone = crmUserInfo.phone;
    if (this.data.needs && this.data.needs.summary) body.needsSummary = this.data.needs.summary;
    publicRequest({
      url: '/resumes/match/event',
      method: 'POST',
      data: body,
    }).catch((e) => {
      console.warn('[aiMatch] 事件上报失败(忽略):', event, e);
    });
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
    const adx = Math.abs(dx);
    if (adx > 100) {
      // 飞卡后同样抑制紧随的 tap，防止误跳详情（tapDetail 开头检查该标志）
      this._suppressTap = true;
      setTimeout(() => { this._suppressTap = false; }, 300);
      this._triggerSwipe(dx > 0 ? 'like' : 'nope');
    } else if (adx > 10) {
      // 拖动后回弹：抑制紧随其后的 tap，防止误跳详情（tapDetail 开头检查该标志）
      this._suppressTap = true;
      setTimeout(() => { this._suppressTap = false; }, 300);
      this.setData({
        cardStyle: 'z-index: 20; transform: translate(0,0) rotate(0deg); transition: transform 0.25s ease-out;',
        swipeDirection: '',
      });
    }
    // adx ≤ 10 视为轻点（tap），直接放行给卡片的 catchtap 处理，不拦截也不回弹
  },

  tapLike() {
    // 合适 = 右滑语义：上报 like + 卡片飞出；看详情走卡片上的"详情›"
    this._triggerSwipe('like');
  },

  tapDislike() {
    this._triggerSwipe('nope');
  },

  // 撤销：回到上一张（探探同名按钮）
  tapUndo() {
    if (this.data.animating || this.data.currentIndex <= 0) return;
    // 撤销把已"合适"的卡拿回来：已选计数相应减，并允许再次上报/计数
    const prev = this.data.cards[this.data.currentIndex - 1];
    if (prev && prev._id && this._likedIds && this._likedIds[prev._id]) {
      delete this._likedIds[prev._id];
      if (this._actedIds) delete this._actedIds[`like_${prev._id}`];
      this.setData({ likeCount: Math.max(0, this.data.likeCount - 1) });
    }
    this.setData({
      currentIndex: this.data.currentIndex - 1,
      cardStyle: 'z-index: 20;',
      swipeDirection: '',
    }, () => {
      this._refreshStack();
      wx.showToast({ title: '已撤销', icon: 'none', duration: 800 });
    });
  },

  // 面试申请：通知销售/管理员（沿用 notificationService 通道）
  tapSuper() {
    if (this.data.animating) return;
    // 提交锁：防止用户连点导致重复通知
    if (this._superSubmitting) return;
    const cur = this.data.cards[this.data.currentIndex];
    if (!cur || !cur._id) return;

    // 兜底：万一首页拦截被绕过 / 缓存被清，这里再检查一次
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    if (!crmUserInfo.phone) {
      wx.showModal({
        title: '请先登录',
        content: '申请面试需要先登录，方便顾问与您取得联系',
        confirmText: '去登录',
        confirmColor: '#7B5BF5',
        success: (r) => { if (r.confirm) wx.navigateTo({ url: '/pages/login/index' }); },
      });
      return;
    }

    this._superSubmitting = true;
    wx.showLoading({ title: '提交中...', mask: true });
    wx.cloud.callFunction({
      name: 'notificationService',
      data: {
        action: 'sendInterviewRequest',
        customerPhone: crmUserInfo.phone,
        customerName: crmUserInfo.nickname || crmUserInfo.name || '小程序客户',
        nurseName: cur.name || '',
        resumeId: cur._id,
        // 优先用简历的"分享人/销售"——有就走专属顾问通知
        // 没有（公海/无归属简历）走管理员通知
        sharerPhone: (cur.sharerInfo && cur.sharerInfo.phone) || '',
        // 带上需求摘要，顾问看到通知时知道客户要什么
        needsSummary: this.data.needs.summary || '',
      },
    }).then((res) => {
      wx.hideLoading();
      const result = (res && res.result) || {};
      const data = result.data || {};
      if (result.success === true && data.delivery !== 'failed') {
        if (data.duplicated === true) {
          // 重复申请：顾问已在跟进，不再重复打扰
          wx.showToast({ title: '顾问正在跟进中，请稍候', icon: 'none' });
        } else {
          const target = data.notifyTarget || '顾问';
          wx.showToast({ title: `已通知${target}`, icon: 'success' });
          this._track('interview', cur._id);
        }
      } else if (result.success === true && data.delivery === 'failed') {
        // 云函数承认投递失败，如实提示，不再假成功
        wx.showToast({ title: '通知失败，请稍后重试', icon: 'none' });
      } else {
        wx.showToast({ title: result.errMsg || '通知失败，请重试', icon: 'none' });
      }
    }).catch((err) => {
      wx.hideLoading();
      console.warn('[aiMatch] 面试通知失败:', err);
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    }).finally(() => {
      this._superSubmitting = false;
    });
  },

  _triggerSwipe(direction) {
    if (this.data.animating || this.data.currentIndex >= this.data.cards.length) return;
    const cur = this.data.cards[this.data.currentIndex];
    // 同一张卡同一事件按会话去重：报过就跳过 _track，但飞卡动画照常
    if (cur && cur._id) {
      this._actedIds = this._actedIds || {};
      const actKey = `${direction}_${cur._id}`;
      if (!this._actedIds[actKey]) {
        this._actedIds[actKey] = true;
        this._track(direction, cur._id);
      }
      // "已选 N 位"计数：同一张卡只计一次（撤销时相应减）
      if (direction === 'like') {
        this._likedIds = this._likedIds || {};
        if (!this._likedIds[cur._id]) {
          this._likedIds[cur._id] = true;
          this.setData({ likeCount: this.data.likeCount + 1 });
        }
      }
    }
    if (direction === 'like') {
      // 右滑 = 标记合适：提示（详情走卡片上的"详情›"）
      wx.showToast({ title: '已标记合适', icon: 'none', duration: 800 });
    }
    const flyX = direction === 'like' ? 700 : -700;
    const rotate = direction === 'like' ? 25 : -25;
    this.setData({
      animating: true,
      cardStyle: `z-index: 20; transform: translate(${flyX}px, -40px) rotate(${rotate}deg); transition: transform 0.35s ease-out; opacity: 0;`,
      swipeDirection: direction,
    });
    // 存句柄：resetMatch / onUnload 里可清掉，配合 _afterSwipe 的 resultReady 兜底
    this._swipeTimer = setTimeout(() => this._afterSwipe(), 350);
  },

  _afterSwipe() {
    // 兜底：动画途中已退出结果阶段（如点了重新描述/页面卸载）则不再推进
    if (!this.data.resultReady) return;
    const nextIndex = this.data.currentIndex + 1;
    // 第一张（也就是被飞走的那张的"接替者"）必须有 transition，否则 scale 1→1 看着卡
    // 同时保持 resultEntered=true，让按钮不再重播入场动画
    this.setData({
      currentIndex: nextIndex,
      cardStyle: 'z-index: 20; transform: translate(0,0) rotate(0deg); transition: transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);',
      swipeDirection: '',
      animating: false,
      resultEntered: true,
      // 看完最后一张 → "看完了"空态
      emptyReason: nextIndex >= this.data.cards.length ? 'finished' : this.data.emptyReason,
    }, () => {
      this._refreshStack();
    });
  },

  tapDetail(e) {
    // 拖动回弹后的短时间内抑制 tap，防止误触跳详情
    if (this._suppressTap) {
      this._suppressTap = false;
      return;
    }
    const id = (e.currentTarget.dataset.id) || (this.data.cards[this.data.currentIndex] || {})._id;
    if (!id) return;
    this._track('detail', id);
    wx.navigateTo({ url: `/pages/resumeDetail/index?id=${id}` });
  },

  // 跳"我的心动阿姨"：需登录，未登录走登录拦截（登录成功后自动跳回 myLikes）
  goMyLikes() {
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    if (!crmUserInfo.phone) {
      wx.showModal({
        title: '请先登录',
        content: '登录后才能查看你标记过的心动阿姨',
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
    wx.navigateTo({ url: '/pages/myLikes/index' });
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
      animating: false,
      emptyReason: '',
      likeCount: 0,
      relaxNote: '',
    });
    // 重新匹配时同步清掉草稿与曝光/操作/已选去重表
    wx.removeStorageSync('aiMatch_draft');
    this._impressedIds = {};
    this._actedIds = {};
    this._likedIds = {};
    // 清掉未完成的飞卡定时器，避免重置后 _afterSwipe 迟到推进
    if (this._swipeTimer) {
      clearTimeout(this._swipeTimer);
      this._swipeTimer = null;
    }
  },

  // 页面被遮盖（切后台/跳转）时录音中则收尾，避免状态悬挂
  onHide() {
    if (this.data.recording) {
      this.onVoiceEnd();
    }
  },

  onUnload() {
    this._clearRecordTimer();
    if (this._swipeTimer) {
      clearTimeout(this._swipeTimer);
      this._swipeTimer = null;
    }
    if (this.manager && this.data.recording) {
      try { this.manager.stop(); } catch (e) {}
    }
  },
});