const sharerUtils = require('../../utils/sharerUtils.js');

const W = 375, H = 640;
const POSTER_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得褓贝定稿.png';

// 海报视觉风格（与品牌色保持一致：紫金 / 暖暮 / 墨绿）
const STYLES = [
  { key: 'royal',   name: '紫金尊享', accent: '#C8A96E',
    gradient: 'linear-gradient(135deg,#1a0a2e 0%,#3b1d6e 55%,#8766F3 100%)',
    stops: [
      { p: 0,    c: '#1a0a2e' },
      { p: 0.55, c: '#3b1d6e' },
      { p: 1,    c: '#8766F3' },
    ],
  },
  { key: 'amber',   name: '暖暮金辉', accent: '#FFD089',
    gradient: 'linear-gradient(135deg,#2a1610 0%,#7a3a1f 55%,#E08A4B 100%)',
    stops: [
      { p: 0,    c: '#2a1610' },
      { p: 0.55, c: '#7a3a1f' },
      { p: 1,    c: '#E08A4B' },
    ],
  },
  { key: 'forest',  name: '墨绿沉稳', accent: '#9FE1C9',
    gradient: 'linear-gradient(135deg,#0d2a22 0%,#1f5446 55%,#3aa085 100%)',
    stops: [
      { p: 0,    c: '#0d2a22' },
      { p: 0.55, c: '#1f5446' },
      { p: 1,    c: '#3aa085' },
    ],
  },
];

let _logoPathCache = '';
let _qrPathCache = '';
let _qrPathCacheKey = '';

Page({
  data: {
    activeStyle: 'royal',
    summary: null,    // { name, jobTypeLabel, totalScore, level, salaryMin, salaryMax, salaryUnit, marketComparison, sectionScores }
    sharerInfo: null, // 当前员工分享身份（生成 QR 用）
    generating: true, // 进入页面即开始生成
    posterPath: '',
  },

  onLoad() {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    // 海报数据由 result 页通过 storage 传递
    const stored = wx.getStorageSync('pendingAssessmentPoster') || null;
    if (!stored || !stored.summary) {
      wx.showToast({ title: '数据缺失，请从结果页进入', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    this.setData({
      summary: stored.summary,
      sharerInfo: sharerUtils.getCurrentStaffSharer(),
    });
  },

  onReady() {
    // Canvas 节点已就绪，自动生成
    if (this.data.summary) this._generate();
  },

  async _generate() {
    if (!this.data.summary) return;
    this.setData({ generating: true });
    try {
      const sharer = this.data.sharerInfo || sharerUtils.getCurrentStaffSharer();
      const [qrPath, logoPath] = await Promise.all([
        this._getAssessmentMiniCodePath(sharer),
        this._getLogoPath(),
      ]);
      const posterPath = await this._renderCanvas(qrPath, logoPath);
      this.setData({ posterPath, generating: false });
      // 生成后自动唤起分享菜单
      wx.showShareImageMenu({ path: posterPath, fail: () => {} });
    } catch (err) {
      console.error('[salaryAssessmentPoster] 生成失败:', err);
      this.setData({ generating: false });
      wx.showToast({ title: err.message || '生成失败，请重试', icon: 'none' });
    }
  },

  onShowShare() {
    const path = this.data.posterPath;
    if (!path) return;
    wx.showShareImageMenu({ path, fail: () => {} });
  },

  onSaveAlbum() {
    const path = this.data.posterPath;
    if (!path) return;
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail:    () => wx.showToast({ title: '请长按图片保存', icon: 'none' }),
    });
  },

  // ── 资源获取 ─────────────────────────────────────────────────
  async _getLogoPath() {
    if (_logoPathCache) return _logoPathCache;
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [POSTER_LOGO_FILE_ID] });
      const url = res?.fileList?.[0]?.tempFileURL;
      if (!url) return '';
      _logoPathCache = await this._downloadImage(url);
      return _logoPathCache;
    } catch (err) { return ''; }
  },

  async _getAssessmentMiniCodePath(sharer) {
    const key = (sharer?.id || '') + '|' + (sharer?.phone || '') + '|' + (sharer?.openid || '');
    if (_qrPathCache && _qrPathCacheKey === key) return _qrPathCache;
    try {
      const cfRes = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'getSalaryAssessmentMiniCode',
          staffId:     sharer?.id     || '',
          staffPhone:  sharer?.phone  || '',
          staffOpenid: sharer?.openid || '',
        },
      });
      const fileID = cfRes?.result?.fileID;
      if (!fileID) return '';
      const tempRes = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const tempUrl = tempRes?.fileList?.[0]?.tempFileURL || '';
      if (!tempUrl) return '';
      _qrPathCache = await this._downloadImage(tempUrl);
      _qrPathCacheKey = key;
      return _qrPathCache;
    } catch (err) {
      console.warn('[salaryAssessmentPoster] 获取小程序码失败:', err);
      wx.showToast({ title: '二维码生成失败，请先发布正式版', icon: 'none', duration: 2500 });
      return '';
    }
  },

  _downloadImage(url) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        success: r => r.statusCode === 200 ? resolve(r.tempFilePath) : reject(new Error('下载失败')),
        fail:    err => reject(new Error(err.errMsg || '下载失败')),
      });
    });
  },

  // ── Canvas 合成（杂志封面风格：渐变底 + 装饰光晕 + 数据卡 + 二维码栏）──
  _renderCanvas(qrLocalPath, logoLocalPath) {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery().in(this);
      query.select('#poster-canvas').fields({ node: true, size: true }).exec(async (res) => {
        const canvas = res[0]?.node;
        if (!canvas) return reject(new Error('Canvas 未找到'));
        const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
        canvas.width = W * dpr; canvas.height = H * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const style = STYLES.find(s => s.key === this.data.activeStyle) || STYLES[0];
        const sum   = this.data.summary || {};
        const sharer= this.data.sharerInfo || {};

        try {
          const rrp = (x, y, w, h, r) => {
            ctx.beginPath();
            ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
            ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
            ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
            ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
            ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
          };
          const cut = (s, n) => (!s ? '' : s.length > n ? s.slice(0, n-1)+'…' : s);

          // ── L1 渐变底 ──
          const bg = ctx.createLinearGradient(0, 0, W, H);
          style.stops.forEach(s => bg.addColorStop(s.p, s.c));
          ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

          // ── L2 装饰：右上柔光圆 + 左下柔光圆 ──
          const halo1 = ctx.createRadialGradient(W*0.85, H*0.12, 0, W*0.85, H*0.12, 200);
          halo1.addColorStop(0, 'rgba(255,255,255,0.22)');
          halo1.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = halo1; ctx.fillRect(0, 0, W, H);
          const halo2 = ctx.createRadialGradient(W*0.1, H*0.92, 0, W*0.1, H*0.92, 180);
          halo2.addColorStop(0, style.accent + '55');
          halo2.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = halo2; ctx.fillRect(0, 0, W, H);

          // ── L3 顶部日期 + 期刊感引导 ──
          const now = new Date();
          const dateStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = '12px "PingFang SC", sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(`ISSUE · ${dateStr}`, 18, 22);

          ctx.fillStyle = style.accent;
          ctx.font = 'bold 13px "PingFang SC", sans-serif';
          ctx.fillText('SALARY  REPORT', 18, 42);

          // ── L4 主标题：姓名 + 工种 ──
          const heroName = cut(sum.name || '我', 6) + ` · ${sum.jobTypeLabel || ''}`;
          ctx.fillStyle = '#FAF6EE';
          ctx.font = 'bold 30px "PingFang SC", sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(heroName, 18, 78);

          ctx.fillStyle = 'rgba(255,255,255,0.65)';
          ctx.font = '14px "PingFang SC", sans-serif';
          ctx.fillText('AI 智能工资测评 · 安得褓贝出品', 18, 116);

          // ── L5 评分 + 等级胶囊 ──
          const scoreY = 158;
          ctx.fillStyle = style.accent;
          ctx.font = 'bold 96px Georgia, "PingFang SC", serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          const scoreText = String(sum.totalScore || 0);
          ctx.fillText(scoreText, 18, scoreY);
          const scoreW = ctx.measureText(scoreText).width;
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.font = '18px "PingFang SC", sans-serif';
          ctx.fillText('分', 18 + scoreW + 6, scoreY + 60);

          // 等级胶囊
          const levelText = `${sum.level || '中级'}阿姨`;
          ctx.font = 'bold 16px "PingFang SC", sans-serif';
          const levelTW = ctx.measureText(levelText).width;
          const pillX = 18 + scoreW + 38, pillY = scoreY + 22, pillH = 36, pillW = levelTW + 28;
          rrp(pillX, pillY, pillW, pillH, pillH/2);
          ctx.fillStyle = style.accent; ctx.fill();
          ctx.fillStyle = '#1a0a2e';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(levelText, pillX + pillW/2, pillY + pillH/2);

          // ── L6 薪资区间卡（毛玻璃）──
          const cardX = 18, cardY = 290, cardW = W - 36, cardH = 124;
          rrp(cardX, cardY, cardW, cardH, 18);
          ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.8; ctx.stroke();

          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = '13px "PingFang SC", sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText('AI 预估薪资区间', cardX + 18, cardY + 16);

          // 大金色薪资数字（先测量再切换字号，避免单位错位到中间）
          const salaryFontSize = 36;
          const unitFontSize   = 14;
          ctx.font = `bold ${salaryFontSize}px Georgia, "PingFang SC", serif`;
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          const salaryStr = `¥${sum.salaryMin || '—'} ~ ¥${sum.salaryMax || '—'}`;
          const salaryStrW = ctx.measureText(salaryStr).width;
          ctx.fillStyle = style.accent;
          ctx.fillText(salaryStr, cardX + 18, cardY + 40);

          ctx.font = `${unitFontSize}px "PingFang SC", sans-serif`;
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillText(sum.salaryUnit || '元/月', cardX + 18 + salaryStrW + 8, cardY + 40 + salaryFontSize - unitFontSize - 4);

          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = '12px "PingFang SC", sans-serif';
          const tip = cut(sum.marketComparison || '已超过同行业部分从业者', 24);
          ctx.fillText(tip, cardX + 18, cardY + cardH - 26);

          // ── L7 三项得分胶囊 ──
          const ss = sum.sectionScores || {};
          const tagY = 432;
          let tagX = cardX;
          const tagDefs = [
            { label: '硬件', val: ss.hardware,    max: ss.hardwareMax    },
            { label: '技能', val: ss.skill,       max: ss.skillMax       },
            { label: '心理', val: ss.personality, max: ss.personalityMax },
          ].filter(t => Number(t.max) > 0);
          ctx.font = 'bold 13px "PingFang SC", sans-serif';
          tagDefs.forEach(t => {
            const txt = `${t.label} ${t.val}/${t.max}`;
            const tw  = ctx.measureText(txt).width;
            const tH  = 30, tW = tw + 22;
            rrp(tagX, tagY, tW, tH, tH/2);
            ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
            ctx.strokeStyle = style.accent + '88'; ctx.lineWidth = 0.8; ctx.stroke();
            ctx.fillStyle = '#FAF6EE';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(txt, tagX + tW/2, tagY + tH/2);
            tagX += tW + 10;
          });

          // ── L8 引导金句 ──
          ctx.fillStyle = '#FAF6EE';
          ctx.font = 'bold 22px "PingFang SC", sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText('你身边的姐妹', cardX, 482);
          ctx.fillStyle = style.accent;
          ctx.fillText('能拿多少？', cardX, 514);

          // ── L9 底部分隔线 + 顾问 + QR ──
          const Y_SEP = 558;
          ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(16, Y_SEP); ctx.lineTo(W-16, Y_SEP); ctx.stroke();

          const QW = 64, QH = 64, QX = W - QW - 16, QY = Y_SEP + (H - Y_SEP - QH - 16) / 2;
          // 左侧品牌信息
          const sloganY = Y_SEP + (H - Y_SEP) * 0.36;
          const subY   = Y_SEP + (H - Y_SEP) * 0.68;
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillStyle = style.accent;
          ctx.font = 'bold 16px "PingFang SC", sans-serif';
          ctx.fillText('安得褓贝 · 为爱全力以赴', 18, sloganY);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = '12px "PingFang SC", sans-serif';
          ctx.fillText('扫码立即测一测，AI 给你专属薪资建议', 18, subY);

          // QR 白卡
          rrp(QX, QY, QW, QH, 8);
          ctx.fillStyle = '#fff'; ctx.fill();
          if (qrLocalPath) {
            const qr = canvas.createImage(); qr.src = qrLocalPath;
            await new Promise(r => { qr.onload = r; qr.onerror = r; });
            ctx.save(); rrp(QX+5, QY+5, QW-10, QH-10, 4); ctx.clip();
            ctx.drawImage(qr, QX+5, QY+5, QW-10, QH-10); ctx.restore();
          }
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('扫码我也测', QX + QW/2, QY + QH + 10);

          // ── L10 右上 Logo ──
          if (logoLocalPath) {
            const logo = canvas.createImage(); logo.src = logoLocalPath;
            await new Promise(r => { logo.onload = r; logo.onerror = r; });
            ctx.drawImage(logo, W - 76, 12, 64, 64);
          }

          wx.canvasToTempFilePath({
            canvas, fileType: 'jpg', quality: 0.95,
            success: r => resolve(r.tempFilePath),
            fail:    err => reject(new Error(err.errMsg || '导出失败')),
          });
        } catch (err) { reject(err); }
      });
    });
  },
});
