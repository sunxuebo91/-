/**
 * 从图片中采样提取主色（去除接近黑/白的像素），返回 { themeColor, themeColorDark }
 * 用于课程宣传海报、悬浮按钮等主题色随封面动态变化
 * 实现思路：32x32 缩略图采样 → 颜色分桶（每通道 32 级）→ 取出现频最高的非极端色
 * 失败兜底返回与播放页一致的紫色 #7B61FF
 */

const FALLBACK = { themeColor: '#7B61FF', themeColorDark: '#5A40D6' };

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function rgbToHex(r, g, b) {
  const h = (n) => {
    const s = clamp(Math.round(n), 0, 255).toString(16);
    return s.length === 1 ? '0' + s : s;
  };
  return '#' + h(r) + h(g) + h(b);
}

// 把 RGB 整体加深 12%（保留色相），用于按钮渐变末端
function darken(r, g, b, ratio) {
  const k = 1 - ratio;
  return [r * k, g * k, b * k];
}

/**
 * 从本地图片路径提取主色（仅小程序 canvas 2d 节点可用）
 * @param {Object} page  调用方 Page 实例（用于 wx.createSelectorQuery().in(page)）
 * @param {String} canvasSelector  页面里的隐藏 canvas 选择器，例如 '#colorSampler'
 * @param {String} localPath  图片本地临时路径（cloud:// 需先下载）
 * @returns {Promise<{themeColor:string, themeColorDark:string}>}
 */
function extractDominantColor(page, canvasSelector, localPath) {
  return new Promise((resolve) => {
    if (!localPath) return resolve(FALLBACK);
    const query = wx.createSelectorQuery().in(page);
    query.select(canvasSelector).fields({ node: true, size: true }).exec((res) => {
      const canvas = res && res[0] && res[0].node;
      if (!canvas) return resolve(FALLBACK);
      try {
        const SIZE = 32;
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        const img = canvas.createImage();
        img.onload = () => {
          try {
            ctx.drawImage(img, 0, 0, SIZE, SIZE);
            const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
            const buckets = {};
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
              if (a < 200) continue;
              // 跳过接近黑/白/灰的像素（避免封面边缘黑边、字幕白底主导主色）
              const max = Math.max(r, g, b), min = Math.min(r, g, b);
              if (max < 40) continue;
              if (min > 220) continue;
              if (max - min < 18) continue;
              // 分桶：每通道压到 0-7（每 32 级一桶）
              const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
              if (!buckets[key]) buckets[key] = { count: 0, r: 0, g: 0, b: 0 };
              const bk = buckets[key];
              bk.count += 1;
              bk.r += r; bk.g += g; bk.b += b;
            }
            let best = null;
            Object.keys(buckets).forEach((k) => {
              const bk = buckets[k];
              if (!best || bk.count > best.count) best = bk;
            });
            if (!best || best.count < 6) return resolve(FALLBACK);
            const r = best.r / best.count;
            const g = best.g / best.count;
            const b = best.b / best.count;
            const themeColor = rgbToHex(r, g, b);
            const [dr, dg, db] = darken(r, g, b, 0.18);
            const themeColorDark = rgbToHex(dr, dg, db);
            resolve({ themeColor, themeColorDark });
          } catch (err) {
            console.warn('[imageDominantColor] sample failed:', err && err.message);
            resolve(FALLBACK);
          }
        };
        img.onerror = () => resolve(FALLBACK);
        img.src = localPath;
      } catch (err) {
        console.warn('[imageDominantColor] init failed:', err && err.message);
        resolve(FALLBACK);
      }
    });
  });
}

module.exports = {
  extractDominantColor,
  FALLBACK,
};
