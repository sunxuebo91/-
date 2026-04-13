const articleService = require('../../services/article.js');
const userService = require('../../services/userService.js');
const SHARE_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得最新合同/安得褓贝定稿.jpg';

function decodeHtmlEntities(str) {

  let s = String(str || '');

  // 处理双重编码（例如 "&amp;lt;"）：最多解码 3 次
  for (let i = 0; i < 3; i++) {
    const prev = s;
    s = s
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => {
        const n = Number(code);
        if (!Number.isFinite(n)) return _;
        try {
          return String.fromCharCode(n);
        } catch (e) {
          return _;
        }
      });
    if (s === prev) break;
  }

  return s;
}

// 段落/标题公共样式
// 注意：标题不设 margin-top，靠上一段落的 margin-bottom 产生间距
// 这样第一个元素不会在 rich-text 顶部产生大空白
const P_STYLE = 'margin:0 0 20px 0;line-height:1.95;color:#333;font-size:15px;word-break:break-all;';
const H1_STYLE = 'font-size:19px;font-weight:700;color:#111;margin:0 0 10px;line-height:1.5;word-break:break-all;';
const H2_STYLE = 'font-size:17px;font-weight:700;color:#111;margin:0 0 8px;line-height:1.5;word-break:break-all;';
const H3_STYLE = 'font-size:15px;font-weight:700;color:#222;margin:0 0 6px;line-height:1.5;word-break:break-all;';
const H46_STYLE = 'font-size:14px;font-weight:600;color:#333;margin:0 0 4px;line-height:1.5;word-break:break-all;';
const LI_STYLE = 'margin:0 0 8px;padding-left:14px;line-height:1.9;color:#333;font-size:15px;word-break:break-all;';

function toRichTextHtml(rawContent, options = {}) {
  const skipImages = !!options.skipImages;

  let html = decodeHtmlEntities(rawContent);
  html = String(html || '').trim();
  if (!html) return '';

  // 去掉 script/style
  html = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // 统一换行
  html = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 纯文本模式（无任何 HTML 标签）
  if (!/<[a-zA-Z]/.test(html)) {
    const paragraphs = html.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    if (!paragraphs.length) return '';
    return paragraphs.map(para => {
      const lines = para.split('\n').map(s => s.trim()).filter(Boolean);
      return `<p style="${P_STYLE}">${lines.join('<br>')}</p>`;
    }).join('');
  }

  // ── HTML 模式 ──────────────────────────────────────────

  // 1. 标题标签 → 带样式的 p
  html = html.replace(/<h1[^>]*>/gi, `<p style="${H1_STYLE}">`);
  html = html.replace(/<h2[^>]*>/gi, `<p style="${H2_STYLE}">`);
  html = html.replace(/<h3[^>]*>/gi, `<p style="${H3_STYLE}">`);
  html = html.replace(/<h[4-6][^>]*>/gi, `<p style="${H46_STYLE}">`);
  html = html.replace(/<\/h[1-6]>/gi, '</p>');

  // 2. strong/b → span 加粗
  html = html.replace(/<(?:strong|b)([^>]*)>/gi, '<span style="font-weight:700;color:#111;">');
  html = html.replace(/<\/(?:strong|b)>/gi, '</span>');

  // 3. em/i → span（斜体，给一点颜色区分）
  html = html.replace(/<(?:em|i)([^>]*)>/gi, '<span style="font-style:italic;color:#555;">');
  html = html.replace(/<\/(?:em|i)>/gi, '</span>');

  // 4. li → 带 bullet 的 p
  html = html.replace(/<li[^>]*>/gi, `<p style="${LI_STYLE}">• `);
  html = html.replace(/<\/li>/gi, '</p>');
  html = html.replace(/<\/?(ul|ol)[^>]*>/gi, '');

  // 5. a 标签 → span（防止小程序内跳链接）
  html = html.replace(/<a[^>]*>/gi, '<span style="color:#8766F3;">');
  html = html.replace(/<\/a>/gi, '</span>');

  // 6. 容器块级标签 → p
  html = html.replace(
    /<(\/)?(div|section|article|header|footer|main|figure|figcaption|blockquote)[^>]*>/gi,
    (m, slash) => (slash ? '</p>' : '<p>')
  );

  // 7. 表格标签 → 去掉（保留文字）
  html = html.replace(/<\/?(table|thead|tbody|tfoot|tr|td|th|col|colgroup)[^>]*>/gi, ' ');

  // 8. 给没有自定义 style 的 <p> 补上默认样式
  html = html.replace(/<p(?:\s[^>]*)?>/gi, (m) => {
    if (/style=/i.test(m)) return m;
    return `<p style="${P_STYLE}">`;
  });

  // 9. 图片处理
  if (skipImages) {
    html = html.replace(/<img[^>]*\/?>/gi, '');
  } else {
    html = html.replace(/<img([^>]*)(?:\/)?>/gi, (m, attrs) => {
      const srcMatch = attrs.match(/src=["']([^"']+)["']/i)
                    || attrs.match(/data-src=["']([^"']+)["']/i)
                    || attrs.match(/data-original=["']([^"']+)["']/i);
      if (!srcMatch) return '';
      let src = srcMatch[1];
      if (/^http:\/\//i.test(src)) src = src.replace(/^http:\/\//i, 'https://');
      return `<img src="${src}" style="max-width:100%;height:auto;display:block;margin:14px 0;border-radius:12px;">`;
    });
  }

  // 10. 剔除其余不识别标签（保留 p / br / img / span）
  html = html.replace(/<(?!\/?(?:p|br|img|span)\b)[^>]+>/gi, '');

  // 11. 标签之外残留的 \n → <br>（修复换行丢失的核心问题）
  html = html.replace(/\n/g, '<br>');

  // 12. 合并过多连续 <br>
  html = html.replace(/(<br\s*\/?>[\s\u00A0]*){3,}/gi, '<br><br>');

  // 13. 删除空段落：不靠猜格式，而是看 <p> 里有没有可见文字
  html = html.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (match, inner) => {
    // 把所有标签去掉，剩余内容去掉所有空白类字符
    const visible = inner.replace(/<[^>]*>/g, '').replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, '');
    if (!visible) return ''; // 没有可见文字 → 整个 <p> 删掉
    return match;
  });

  // 14. 去掉开头残留的裸 <br>
  html = html.replace(/^([\s\u00A0]*<br\s*\/?>[\s\u00A0]*)+/gi, '').trim();

  // 15. 去掉结尾残留的裸 <br>
  html = html.replace(/([\s\u00A0]*<br\s*\/?>[\s\u00A0]*)+$/gi, '').trim();

  // 16. 再清一轮开头的空白（可能上面删完空 p 后又暴露出来了）
  html = html.replace(/^([\s\u00A0]*<br\s*\/?>[\s\u00A0]*)+/gi, '').trim();

  return html;
}

function safeToDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number' || typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'object') {
    if (v.$date) {
      const d = new Date(v.$date);
      return isNaN(d.getTime()) ? null : d;
    }
    // 兼容部分序列化时间格式
    if (v._seconds) {
      const d = new Date(v._seconds * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateTime(v) {
  const d = safeToDate(v);
  if (!d) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function pickContent(raw) {
  return (
    raw?.content ||
    raw?.contentHtml ||
    raw?.htmlContent ||
    raw?.html ||
    raw?.body ||
    raw?.detail ||
    raw?.articleContent ||
    ''
  );
}

function pickCover(raw) {
  // 1. 优先使用 imageUrls 数组的第一张图（API返回的字段）
  if (Array.isArray(raw?.imageUrls) && raw.imageUrls.length > 0) {
    console.log('📰 使用 imageUrls[0]:', raw.imageUrls[0]);
    return raw.imageUrls[0];
  }

  // 2. 兜底：使用 coverImage 字段
  if (raw?.coverImage) {
    console.log('📰 使用 coverImage:', raw.coverImage);
    return raw.coverImage;
  }

  // 3. 最后尝试从 HTML 内容中提取第一张图片
  const content = pickContent(raw);
  if (content) {
    // 匹配 <img> 标签的 src 属性
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) {
      console.log('📰 从HTML提取图片:', imgMatch[1]);
      return imgMatch[1];
    }
  }

  console.log('📰 未找到封面图');
  return '';
}

Page({
  data: {
    id: '',
    loading: true,
    article: {},
    contentHtml: '',
    viewCount: 0,
    shareLogo: '',
    images: [],  // 小红书风格：多图数组
    currentImageIndex: 0,  // 当前图片索引
    swiperHeight: 0,  // 动态计算的轮播图高度
    isShared: false,
    sharerInfo: null
  },

  async onLoad(options) {
    const id = options?.id ? decodeURIComponent(options.id) : '';
    // 用屏幕宽度 * 0.65 设置默认高度，避免图片加载前 swiper 高度为 0
    const { windowWidth } = wx.getSystemInfoSync();
    this.setData({ id, swiperHeight: Math.round(windowWidth * 0.65) });

    if (!id) {
      wx.showToast({ title: '文章ID缺失', icon: 'none' });
      this.setData({ loading: false });
      return;
    }

    // 解析分享参数
    const { shared, sharerId, sharer, sharerPhone, sharerCompany, sharerAvatar } = options || {};
    if (shared === '1') {
      const resolvedSharerId = sharerId ? decodeURIComponent(sharerId) : '';
      const sharerInfoData = {
        id: resolvedSharerId,
        name: sharer ? decodeURIComponent(sharer) : '安得褓贝顾问',
        phone: sharerPhone ? decodeURIComponent(sharerPhone) : '',
        company: sharerCompany ? decodeURIComponent(sharerCompany) : '安得褓贝',
        avatar: sharerAvatar ? decodeURIComponent(sharerAvatar) : ''
      };
      this.setData({
        isShared: true,
        sharerInfo: sharerInfoData
      });

      // 如果缺少顾问姓名，异步拉取完整信息补全
      if (!sharer && (resolvedSharerId || sharerPhone)) {
        wx.cloud.callFunction({
          name: 'userService',
          data: { action: 'getStaffPublicInfo', userId: resolvedSharerId, phone: sharerPhone ? decodeURIComponent(sharerPhone) : '' }
        }).then(res => {
          if (res && res.result && res.result.success) {
            const d = res.result.data;
            const cur = this.data.sharerInfo || {};
            this.setData({
              sharerInfo: {
                ...cur,
                name: d.name || cur.name,
                phone: d.phone || cur.phone,
                avatar: d.avatar || cur.avatar,
                company: d.company || cur.company
              }
            });
          }
        }).catch(err => {
          console.warn('⚠️ 拉取顾问信息失败（不影响主流程）:', err);
        });
      }
    }

    // 预取分享 LOGO
    this.loadShareLogo();

    await this.reloadAll();
  },


  async onPullDownRefresh() {
    await this.reloadAll();
    wx.stopPullDownRefresh();
  },

  async reloadAll() {
    this.setData({ loading: true });

    await Promise.allSettled([
      this.loadArticle(),
      this.incrementAndLoadViewCount()
    ]);

    this.setData({ loading: false });
  },

  async loadArticle() {
    try {
      const id = this.data.id;
      const resp = await articleService.getArticleDetail(id);

      if (!resp || !resp.success || !resp.data) {
        throw new Error(resp?.message || '获取文章详情失败');
      }

      const raw = resp.data;

      // 检查是否有独立的封面图字段（不是从HTML提取的）
      const hasExplicitCover = !!(raw?.coverImage || (Array.isArray(raw?.imageUrls) && raw.imageUrls.length > 0));

      const coverImage = pickCover(raw);
      const article = {
        _id: raw?._id || raw?.id || raw?.articleId || id,
        title: raw?.title || '文章详情',
        author: raw?.author || '安得褓贝',
        source: raw?.source || '',
        summary: decodeHtmlEntities(raw?.summary || '').replace(/<[^>]+>/g, '').replace(/[\s\u00A0\u200B\n\r\t]+/g, ' ').trim(),
        coverImage,
        publishedAtText: raw?.publishedAt ? formatDateTime(raw.publishedAt) : (raw?.createdAt ? formatDateTime(raw.createdAt) : '')
      };

      const content = pickContent(raw);
      // 只有当有独立封面图字段时才过滤正文图片，避免重复
      // 如果封面图是从HTML提取的，则保留正文中的所有图片
      const contentHtml = toRichTextHtml(content, { skipImages: hasExplicitCover });

      console.log('📝 summary:', JSON.stringify(article.summary));
      console.log('📝 contentHtml 前200字符:', contentHtml.substring(0, 200));

      // 小红书风格：提取多图
      const images = this.extractImages(raw);
      console.log('📸 提取到的图片数组:', images);

      this.setData({
        article,
        contentHtml,
        images,
        currentImageIndex: 0
      });

      if (article.title) {
        wx.setNavigationBarTitle({ title: article.title });
      }
    } catch (e) {
      console.error('📄 加载文章详情失败:', e);
      wx.showToast({ title: e?.message || '加载失败', icon: 'none' });
    }
  },

  async incrementAndLoadViewCount() {
    try {
      const id = this.data.id;
      const newViewCount = await articleService.incrementViewCount(id);
      this.setData({ viewCount: Number(newViewCount) || 0 });
    } catch (e) {
      console.warn('📈 阅读量更新失败(忽略):', e);
      // 兜底：尝试读一次
      try {
        const id = this.data.id;
        const map = await articleService.batchGetViewCounts([String(id)]);
        const value = map?.[String(id)] || 0;
        this.setData({ viewCount: Number(value) || 0 });
      } catch (err) {
        // ignore
      }
    }
  },

  // 分享给好友
  onShareAppMessage() {
    const article = this.data.article || {};
    const id = article._id || this.data.id || '';
    const title = article.title || '安得褓贝 · 文章';
    // 优先使用文章封面图，没有封面图时才使用默认Logo
    const imageUrl = article.coverImage || this.data.shareLogo || '/images/default-goods-image.png';

    // 获取分享者信息（优先使用 CRM 端真实姓名和头像，对齐简历分享逻辑）
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const sharerName = crmUserInfo.crmName || crmUserInfo.name || crmUserInfo.nickname || '安得褓贝顾问';
    const sharerPhone = crmUserInfo.phone || '';
    const sharerAvatar = crmUserInfo.crmAvatar || crmUserInfo.avatarUrl || crmUserInfo.avatar || '';
    const sharerCompany = '安得褓贝';
    const sharerId = String(crmUserInfo._id || crmUserInfo.id || crmUserInfo.userId || '');

    const sharePath = `/pages/articleDetail/index?id=${encodeURIComponent(String(id))}&shared=1&sharerId=${encodeURIComponent(sharerId)}&sharer=${encodeURIComponent(sharerName)}&sharerPhone=${encodeURIComponent(sharerPhone)}&sharerCompany=${encodeURIComponent(sharerCompany)}&sharerAvatar=${encodeURIComponent(sharerAvatar)}`;

    return {
      title,
      path: sharePath,
      imageUrl
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    const article = this.data.article || {};
    const id = article._id || this.data.id || '';
    const title = article.title || '安得褓贝 · 文章';
    // 优先使用文章封面图，没有封面图时才使用默认Logo
    const imageUrl = article.coverImage || this.data.shareLogo || '/images/default-goods-image.png';

    // 获取分享者信息（优先使用 CRM 端真实姓名和头像，对齐简历分享逻辑）
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const sharerName = crmUserInfo.crmName || crmUserInfo.name || crmUserInfo.nickname || '安得褓贝顾问';
    const sharerPhone = crmUserInfo.phone || '';
    const sharerAvatar = crmUserInfo.crmAvatar || crmUserInfo.avatarUrl || crmUserInfo.avatar || '';
    const sharerCompany = '安得褓贝';
    const sharerId = String(crmUserInfo._id || crmUserInfo.id || crmUserInfo.userId || '');

    const shareQuery = `id=${encodeURIComponent(String(id))}&shared=1&sharerId=${encodeURIComponent(sharerId)}&sharer=${encodeURIComponent(sharerName)}&sharerPhone=${encodeURIComponent(sharerPhone)}&sharerCompany=${encodeURIComponent(sharerCompany)}&sharerAvatar=${encodeURIComponent(sharerAvatar)}`;

    return {
      title,
      query: shareQuery,
      imageUrl
    };
  },

  // 小红书风格：提取多图
  extractImages(raw) {
    const images = [];

    // 1. 优先使用 imageUrls 数组（API返回的多图字段）
    if (Array.isArray(raw?.imageUrls) && raw.imageUrls.length > 0) {
      images.push(...raw.imageUrls);
    }

    // 2. 如果没有 imageUrls，使用 coverImage
    if (images.length === 0 && raw?.coverImage) {
      images.push(raw.coverImage);
    }

    // 3. 如果还是没有图片，从 HTML 内容中提取所有图片
    if (images.length === 0) {
      const content = pickContent(raw);
      if (content) {
        const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
        let match;
        while ((match = imgRegex.exec(content)) !== null) {
          if (match[1]) {
            images.push(match[1]);
          }
        }
      }
    }

    // 4. 过滤和处理图片URL
    return images
      .filter(url => url && typeof url === 'string')
      .map(url => {
        // 将 http:// 转换为 https://
        if (/^http:\/\//i.test(url)) {
          return url.replace(/^http:\/\//i, 'https://');
        }
        return url;
      })
      .slice(0, 9);  // 最多显示9张图片（小红书风格）
  },

  // 图片轮播切换
  onSwiperChange(e) {
    const current = e?.detail?.current || 0;
    this.setData({ currentImageIndex: current });
  },

  // 图片预览
  previewImage(e) {
    const index = e?.currentTarget?.dataset?.index || 0;
    const images = this.data.images || [];

    if (images.length === 0) return;

    wx.previewImage({
      current: images[index],
      urls: images
    });
  },

  // 图片加载完成，动态计算容器高度
  onImageLoad(e) {
    const { width, height } = e.detail;
    if (!width || !height) return;

    // 获取屏幕宽度
    const systemInfo = wx.getSystemInfoSync();
    const screenWidth = systemInfo.windowWidth;

    // 计算图片宽高比
    const ratio = height / width;

    // 计算容器高度（单位：px）
    let swiperHeight = screenWidth * ratio;

    // 限制最大高度为屏幕高度的 70%
    const maxHeight = systemInfo.windowHeight * 0.7;
    if (swiperHeight > maxHeight) {
      swiperHeight = maxHeight;
    }

    // 限制最小高度为屏幕宽度的 50%（避免横图太矮）
    const minHeight = screenWidth * 0.5;
    if (swiperHeight < minHeight) {
      swiperHeight = minHeight;
    }

    console.log('📐 图片尺寸:', { width, height, ratio, swiperHeight, screenWidth });

    this.setData({ swiperHeight });
  },

  // 预取云存储 Logo 的临时链接
  async loadShareLogo() {
    try {
      const res = await wx.cloud.getTempFileURL({
        fileList: [SHARE_LOGO_FILE_ID]
      });
      const temp = res?.fileList?.[0]?.tempFileURL;
      if (temp) {
        this.setData({ shareLogo: temp });
      }
    } catch (err) {
      console.error('获取分享LOGO失败，使用默认图:', err);
    }
  },

  // 联系顾问
  onContactAdvisor() {
    const sharerInfo = this.data.sharerInfo;
    if (!sharerInfo) {
      wx.showToast({ title: '顾问信息不存在', icon: 'none' });
      return;
    }
    const itemList = [];
    const actions = [];
    if (sharerInfo.phone) {
      itemList.push('拨打电话：' + sharerInfo.phone);
      actions.push(() => {
        wx.makePhoneCall({
          phoneNumber: sharerInfo.phone,
          fail: () => wx.showToast({ title: '拨打电话失败', icon: 'none' })
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
  }
});

