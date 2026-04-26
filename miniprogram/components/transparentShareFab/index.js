// 透明服务页通用：分享 + 海报 浮窗组件
// 直接分享：父页面 onShareAppMessage 决定卡片标题与图
// 海报分享：动态绘制竖版长图（标题 + 副标 + 关键要点 + 右下二维码 + 右上 Logo）

const POSTER_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得褓贝定稿.png';
const LINE_BASE_FALLBACK = 56;

// 进程级缓存：同一会话只下载一次
let _logoPathCache = '';
let _qrPathCache = '';

Component({
  properties: {
    pageTitle: { type: String, value: '' },
    pageSubtitle: { type: String, value: '' },
    pageBadge: { type: String, value: '' },
    themeColor: { type: String, value: '#8b5cf6' },
    themeColorLight: { type: String, value: '#c4b5fd' },
    stats: { type: Array, value: [] },
    summaryLines: { type: Array, value: [] },
    footerSlogan: { type: String, value: '安得褓贝 · 用心陪伴每一天' }
  },

  data: {
    generating: false
  },

  methods: {
    onTapPoster() {
      if (this.data.generating) return;
      this._generatePoster();
    },

    async _generatePoster() {
      this.setData({ generating: true });
      wx.showLoading({ title: '海报生成中...', mask: true });
      try {
        const [qrPath, logoPath] = await Promise.all([
          this._getQR(),
          this._getLogo()
        ]);
        const posterPath = await this._renderPoster(qrPath, logoPath);
        wx.hideLoading();
        wx.showShareImageMenu({
          path: posterPath,
          fail: () => wx.saveImageToPhotosAlbum({
            filePath: posterPath,
            success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
            fail: () => wx.showToast({ title: '请长按图片保存', icon: 'none' })
          })
        });
      } catch (err) {
        wx.hideLoading();
        console.error('[transparentShareFab] 海报生成失败:', err);
        wx.showToast({ title: err.message || '生成失败', icon: 'none' });
      } finally {
        this.setData({ generating: false });
      }
    },

    _downloadImage(url) {
      return new Promise((resolve, reject) => {
        wx.downloadFile({
          url,
          success: r => r.statusCode === 200 ? resolve(r.tempFilePath) : reject(new Error('下载失败')),
          fail: e => reject(new Error(e.errMsg || '下载失败'))
        });
      });
    },

    async _getLogo() {
      if (_logoPathCache) return _logoPathCache;
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [POSTER_LOGO_FILE_ID] });
        const url = res?.fileList?.[0]?.tempFileURL;
        if (!url) return '';
        _logoPathCache = await this._downloadImage(url);
        return _logoPathCache;
      } catch (err) {
        console.warn('[transparentShareFab] 获取 Logo 失败:', err?.message);
        return '';
      }
    },

    async _getQR() {
      if (_qrPathCache) return _qrPathCache;
      try {
        const cf = await wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: { type: 'getHomeMiniCode' }
        });
        const fileID = cf?.result?.fileID;
        if (!fileID) return '';
        const tempRes = await wx.cloud.getTempFileURL({ fileList: [fileID] });
        const url = tempRes?.fileList?.[0]?.tempFileURL;
        if (!url) return '';
        _qrPathCache = await this._downloadImage(url);
        return _qrPathCache;
      } catch (err) {
        console.warn('[transparentShareFab] 获取小程序码失败:', err?.message);
        return '';
      }
    },

    _renderPoster(qrPath, logoPath) {
      return new Promise((resolve, reject) => {
        const query = wx.createSelectorQuery().in(this);
        query.select('#tsf-poster-canvas').fields({ node: true, size: true }).exec(async (res) => {
          const canvas = res?.[0]?.node;
          if (!canvas) return reject(new Error('Canvas 未找到'));

          // 画布尺寸（px）
          const W = 750;
          const HERO_H = 380;
          const SUMMARY_HEAD = 90;
          const LINE_BASE = 56;        // 单行高度（实际多行会扩展）
          const FOOTER_H = 220;
          const PAD_TOP = 30;
          const PAD_BOTTOM = 40;

          const lines = (this.data.summaryLines || []).slice(0, 10);

          // 预测高度：每条要点根据字数粗估行数
          const ctxMeasureLine = (text, maxW, fontSize) => {
            // 简单等宽估算：中英混排按字号 0.95 估宽
            const charW = fontSize * 0.95;
            const perLine = Math.floor(maxW / charW);
            return Math.max(1, Math.ceil(text.length / perLine));
          };

          let estSummaryH = SUMMARY_HEAD + 30;
          lines.forEach(l => {
            const rows = ctxMeasureLine(String(l), W - 120, 26);
            estSummaryH += Math.max(LINE_BASE, rows * 38 + 22);
          });
          const H = PAD_TOP + HERO_H + estSummaryH + FOOTER_H + PAD_BOTTOM;

          const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
          canvas.width = W * dpr;
          canvas.height = H * dpr;
          const ctx = canvas.getContext('2d');
          ctx.scale(dpr, dpr);

          try {
            await this._drawPoster(ctx, canvas, W, H, HERO_H, FOOTER_H, lines, qrPath, logoPath);
            wx.canvasToTempFilePath({
              canvas, fileType: 'jpg', quality: 0.95,
              success: r => resolve(r.tempFilePath),
              fail: e => reject(new Error(e.errMsg || '导出失败'))
            }, this);
          } catch (err) {
            reject(err);
          }
        });
      });
    },

    async _drawPoster(ctx, canvas, W, H, HERO_H, FOOTER_H, lines, qrPath, logoPath) {
      // 圆角矩形辅助
      const roundRect = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
      };

      // 背景：白
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      // ── Hero 区 ──
      const grad = ctx.createLinearGradient(0, 0, W, HERO_H);
      grad.addColorStop(0, this.data.themeColor);
      grad.addColorStop(1, this.data.themeColorLight);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, HERO_H);

      // 装饰圆
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(W - 80, 60, 120, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(60, HERO_H - 40, 80, 0, Math.PI * 2); ctx.fill();

      // Logo 右上
      if (logoPath) {
        const logoImg = canvas.createImage();
        logoImg.src = logoPath;
        await new Promise(r => { logoImg.onload = r; logoImg.onerror = r; });
        const logoSize = 110;
        ctx.drawImage(logoImg, W - logoSize - 28, 24, logoSize, logoSize);
      }

      // Badge
      if (this.data.pageBadge) {
        ctx.font = '22px sans-serif';
        const badgeText = this.data.pageBadge;
        const textW = ctx.measureText(badgeText).width;
        const padX = 22;
        const badgeX = 40;
        const badgeY = 50;
        const badgeH = 42;
        const badgeW = textW + padX * 2;
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        roundRect(badgeX, badgeY, badgeW, badgeH, 21);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(badgeText, badgeX + padX, badgeY + badgeH / 2 + 1);
      }

      // 主标题
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 56px sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      const title = this.data.pageTitle || '';
      // 标题超长缩放
      let titleSize = 56;
      if (ctx.measureText(title).width > W - 80) {
        titleSize = Math.floor(56 * (W - 80) / ctx.measureText(title).width);
        ctx.font = `bold ${titleSize}px sans-serif`;
      }
      ctx.fillText(title, 40, 130);

      // 副标题
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '26px sans-serif';
      ctx.fillText(this.data.pageSubtitle || '', 40, 130 + titleSize + 24);

      // Stats
      const stats = this.data.stats || [];
      if (stats.length) {
        const statY = HERO_H - 100;
        const statH = 76;
        const statBoxX = 40;
        const statBoxW = W - 80;
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        roundRect(statBoxX, statY, statBoxW, statH, 16);
        ctx.fill();
        const segW = statBoxW / stats.length;
        ctx.textAlign = 'center';
        stats.forEach((s, i) => {
          const cx = statBoxX + segW * i + segW / 2;
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 32px sans-serif';
          ctx.textBaseline = 'top';
          ctx.fillText(String(s.num || ''), cx, statY + 12);
          ctx.fillStyle = 'rgba(255,255,255,0.88)';
          ctx.font = '20px sans-serif';
          ctx.fillText(String(s.label || ''), cx, statY + 48);
          if (i < stats.length - 1) {
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(statBoxX + segW * (i + 1) - 1, statY + 16, 2, statH - 32);
          }
        });
        ctx.textAlign = 'left';
      }

      // ── 核心要点段 ──
      let curY = HERO_H + 40;
      ctx.fillStyle = '#222';
      ctx.font = 'bold 32px sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText('核心要点', 40, curY);
      ctx.fillStyle = this.data.themeColor;
      roundRect(40, curY + 48, 64, 6, 3); ctx.fill();
      curY += 90;

      // 简单按字数估算的逐字换行
      const wrapDraw = (text, x, y, maxW, lineH) => {
        const str = String(text || '');
        let buf = '';
        let drawY = y;
        for (let i = 0; i < str.length; i++) {
          const test = buf + str[i];
          if (ctx.measureText(test).width > maxW) {
            ctx.fillText(buf, x, drawY);
            buf = str[i];
            drawY += lineH;
          } else {
            buf = test;
          }
        }
        if (buf) ctx.fillText(buf, x, drawY);
        return drawY - y + lineH;
      };

      ctx.font = '26px sans-serif';
      lines.forEach(line => {
        // 圆点
        ctx.fillStyle = this.data.themeColor;
        ctx.beginPath(); ctx.arc(56, curY + 16, 9, 0, Math.PI * 2); ctx.fill();
        // 正文
        ctx.fillStyle = '#444';
        const used = wrapDraw(line, 84, curY, W - 124, 38);
        curY += Math.max(LINE_BASE_FALLBACK, used + 14);
      });

      // ── Footer 区 ──
      const footerY = H - FOOTER_H;
      ctx.fillStyle = '#FAF8F5';
      ctx.fillRect(0, footerY, W, FOOTER_H);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, footerY); ctx.lineTo(W, footerY); ctx.stroke();

      // QR 右下
      const QSIZE = 160;
      const QX = W - QSIZE - 40;
      const QY = footerY + (FOOTER_H - QSIZE - 30) / 2;
      ctx.fillStyle = '#FFFFFF';
      roundRect(QX - 10, QY - 10, QSIZE + 20, QSIZE + 20, 12);
      ctx.fill();
      ctx.shadowColor = 'rgba(0,0,0,0.08)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;
      roundRect(QX - 10, QY - 10, QSIZE + 20, QSIZE + 20, 12);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      if (qrPath) {
        const qrImg = canvas.createImage();
        qrImg.src = qrPath;
        await new Promise(r => { qrImg.onload = r; qrImg.onerror = r; });
        ctx.drawImage(qrImg, QX, QY, QSIZE, QSIZE);
      } else {
        ctx.fillStyle = '#EEE';
        ctx.fillRect(QX, QY, QSIZE, QSIZE);
      }
      ctx.fillStyle = '#888';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('扫码查看更多', QX + QSIZE / 2, QY + QSIZE + 14);
      ctx.textAlign = 'left';

      // 左下：品牌 slogan（参考简历海报，主题色 italic bold，左侧区域居中）
      const sloganText = '为爱，全力以赴！';
      const sloganCenterX = (QX - 16) / 2;
      const sloganCenterY = footerY + FOOTER_H / 2;
      ctx.fillStyle = this.data.themeColor;
      ctx.font = 'italic bold 36px "PingFang SC", "STKaiti", "KaiTi", Georgia, serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(sloganText, sloganCenterX, sloganCenterY);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }
  }
});


