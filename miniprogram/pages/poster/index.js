// ⚠️ 安全提示：API Key 请勿上传到公开代码仓库
// 建议换到云函数中调用，避�?Key 被反编译提取
const DOUBAO_API_KEY   = 'c25615e6-a2bf-4cbc-b9d7-2cdeeba20f56';
const DOUBAO_IMG_MODEL = 'doubao-seedream-5-0-260128';
const DOUBAO_TXT_MODEL = 'doubao-seed-2-0-mini-260215';
const DOUBAO_IMG_URL   = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const DOUBAO_TXT_URL   = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'; // 改用 chat 接口，格式稳�?
const W = 375, H = 640; // 海报画布尺寸 (px)
const POSTER_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得褓贝定稿.png';

// 本地路径缓存：Logo 和 QR 不变，只下载一次
let _logoPathCache       = '';
let _qrPathCache         = '';   // 首页 QR（普通海报）
let _referrerQrCache     = '';   // 推荐注册页 QR（客户推荐海报，按 staffId 区分）
let _referrerQrCacheKey  = '';   // 缓存对应的 staffId+phone，key 变了重新生成

// 通用质量后缀（不再强制要求人像，让风格更多样）
const BASE_SUFFIX = '，无文字，无英文字母，无logo，无水印，竖版构图，2k超高清，电影级光线';

const THEMES = [
  {
    key: 'emotion', name: '情感', icon: '💛', color: '#C8A96E',
    // 3种风格：人像 / 自然风景 / 室内场景，每次随机抽一个
    prompts: [
      '35至45岁温柔中国女性，窗边晨光，薄纱窗帘，暖橙金色调，胶片质感，情绪克制，面部微侧，轮廓光，杂志级人像摄影' + BASE_SUFFIX,
      '清晨薄雾花园小径，露珠挂在玫瑰花瓣，暖橙金色朝阳，梦幻散景，空气感静谧，治愈系自然风景摄影' + BASE_SUFFIX,
      '秋日温馨室内一角，窗边热茶与书，梧桐叶影透过薄纱，暖橙柔光，生活感静物摄影' + BASE_SUFFIX
    ],
    texts: [
      { main: '别把自己活得像个附属品', sub: '你本来是自己的主角' },
      { main: '爱自己', sub: '才是一生最长情的告白' },
      { main: '不是所有感情都值得将就', sub: '你的委屈你最懂' }
    ]
  },
  {
    key: 'career', name: '事业', icon: '💼', color: '#6B9FD4',
    prompts: [
      '35至45岁自信中国职业女性，落地窗前，深蓝西装，金色首饰，镭射背景光，高反差打光，商业大片质感，杂志级人像摄影' + BASE_SUFFIX,
      '现代都市夜景俯瞰，璀璨灯光，蓝金色调，宏大壮阔城市风光，商业感，航拍摄影' + BASE_SUFFIX,
      '极简现代办公室一角，落地玻璃幕墙，金属质感桌面，午后阳光斜射，高级感空间摄影' + BASE_SUFFIX
    ],
    texts: [
      { main: '月薪不是天花板', sub: '是你新的起跑线' },
      { main: '每个认真工作的女人', sub: '都在悄悄变美' },
      { main: '你的专业', sub: '就是你的名片' }
    ]
  },
  {
    key: 'startup', name: '创业', icon: '🚀', color: '#D4A574',
    prompts: [
      '35至45岁中国女性创业者，精品咖啡馆，米白色衬衫，手持咖啡杯，暖棕奶油色调，轻奢质感，杂志级人像摄影' + BASE_SUFFIX,
      '精品咖啡馆内景，奶油米白色调，阳光从落地窗斜射，花艺点缀，轻奢惬意空间摄影' + BASE_SUFFIX,
      '初夏郊外公路，两侧绿树成荫，远处山丘蓝天白云，自由希望，公路风光摄影' + BASE_SUFFIX
    ],
    texts: [
      { main: '35岁起步，40岁开花', sub: '都不算晚' },
      { main: '有胆有识', sub: '就够了' },
      { main: '管理一个家的能力', sub: '就是经营事业的本钱' }
    ]
  },
  {
    key: 'finance', name: '经济独立', icon: '💰', color: '#6B9E8F',
    prompts: [
      '35至45岁中国独立女性，极简室内，墨绿丝绒上衣，金色耳环，侧逆光，奢侈品广告质感，杂志级人像摄影' + BASE_SUFFIX,
      '奢侈品风格静物，墨绿金色配色，皮质手包与鲜花，高级灰大理石背景，商业静物摄影' + BASE_SUFFIX,
      '都市黄昏高楼玻璃幕墙外，云霞与灯光倒影，墨绿金色天际线，精英感城市摄影' + BASE_SUFFIX
    ],
    texts: [
      { main: '有钱', sub: '才有说不的底气' },
      { main: '不用开口', sub: '钱包替你说话' },
      { main: '自己赚的钱', sub: '花起来才叫自由' }
    ]
  }
];

Page({
  data: {
    themes: THEMES,
    activeTheme: '',
    activeTextIndex: -1,
    currentTexts: [],
    generatingText: false,
    generating: false,
    posterPath: '',
    cachedTexts: {},   // 缓存各主题已生成的文�?{ emotion: [...], career: [...] }
    // 客户推荐海报模式
    customerMode: false,
    customerInfo: null,
  },

  /** 页面加载：初始化 */
  onLoad(options) {
    if (options && options.customerId) {
      // 客户推荐海报模式：从 Storage 读取完整数据
      wx.setNavigationBarTitle({ title: '生成推荐海报' });
      const stored = wx.getStorageSync('pendingPosterCustomer') || {};
      const needs  = stored.needs || {};
      this.setData({
        customerMode: true,
        customerInfo: {
          id:             options.customerId,
          name:           stored.name || '',
          orderType:      needs.orderType      || '',
          salary:         needs.salary         || '',
          serviceAddress: needs.serviceAddress || '',
          onboardingTime: needs.onboardingTime || '',
          familyMembers:  needs.familyMembers  || needs.familyMemberCount || '',
          houseArea:      needs.houseArea      || '',
          workContent:    needs.workContent    || needs.jobDescription    || '',
          remarks:        needs.remarks        || needs.specialRequirements || '',
        },
      });
    } else {
      // 普通心语海报模式
      this.setData({ generatingText: true });
      this._preGenerateAllThemes();
    }
  },

  /** 每次显示页面时重新生成文案，避免反复看到同一批文案 */
  onShow() {
    // 第一次进入时 onLoad 已触发，跳过
    if (!this._hasLoaded) { this._hasLoaded = true; return; }
    // 清缓存、重置选中状态，重新拉取全部主题文案
    this.setData({
      cachedTexts: {},
      currentTexts: this.data.activeTheme
        ? (THEMES.find(t => t.key === this.data.activeTheme)?.texts || [])
        : [],
      activeTextIndex: -1,
      generatingText: true,
      posterPath: ''
    });
    this._preGenerateAllThemes();
  },

  /** 并行预生成所有主题文案，每个主题完成就立刻更新，不互相等待 */
  _preGenerateAllThemes() {
    let remaining = THEMES.length;
    const done = () => { if (--remaining === 0) this.setData({ generatingText: false }); };

    THEMES.forEach(theme => {
      this._callDoubaoTextAPI(theme.name)
        .then(texts => {
          // 立刻把该主题的 AI 文案写入缓存
          const cachedTexts = { ...this.data.cachedTexts, [theme.key]: texts };
          const update = { cachedTexts };
          // 如果用户正好在看这个主题，立刻刷新显示
          if (this.data.activeTheme === theme.key) {
            update.currentTexts = texts;
          }
          this.setData(update);
          console.log(`[海报] ${theme.name} 文案已更新:`, texts);
        })
        .catch(err => {
          // 失败不阻断，只打日志，继续用预设
          console.warn(`[海报] ${theme.name} 文案生成失败:`, err?.message || err);
        })
        .finally(done);
    });
  },

  onThemeSelect(e) {
    const key = e.currentTarget.dataset.key;
    const cached = this.data.cachedTexts[key];
    const theme  = THEMES.find(t => t.key === key);
    this.setData({
      activeTheme: key,
      // 优先用AI生成的缓存，否则用预设
      currentTexts: cached || theme.texts,
      posterPath: ''
    });
  },

  /** 手动点「AI重新生成」：只刷新当前主题 */
  async onGenerateText() {
    if (this.data.generatingText || !this.data.activeTheme) return;
    const theme = THEMES.find(t => t.key === this.data.activeTheme);
    if (!theme) return;

    this.setData({ generatingText: true, activeTextIndex: -1 });
    try {
      const texts = await this._callDoubaoTextAPI(theme.name);
      const cachedTexts = { ...this.data.cachedTexts, [theme.key]: texts };
      this.setData({ currentTexts: texts, cachedTexts });
      wx.showToast({ title: '文案已更新 ', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: '生成失败，请重试', icon: 'none' });
    } finally {
      this.setData({ generatingText: false });
    }
  },

  onTextSelect(e) {
    this.setData({ activeTextIndex: e.currentTarget.dataset.index, posterPath: '' });
  },

  async onGenerate() {
    if (this.data.generating || this.data.activeTextIndex < 0) return;
    const theme = THEMES.find(t => t.key === this.data.activeTheme);
    if (!theme) return wx.showToast({ title: '请先选择主题', icon: 'none' });

    this.setData({ generating: true });
    wx.showLoading({ title: '海报生成中...', mask: true });

    try {
      const textObj = this.data.currentTexts[this.data.activeTextIndex];

      // 自动复制文案到剪贴板，格式：【褓贝心语】：主句，副句
      const copyText = `【褓贝心语】：${textObj.main}，${textObj.sub}`;
      wx.setClipboardData({ data: copyText, success: () => {} });

      // ① QR + Logo 立刻开始（不等视觉描述），与后续步骤并行
      const qrLogoPromise = Promise.all([
        this._getHomeMiniCodePath(),
        this._getLogoPath()
      ]);

      // ② 同时生成与文案关联的视觉描述
      let imagePrompt;
      try {
        const visualDesc = await this._generateImagePromptFromText(
          textObj.main, textObj.sub, theme.name
        );
        imagePrompt = visualDesc + BASE_SUFFIX;
        console.log('[海报] prompt:', imagePrompt);
      } catch (err) {
        console.warn('[海报] 视觉描述失败，退回预设:', err?.message);
        const pool = theme.prompts;
        imagePrompt = pool[Math.floor(Math.random() * pool.length)];
      }

      // ③ 图片生成 与 QR/Logo等待 并行
      const [bgUrl, [qrPath, logoLocalPath]] = await Promise.all([
        this._callDoubaoAPI(imagePrompt),
        qrLogoPromise
      ]);
      const localPath  = await this._downloadImage(bgUrl);
      const posterPath = await this._renderCanvas(localPath, qrPath, logoLocalPath, textObj);

      this.setData({ posterPath });
      wx.hideLoading();

      // 调起微信原生分享图片弹窗（与简历分享一样的浮窗样式）
      wx.showShareImageMenu({
        path: posterPath,
        fail: () => {
          // 降级：直接保存相册
          wx.saveImageToPhotosAlbum({
            filePath: posterPath,
            success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
            fail:    () => wx.showToast({ title: '请长按图片保存', icon: 'none' })
          });
        }
      });
    } catch (err) {
      console.error('生成失败', err);
      wx.hideLoading();
      wx.showToast({ title: err.message || '生成失败，请重试', icon: 'none' });
    } finally {
      this.setData({ generating: false });
    }
  },

  /** 调用豆包文案模型（doubao-seed-2-0-mini）*/
  _callDoubaoTextAPI(themeName) {
    // 每次随机选一种写作视角，让文案风格更多样
    const angles = [
      '用诗意比喻，意象鲜明',
      '用口语化表达，亲切自然',
      '用反问句式，引发共鸣',
      '用递进句式，层层推进力量',
      '用对比手法，突出转变'
    ];
    const angle = angles[Math.floor(Math.random() * angles.length)];
    const prompt = `你是专为中年女性写心灵激励文案的创作者。目标读者：35-50岁普通女性，经历过生活的起伏，渴望被看见、被鼓励，正在努力活出自己。请为「${themeName}」主题生成3条文案，每条包含：
- 主句：不超过12字，有力量感，不说教，像朋友说的话，能触动人心（写作风格：${angle}）
- 副句：不超过18字，温柔呼应主句，给人温暖和勇气
严格按以下格式输出，不要序号、不要解释：
主句1|副句1
主句2|副句2
主句3|副句3`;
    return new Promise((resolve, reject) => {
      wx.request({
        url: DOUBAO_TXT_URL,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DOUBAO_API_KEY}`
        },
        data: {
          model: DOUBAO_TXT_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.9,
          max_tokens: 200,
          thinking: { type: 'disabled' }  // 关闭推理链，直接输出，速度提升 5~10倍
        },
        success(res) {
          // chat/completions 标准格式
          const raw = res.data?.choices?.[0]?.message?.content || '';
          if (!raw) return reject(new Error(`未返回内容，状态码:${res.statusCode}`));

          const texts = raw.trim().split('\n')
            .map(l => l.trim())
            .filter(l => l.includes('|'))
            .map(l => {
              const [main, sub] = l.split('|');
              return { main: (main || '').trim(), sub: (sub || '').trim() };
            })
            .filter(t => t.main && t.sub)
            .slice(0, 3);

          texts.length ? resolve(texts) : reject(new Error('文案解析失败'));
        },
        fail(err) { reject(new Error(err.errMsg || '网络请求失败')); }
      });
    });
  },

  /**
   * 根据文案生成视觉场景描述（用于驱动图片生成）
   * 输入：主句 + 副句 + 主题名
   * 输出：一段与文案情绪/意境匹配的画面描述（中文，≤60字）
   */
  _generateImagePromptFromText(main, sub, themeName) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: DOUBAO_TXT_URL,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DOUBAO_API_KEY}`
        },
        data: {
          model: DOUBAO_TXT_MODEL,
          messages: [{
            role: 'user',
            content: `你是专业图片创意总监，擅长把文字转化为摄影画面描述。
根据以下女性激励金句，生成一段适合作为海报背景图的画面描述。
金句：「${main}，${sub}」
主题分类：${themeName}
要求：
- 只输出画面描述，不超过60字，不要解释
- 场景与金句情绪匹配（可以是人物/风景/空间/静物）
- 人物要求：若有人物，须为东方女性，真实肤色，情绪自然
- 画面中绝对不能有任何文字、字母、符号、水印`
          }],
          temperature: 0.85,
          max_tokens: 120,
          thinking: { type: 'disabled' }  // 关闭推理链，视觉描述无需思考过程
        },
        success(res) {
          const desc = res.data?.choices?.[0]?.message?.content?.trim() || '';
          console.log('[海报] 视觉描述:', desc);
          desc ? resolve(desc) : reject(new Error('未生成视觉描述'));
        },
        fail(err) { reject(new Error(err.errMsg || '请求失败')); }
      });
    });
  },

  /** 调用豆包文生图 API */
  _callDoubaoAPI(prompt) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: DOUBAO_IMG_URL,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DOUBAO_API_KEY}`
        },
        data: {
          model: DOUBAO_IMG_MODEL,
          prompt,
          response_format: 'url',
          size: '2k',
          watermark: false,
          seed: Math.floor(Math.random() * 2147483647) // 每次随机seed，避免重复图
        },
        success(res) {
          console.log('图片API响应:', JSON.stringify(res.data));
          const url = res.data?.data?.[0]?.url;
          url ? resolve(url) : reject(new Error('API未返回图片，错误：' + JSON.stringify(res.data)));
        },
        fail(err) { reject(new Error(err.errMsg || '网络请求失败')); }
      });
    });
  },

  /** 下载图片到本地临时路�?*/
  _downloadImage(url) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        success(res) {
          res.statusCode === 200 ? resolve(res.tempFilePath) : reject(new Error('下载图片失败'));
        },
        fail(err) { reject(new Error(err.errMsg || '下载失败')); }
      });
    });
  },

  /** 下载品牌 Logo（缓存本地路径，同一会话只下载一次）*/
  async _getLogoPath() {
    if (_logoPathCache) return _logoPathCache;
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [POSTER_LOGO_FILE_ID] });
      const url = res?.fileList?.[0]?.tempFileURL;
      if (!url) throw new Error('未获取到临时URL');
      _logoPathCache = await this._downloadImage(url);
      return _logoPathCache;
    } catch (err) {
      console.warn('获取Logo失败:', err?.message || err);
      return '';
    }
  },

  /** 获取推荐人注册页小程序码本地路径（按员工+客户 key 缓存，不同客户海报各自独立）*/
  async _getReferrerRegisterMiniCodePath(staffId, staffPhone, customerId, staffOpenid) {
    const cacheKey = (staffId || '') + '|' + (staffPhone || '') + '|' + (customerId || '') + '|' + (staffOpenid || '');
    if (_referrerQrCache && _referrerQrCacheKey === cacheKey) return _referrerQrCache;
    try {
      const cfRes = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'getReferrerRegisterMiniCode', staffId: staffId || '', staffPhone: staffPhone || '', customerId: customerId || '', staffOpenid: staffOpenid || '' }
      });
      const fileID = cfRes?.result?.fileID;
      if (!fileID) return '';
      const tempRes = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const tempUrl = tempRes?.fileList?.[0]?.tempFileURL || '';
      if (!tempUrl) return '';
      _referrerQrCache    = await this._downloadImage(tempUrl);
      _referrerQrCacheKey = cacheKey;
      return _referrerQrCache;
    } catch (err) {
      console.error('获取推荐注册小程序码失败:', err);
      wx.showToast({ title: '二维码生成失败，请先发布小程序正式版', icon: 'none', duration: 3000 });
      return '';
    }
  },

  /** 获取首页小程序码本地路径（缓存，同一会话只下载一次）*/
  async _getHomeMiniCodePath() {
    if (_qrPathCache) return _qrPathCache;
    try {
      const cfRes = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'getHomeMiniCode' }
      });
      const fileID = cfRes?.result?.fileID;
      if (!fileID) return '';
      const tempRes = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const tempUrl = tempRes?.fileList?.[0]?.tempFileURL || '';
      if (!tempUrl) return '';
      _qrPathCache = await this._downloadImage(tempUrl);
      return _qrPathCache;
    } catch (err) {
      console.warn('获取首页小程序码失败，跳过二维码:', err);
      return '';
    }
  },

  /** Canvas 合成海报（与简历海报相同结构） */
  _renderCanvas(localPath, qrLocalPath, logoLocalPath, textObj) {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery().in(this);
      query.select('#poster-canvas').fields({ node: true, size: true }).exec(async (res) => {
        const canvas = res[0]?.node;
        if (!canvas) return reject(new Error('Canvas 未找到'));

        // DPR 高清处理
        const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        try {
          // textObj 由调用方传入，确保与用户选中的文案一致

          // 圆角矩形辅助（与简历一致）
          const roundRectPath = (x, y, w, h, r) => {
            ctx.beginPath();
            ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
            ctx.arcTo(x+w,y, x+w,y+r, r); ctx.lineTo(x+w,y+h-r);
            ctx.arcTo(x+w,y+h, x+w-r,y+h, r); ctx.lineTo(x+r,y+h);
            ctx.arcTo(x,y+h, x,y+h-r, r); ctx.lineTo(x,y+r);
            ctx.arcTo(x,y, x+r,y, r); ctx.closePath();
          };

          // ── Layer 1: 深色背景兜底 ──
          ctx.fillStyle = '#0f051e';
          ctx.fillRect(0, 0, W, H);

          // -- Layer 2: AI图 cover 模式，人脸偏上 --
          const bgImg = canvas.createImage();
          bgImg.src = localPath;
          await new Promise(r => { bgImg.onload = r; bgImg.onerror = r; });
          const sc = Math.max(W / bgImg.width, H / bgImg.height);
          ctx.drawImage(bgImg, (W - bgImg.width*sc)/2, Math.min(0,(H - bgImg.height*sc)*0.15), bgImg.width*sc, bgImg.height*sc);

          // ── Layer 3: 中部+底部渐变遮罩（扩展到图片中间保证文字可读）──
          const grad = ctx.createLinearGradient(0, H * 0.25, 0, H);
          grad.addColorStop(0,    'rgba(15,5,30,0)');
          grad.addColorStop(0.3,  'rgba(15,5,30,0.45)');
          grad.addColorStop(0.65, 'rgba(15,5,30,0.82)');
          grad.addColorStop(1,    'rgba(15,5,30,0.97)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, W, H);

          // ── Layer 3.5: 左上角日期 ──
          const now = new Date();
          const month   = now.getMonth() + 1;
          const day     = now.getDate();
          const weekMap = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
          const weekStr = weekMap[now.getDay()];
          const dateStr = `${month}月${day}日`;

          ctx.save();
          ctx.shadowColor   = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur    = 6;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 1;
          ctx.fillStyle    = '#ffffff';
          ctx.textBaseline = 'top';
          ctx.textAlign    = 'left';
          ctx.font = '15px "STXingkai", "华文行楷", "STKaiti", "KaiTi", serif';
          ctx.fillText(`${dateStr}  ${weekStr}`, 14, 20);
          ctx.restore();

          // ── Layer 4: 文案区（整图垂直居中，高级排版） ──
          const Y_SEP = 532;
          const QW = 72, QH = 72;
          const QX = W - QW - 16;
          const QY = Y_SEP + (H - Y_SEP - QH - 16) / 2;

          // 华文行楷（STXingkai）：飘逸书法感，杂志封面首选
          const fontSize    = 28;
          const charSpacing = 3;
          const safeW       = W - 20;   // 两侧各 10px 安全距离
          const fontFamily  = '"STXingkai", "华文行楷", "STKaiti", "KaiTi", serif';
          ctx.font = `bold ${fontSize}px ${fontFamily}`;

          // 辅助：带字符间距测量总宽
          const measureLine = (text) =>
            text.split('').reduce((w, ch) => w + ctx.measureText(ch).width + charSpacing, 0) - charSpacing;

          // ── 自适应行数：能一行就一行，否则拆成两行（最多两行）──
          const fullOneLine = textObj.main + ' ' + textObj.sub;
          const lines = measureLine(fullOneLine) <= safeW
            ? [fullOneLine]
            : [textObj.main, textObj.sub];

          // ── 动态字号：若最宽行仍超出安全宽度则等比缩小 ──
          const maxLineW = Math.max(...lines.map(l => measureLine(l)));
          let dynFontSize = fontSize;
          if (maxLineW > safeW) {
            dynFontSize = Math.floor(fontSize * safeW / maxLineW);
            ctx.font = `bold ${dynFontSize}px ${fontFamily}`;
          }
          const lineH = dynFontSize * 2.4;

          // 辅助：居中绘制一行（带字符间距）
          const fillLineCenter = (text, y) => {
            const totalW = measureLine(text);
            let x = (W - totalW) / 2;
            text.split('').forEach(ch => {
              ctx.fillText(ch, x, y);
              x += ctx.measureText(ch).width + charSpacing;
            });
          };

          const totalH = lines.length * lineH;
          const textAreaCenter = H / 2;
          let textY = textAreaCenter - totalH / 2;

          // 文字上方金色装饰短线
          const decorWidth = 24;
          ctx.strokeStyle = '#C8A96E';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo((W - decorWidth) / 2, textY - 20);
          ctx.lineTo((W + decorWidth) / 2, textY - 20);
          ctx.stroke();

          // 绘制文字：米白色 + 柔和阴影
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 16;
          ctx.shadowOffsetY = 2;
          ctx.fillStyle = '#FAF6EE';  // 温润米白，不刺眼
          ctx.textBaseline = 'top';

          lines.forEach(line => {
            fillLineCenter(line, textY);
            textY += lineH;
          });

          // 恢复上下文状态
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.textAlign = 'left';

          // ── Layer 5: 底部品牌栏（与简历完全一致）──
          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(16, Y_SEP); ctx.lineTo(W-16, Y_SEP); ctx.stroke();

          // 左侧 slogan（金色斜体，与简历一致）改为 "为爱，全力以赴"
          const sloganCX = (QX - 8) / 2;
          const sloganCY = Y_SEP + (H - Y_SEP) / 2;
          ctx.fillStyle = '#C8A96E';
          ctx.font = 'italic bold 20px "PingFang SC", Georgia, serif';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          ctx.fillText('为爱，全力以赴', sloganCX, sloganCY);
          ctx.textAlign = 'left';

          // ── Layer 6: 二维码圆角白卡（与简历完全一致）──
          roundRectPath(QX, QY, QW, QH, 8);
          ctx.fillStyle = '#ffffff'; ctx.fill();

          if (qrLocalPath) {
            const qrImg = canvas.createImage();
            qrImg.src = qrLocalPath;
            await new Promise(r => { qrImg.onload = r; qrImg.onerror = r; });
            ctx.save();
            roundRectPath(QX+5, QY+5, QW-10, QH-10, 4);
            ctx.clip();
            ctx.drawImage(qrImg, QX+5, QY+5, QW-10, QH-10);
            ctx.restore();
          }

          // QR 下方说明文字
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('扫码我也生成', QX + QW/2, QY + QH + 11);
          ctx.textAlign = 'left';

          // ── Layer 7: 右上角 Logo（白色光晕，无底板）──
          if (logoLocalPath) {
            const logoImg = canvas.createImage();
            logoImg.src = logoLocalPath;
            await new Promise(r => { logoImg.onload = r; logoImg.onerror = r; });
            const logoSize = 78;
            const logoX = W - logoSize - 10;
            const logoY = 10;
            ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
          }

          // ── 导出 ──
          wx.canvasToTempFilePath({
            canvas, fileType: 'jpg', quality: 0.95,
            success: r => resolve(r.tempFilePath),
            fail: err => reject(new Error(err.errMsg || '导出失败'))
          });
        } catch (err) { reject(err); }
      });
    });
  },

  /** 按最大宽度拆分文字为行数组 */
  _splitLines(ctx, text, maxWidth) {
    const chars = text.split('');
    const lines = [];
    let line = '';
    for (const ch of chars) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else { line = test; }
    }
    if (line) lines.push(line);
    return lines;
  },

  /** 客户模式：一键生成推荐海报（员工头像铺底 + 客户需求信息卡） */
  async onGenerateCustomerPoster() {
    if (this.data.generating) return;
    this.setData({ generating: true });
    wx.showLoading({ title: '海报生成中...', mask: true });
    try {
      const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
      const avatarUrl   = crmUserInfo.crmAvatar || crmUserInfo.avatarUrl || '';
      const staffName   = crmUserInfo.crmName   || crmUserInfo.nickname  || '';
      const staffPhone  = crmUserInfo.phone      || '';
      const staffId     = String(crmUserInfo._id || crmUserInfo.id || crmUserInfo.userId || '');
      // 小程序端 crmUserInfo._id 是 miniprogram_users._id，不是 staff._id，作为匹配 token 不可靠
      // 另外多带 openid，CRM 端按 phone / openid 任一命中即可定位 staff
      const staffOpenid = crmUserInfo.openid || crmUserInfo._openid || '';
      const customerId  = (this.data.customerInfo && this.data.customerInfo.id) || '';
      // 写入 staff_profiles，确保推荐人扫码注册后 getReferralDetail 能查到归属人姓名
      if ((staffId || staffPhone) && (staffName || staffPhone)) {
        wx.cloud.callFunction({
          name: 'userService',
          data: { action: 'saveStaffProfile', staffId, name: staffName, phone: staffPhone, avatar: avatarUrl, company: '安得褓贝' },
        }).catch(err => console.warn('[poster] saveStaffProfile 失败(不影响海报生成):', err));
      }

      const [avatarPath, qrPath, logoPath] = await Promise.all([
        avatarUrl ? this._downloadImage(avatarUrl) : Promise.resolve(''),
        this._getReferrerRegisterMiniCodePath(staffId, staffPhone, customerId, staffOpenid),
        this._getLogoPath(),
      ]);
      const posterPath = await this._renderCustomerCanvas(
        avatarPath, qrPath, logoPath, this.data.customerInfo, staffName, staffPhone
      );
      this.setData({ posterPath });
      wx.hideLoading();
      wx.showShareImageMenu({
        path: posterPath,
        fail: () => wx.saveImageToPhotosAlbum({
          filePath: posterPath,
          success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
          fail:    () => wx.showToast({ title: '请长按图片保存', icon: 'none' })
        })
      });
    } catch (err) {
      console.error('生成客户海报失败:', err);
      wx.hideLoading();
      wx.showToast({ title: err.message || '生成失败，请重试', icon: 'none' });
    } finally {
      this.setData({ generating: false });
    }
  },

  /** 客户推荐海报 Canvas
   *  短字段(≤3行)→单列横排；(>3行)→双列网格
   *  长字段(工作内容/需求备注)→全宽行追加在下方
   */
  _renderCustomerCanvas(avatarLocalPath, qrLocalPath, logoLocalPath, info, staffName, staffPhone) {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery().in(this);
      query.select('#poster-canvas').fields({ node: true, size: true }).exec(async (res) => {
        const canvas = res[0]?.node;
        if (!canvas) return reject(new Error('Canvas 未找到'));
        const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
        canvas.width = W * dpr; canvas.height = H * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        try {
          // ── 工具 ──
          const rrp = (x, y, w, h, r) => {
            ctx.beginPath();
            ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
            ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
            ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
            ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
            ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
          };
          const cut = (s, n) => (!s ? '' : s.length > n ? s.slice(0, n-1)+'…' : s);

          // ── L1 背景 ──
          ctx.fillStyle = '#0f051e'; ctx.fillRect(0, 0, W, H);

          // ── L2 头像 cover ──
          if (avatarLocalPath) {
            const av = canvas.createImage(); av.src = avatarLocalPath;
            await new Promise(r => { av.onload = r; av.onerror = r; });
            const sc = Math.max(W/av.width, H/av.height);
            ctx.drawImage(av, (W-av.width*sc)/2, Math.min(0,(H-av.height*sc)*0.1), av.width*sc, av.height*sc);
          }

          // ── L3 渐变遮罩 ──
          const gr = ctx.createLinearGradient(0, 0, 0, H);
          gr.addColorStop(0,    'rgba(15,5,30,0.1)');
          gr.addColorStop(0.25, 'rgba(15,5,30,0.5)');
          gr.addColorStop(0.5,  'rgba(15,5,30,0.8)');
          gr.addColorStop(1,    'rgba(15,5,30,0.97)');
          ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);

          // L4: 左上品牌文字已移除

          // ── L5 信息卡 ──
          // 短字段（可双列）
          const shortRows = [];
          if (info.orderType)      shortRows.push({ key:'服务类型', val: cut(info.orderType,10),      color:'#FAF6EE' });
          if (info.salary)         shortRows.push({ key:'期望薪资', val:`¥${info.salary}/月`,          color:'#C8A0FF' });
          if (info.familyMembers)  shortRows.push({ key:'家庭成员', val:`${info.familyMembers}人`,     color:'#FAF6EE' });
          if (info.houseArea)      shortRows.push({ key:'房屋面积', val:`${info.houseArea}㎡`,         color:'#FAF6EE' });
          if (info.serviceAddress) shortRows.push({ key:'服务地址', val: cut(info.serviceAddress,10),  color:'#FAF6EE' });
          if (info.onboardingTime) shortRows.push({ key:'上户时间', val: cut(info.onboardingTime,10),  color:'#FAF6EE' });
          // 长字段（全宽，自动换行）
          const fullRowsSrc = [];
          if (info.workContent) fullRowsSrc.push({ key:'工作内容', val: info.workContent, color:'#FAF6EE' });
          if (info.remarks)     fullRowsSrc.push({ key:'需求备注', val: info.remarks,     color:'#FCA5A5' });

          const TWO_COL   = shortRows.length > 3;
          const HDR_H     = 42;
          const CELL_H    = 62;
          const S_ROW_H   = 52;
          const PAD_B     = 16;
          const CARD_X    = 18, CARD_W = W - 36;

          // 换行辅助：按像素宽度切分
          const F_FONT    = '15px "PingFang SC",sans-serif';
          const F_LINE_H  = 22;  // 每行文字高
          const F_LABEL_H = 20;  // 标签行高
          const F_PAD_V   = 14;  // 每个长字段的上下内边距合计
          const maxTextW  = CARD_W - 32;
          const wrapText  = (text) => {
            ctx.font = F_FONT;
            const lines = []; let line = '';
            for (const ch of String(text || '').split('')) {
              const test = line + ch;
              if (ctx.measureText(test).width > maxTextW && line.length > 0) {
                lines.push(line); line = ch;
              } else { line = test; }
            }
            if (line) lines.push(line);
            return lines;
          };

          // 预算每个长字段高度
          const fullRows = fullRowsSrc.map(row => {
            const lines = wrapText(row.val);
            return { ...row, lines, rowH: F_PAD_V + F_LABEL_H + lines.length * F_LINE_H };
          });

          const gridRows  = TWO_COL ? Math.ceil(shortRows.length / 2) : shortRows.length;
          const shortH    = TWO_COL ? gridRows * CELL_H : gridRows * S_ROW_H;
          const sepH      = fullRows.length > 0 ? 8 : 0;
          const fullH     = fullRows.reduce((s, r) => s + r.rowH, 0);
          const CARD_H    = HDR_H + shortH + sepH + fullH + PAD_B;

          // 在安全区 [22, 518] 内垂直居中（左上角文字已去掉，顶部留白缩小）
          const CARD_Y    = Math.round((22 + 518 - CARD_H) / 2);

          // 卡片背景
          rrp(CARD_X, CARD_Y, CARD_W, CARD_H, 16);
          ctx.fillStyle = 'rgba(255,255,255,0.11)'; ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.8; ctx.stroke();

          // 卡片标题
          ctx.fillStyle = '#C8A96E';
          ctx.font = 'bold 18px "PingFang SC",sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText('客户服务需求', CARD_X + 16, CARD_Y + HDR_H / 2);
          ctx.strokeStyle = 'rgba(200,169,110,0.35)'; ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(CARD_X+16, CARD_Y+HDR_H-1);
          ctx.lineTo(CARD_X+CARD_W-16, CARD_Y+HDR_H-1);
          ctx.stroke();

          // ── 短字段区域 ──
          if (TWO_COL) {
            const COL0_X = CARD_X + 16;
            const COL1_X = CARD_X + 16 + (CARD_W - 32) / 2 + 4;
            // 水平分割线
            for (let r = 1; r < gridRows; r++) {
              const ly = CARD_Y + HDR_H + r * CELL_H;
              ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.4;
              ctx.beginPath(); ctx.moveTo(CARD_X+14,ly); ctx.lineTo(CARD_X+CARD_W-14,ly); ctx.stroke();
            }
            // 竖向分割线
            const vx = CARD_X + CARD_W / 2;
            ctx.beginPath(); ctx.moveTo(vx, CARD_Y+HDR_H+4); ctx.lineTo(vx, CARD_Y+HDR_H+shortH-4); ctx.stroke();
            shortRows.forEach((row, i) => {
              const cellX = (i%2===0) ? COL0_X : COL1_X;
              const cellY = CARD_Y + HDR_H + Math.floor(i/2) * CELL_H;
              ctx.fillStyle = 'rgba(255,255,255,0.45)';
              ctx.font = '14px "PingFang SC",sans-serif';
              ctx.textAlign = 'left'; ctx.textBaseline = 'top';
              ctx.fillText(row.key, cellX, cellY + 8);
              ctx.fillStyle = row.color;
              ctx.font = 'bold 19px "PingFang SC",sans-serif';
              ctx.textBaseline = 'bottom';
              ctx.fillText(row.val, cellX, cellY + CELL_H - 8);
            });
          } else {
            shortRows.forEach((row, i) => {
              const midY = CARD_Y + HDR_H + i * S_ROW_H + S_ROW_H / 2;
              if (i > 0) {
                ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.4;
                ctx.beginPath(); ctx.moveTo(CARD_X+16,CARD_Y+HDR_H+i*S_ROW_H); ctx.lineTo(CARD_X+CARD_W-16,CARD_Y+HDR_H+i*S_ROW_H); ctx.stroke();
              }
              ctx.fillStyle = 'rgba(255,255,255,0.45)';
              ctx.font = '15px "PingFang SC",sans-serif';
              ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
              ctx.fillText(row.key, CARD_X+16, midY);
              ctx.fillStyle = row.color;
              ctx.font = 'bold 20px "PingFang SC",sans-serif';
              ctx.textAlign = 'right';
              ctx.fillText(row.val, CARD_X+CARD_W-16, midY);
            });
          }

          // ── 长字段区域（全宽，自动换行）──
          if (fullRows.length > 0) {
            const sepY = CARD_Y + HDR_H + shortH + sepH / 2;
            ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(CARD_X+14, sepY); ctx.lineTo(CARD_X+CARD_W-14, sepY); ctx.stroke();

            let curY = CARD_Y + HDR_H + shortH + sepH;
            fullRows.forEach((row, i) => {
              if (i > 0) {
                ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.4;
                ctx.beginPath(); ctx.moveTo(CARD_X+16, curY); ctx.lineTo(CARD_X+CARD_W-16, curY); ctx.stroke();
              }
              // 标签
              ctx.fillStyle = 'rgba(255,255,255,0.4)';
              ctx.font = '13px "PingFang SC",sans-serif';
              ctx.textAlign = 'left'; ctx.textBaseline = 'top';
              ctx.fillText(row.key, CARD_X+16, curY + 7);
              // 换行文字
              ctx.fillStyle = row.color;
              ctx.font = F_FONT;
              row.lines.forEach((line, li) => {
                ctx.fillText(line, CARD_X+16, curY + F_LABEL_H + li * F_LINE_H + 4);
              });
              curY += row.rowH;
            });
          }
          ctx.textAlign = 'left';

          // 卡片下方提示
          ctx.fillStyle = 'rgba(255,255,255,0.32)';
          ctx.font = '11px "PingFang SC",sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText('有合适该订单的阿姨辛苦向我推荐', W/2, CARD_Y+CARD_H+11);

          // ── L6 底部分割线 ──
          const Y_SEP = 532;

          // 卡片与分割线之间：推荐奖金文案（宽度与卡片对齐，贴分割线上方10px）
          ctx.fillStyle = '#C8A96E';
          ctx.font = 'bold 29px "PingFang SC",sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
          const _tipText = '推荐阿姨签单赚推荐奖金';
          const _tipW = ctx.measureText(_tipText).width;
          ctx.save();
          ctx.translate(CARD_X, Y_SEP - 10);
          ctx.scale(CARD_W / _tipW, 1);
          ctx.fillText(_tipText, 0, 0);
          ctx.restore();
          ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(16, Y_SEP); ctx.lineTo(W-16, Y_SEP); ctx.stroke();

          // ── L7 QR 码 ──
          const QW=72, QH=72, QX=W-QW-16, QY=Y_SEP+(H-Y_SEP-QH-16)/2;
          rrp(QX,QY,QW,QH,8); ctx.fillStyle='#fff'; ctx.fill();
          if (qrLocalPath) {
            const qr=canvas.createImage(); qr.src=qrLocalPath;
            await new Promise(r=>{qr.onload=r;qr.onerror=r;});
            ctx.save(); rrp(QX+5,QY+5,QW-10,QH-10,4); ctx.clip();
            ctx.drawImage(qr,QX+5,QY+5,QW-10,QH-10); ctx.restore();
          }
          ctx.fillStyle='rgba(255,255,255,0.45)'; ctx.font='10px sans-serif';
          ctx.textAlign='center'; ctx.fillText('扫码推荐阿姨', QX+QW/2, QY+QH+14);

          // ── L8 返费文案 + 联系人信息 ──
          const parseSal = s => {
            const c = String(s||'').replace(/[^\d\-]/g,'');
            if (c.includes('-')) { const p=c.split('-').map(Number).filter(n=>n>0); return p.length>=2?(p[0]+p[1])/2:p[0]||0; }
            return parseInt(c,10)||0;
          };
          const rebate = Math.round(parseSal(info.salary)*0.1);
          ctx.textBaseline='middle';
          const _rebateCX   = (QX-8)/2;
          const _rebateY    = Y_SEP + (H-Y_SEP)*0.36;   // 上移，给联系人留空间
          const _contactY   = Y_SEP + (H-Y_SEP)*0.72;   // 联系人信息行
          ctx.font='bold 21px "PingFang SC",Georgia,serif';
          if (rebate) {
            const _pre = '本单预计返费', _num = String(rebate), _suf = '元';
            const _pw = ctx.measureText(_pre).width;
            const _nw = ctx.measureText(_num).width;
            const _sw = ctx.measureText(_suf).width;
            let _tx = _rebateCX - (_pw+_nw+_sw)/2;
            ctx.textAlign='left';
            ctx.fillStyle='#C8A96E'; ctx.fillText(_pre, _tx, _rebateY); _tx+=_pw;
            ctx.fillStyle='#FF6B35'; ctx.fillText(_num, _tx, _rebateY); _tx+=_nw;
            ctx.fillStyle='#C8A96E'; ctx.fillText(_suf, _tx, _rebateY);
          } else {
            ctx.fillStyle='#C8A96E'; ctx.textAlign='center';
            ctx.fillText('为爱，全力以赴', _rebateCX, _rebateY);
          }
          // 联系人姓名 + 电话
          if (staffName || staffPhone) {
            const _contact = [
              staffName  ? `联系人：${staffName}` : '',
              staffPhone ? `电话：${staffPhone}`  : '',
            ].filter(Boolean).join('，');
            ctx.font = '12px "PingFang SC",sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.textAlign = 'center';
            ctx.fillText(_contact, _rebateCX, _contactY);
          }

          // ── L9 Logo 右上角 ──
          if (logoLocalPath) {
            const logo=canvas.createImage(); logo.src=logoLocalPath;
            await new Promise(r=>{logo.onload=r;logo.onerror=r;});
            ctx.drawImage(logo, W-88, 10, 78, 78);
          }

          wx.canvasToTempFilePath({
            canvas, fileType:'jpg', quality:0.95,
            success:r=>resolve(r.tempFilePath),
            fail:err=>reject(new Error(err.errMsg||'导出失败'))
          });
        } catch(err){reject(err);}
      });
    });
  },

  // 点击缩略图再次唤起分享浮窗
  onShowShare() {
    const path = this.data.posterPath;
    if (!path) return;
    wx.showShareImageMenu({
      path,
      fail: () => wx.saveImageToPhotosAlbum({
        filePath: path,
        success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
        fail:    () => wx.showToast({ title: '请长按图片保存', icon: 'none' })
      })
    });
  },

  onShareAppMessage() {
    return {
      title: '送你一句女性力量语录 ',
      imageUrl: this.data.posterPath || ''
    };
  }
});
