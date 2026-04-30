// 工资测评分享缩略图：用离屏 canvas 动态生成一张品牌色调的 5:4 分享卡
// - 在 index 页 onReady 时生成一次，模块级变量缓存 tempFilePath
// - quiz / result 页通过 getShareImage() 复用同一份缓存
// - 未生成完成或生成失败时回退到品牌云图，保证 onShareAppMessage 永远有图

// 品牌云图（与 articleDetail 同一份）：作为兜底，WeChat 支持 cloud:// 直接做 imageUrl
const FALLBACK_BRAND_IMAGE = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得最新合同/安得褓贝定稿.jpg';

let _cachedPath = '';
let _generating = false;

function getShareImage() {
  return _cachedPath || FALLBACK_BRAND_IMAGE;
}

function prepareShareImage(page, canvasId = 'assessment-share-canvas') {
  if (_cachedPath || _generating) return Promise.resolve(_cachedPath || FALLBACK_BRAND_IMAGE);
  _generating = true;

  return new Promise((resolve) => {
    const finish = (val) => { _generating = false; resolve(val); };

    const query = page.createSelectorQuery();
    query.select('#' + canvasId)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          console.warn('[assessmentShareImage] canvas 未找到，使用品牌兜底图');
          finish(FALLBACK_BRAND_IMAGE);
          return;
        }
        try {
          drawAndExport(res[0].node, (path) => {
            if (path) {
              _cachedPath = path;
              finish(path);
            } else {
              finish(FALLBACK_BRAND_IMAGE);
            }
          });
        } catch (e) {
          console.error('[assessmentShareImage] 生成异常:', e);
          finish(FALLBACK_BRAND_IMAGE);
        }
      });
  });
}

function drawAndExport(canvas, cb) {
  const ctx = canvas.getContext('2d');
  const sysInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : { pixelRatio: 2 };
  const dpr = sysInfo.pixelRatio || 2;
  const W = 500;
  const H = 400;

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  // 1) 紫色渐变背景
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#3D1466');
  grad.addColorStop(0.55, '#6B2EA0');
  grad.addColorStop(1, '#9B5BC9');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 2) 装饰光晕（金色半透明圆）
  ctx.fillStyle = 'rgba(212, 175, 55, 0.18)';
  ctx.beginPath();
  ctx.arc(W - 20, 30, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(212, 175, 55, 0.10)';
  ctx.beginPath();
  ctx.arc(40, H - 20, 90, 0, Math.PI * 2);
  ctx.fill();

  // 3) 顶部金色徽章
  const badgeX = 36, badgeY = 36, badgeW = 132, badgeH = 36;
  ctx.fillStyle = '#D4AF37';
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 18);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AI · 工资测评', badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);

  // 4) 主标题（两行）
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('测一测你能', W / 2, 178);
  ctx.fillText('拿多少工资？', W / 2, 232);

  // 5) 金色分隔线
  ctx.fillStyle = '#D4AF37';
  ctx.fillRect(W / 2 - 80, 254, 160, 3);

  // 6) 副标题
  ctx.fillStyle = '#F6E5B8';
  ctx.font = '22px sans-serif';
  ctx.fillText('30 道题 · AI 出专属薪资报告', W / 2, 294);

  // 7) 底部品牌行
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('安得褓贝 · 家政行业 HR 把关', W / 2, 354);

  // 8) 导出
  setTimeout(() => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: W,
      height: H,
      destWidth: W * dpr,
      destHeight: H * dpr,
      fileType: 'jpg',
      quality: 0.92,
      success: (r) => cb(r.tempFilePath),
      fail: (err) => {
        console.error('[assessmentShareImage] canvasToTempFilePath 失败:', err);
        cb('');
      },
    });
  }, 30);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

module.exports = { prepareShareImage, getShareImage };
