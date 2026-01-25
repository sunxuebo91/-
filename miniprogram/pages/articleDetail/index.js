const articleService = require('../../services/article.js');
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

function toRichTextNodes(rawContent, options = {}) {
  const skipImages = !!options.skipImages;

  // rich-text 支持 nodes 数组；为兼容低基础库，这里尽量转成 nodes
  let html = decodeHtmlEntities(rawContent);
  html = String(html || '').trim();
  if (!html) return [];

  // 去掉 script/style
  html = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // 将常见容器标签当成段落
  html = html
    .replace(/<(\/)?(div|section|article|header|footer|main|figure|figcaption|blockquote)[^>]*>/gi, (m, slash) => (slash ? '</p>' : '<p>'));

  // 先把除 p/br/img 以外的标签剥离（保留文本）
  html = html.replace(/<(?!\/?(?:p|br|img)\b)[^>]+>/gi, '');

  // 统一换行
  html = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 如果完全没有标签，按纯文本处理：按空行分段
  const hasTag = /<(p|br|img)\b/i.test(html);
  if (!hasTag) {
    const paragraphs = html.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    return paragraphs.map(t => {
      const lines = String(t || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
      const children = [];
      lines.forEach((line, idx) => {
        if (line) children.push({ type: 'text', text: line });
        if (idx < lines.length - 1) children.push({ name: 'br' });
      });

      return {
        name: 'p',
        attrs: { style: 'margin:0 0 12px 0;line-height:1.8;' },
        children
      };
    });
  }

  const nodes = [];
  let currentP = null;
  let currentChildren = null;

  const pushText = (text) => {
    const t = String(text || '');
    if (!t) return;
    // rich-text 的 text 节点会保留换行但显示不稳定，这里转成空格/换行由 <br> 控制
    const cleaned = t.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ');
    if (!cleaned.trim()) return;

    if (!currentP) {
      currentP = { name: 'p', attrs: { style: 'margin:0 0 12px 0;line-height:1.8;' }, children: [] };
      currentChildren = currentP.children;
      nodes.push(currentP);
    }
    currentChildren.push({ type: 'text', text: cleaned });
  };

  const parseImgAttrs = (attrStr) => {
    const attrs = {};
    String(attrStr || '').replace(/([a-zA-Z0-9_-]+)\s*=\s*(['\"])(.*?)\2/g, (_, k, _q, v) => {
      attrs[k] = v;
      return '';
    });
    return attrs;
  };

  const tagRe = /<(\/)?(p|br|img)\b([^>]*)>/gi;
  let lastIndex = 0;
  let match;

  while ((match = tagRe.exec(html)) !== null) {
    const [full, closing, tagNameRaw, attrPart] = match;
    const tagName = String(tagNameRaw || '').toLowerCase();
    const index = match.index;

    // text before tag
    if (index > lastIndex) {
      pushText(html.slice(lastIndex, index));
    }

    if (tagName === 'p') {
      if (!closing) {
        currentP = { name: 'p', attrs: { style: 'margin:0 0 12px 0;line-height:1.8;' }, children: [] };
        currentChildren = currentP.children;
        nodes.push(currentP);
      } else {
        currentP = null;
        currentChildren = null;
      }
    } else if (tagName === 'br') {
      if (!currentP) {
        currentP = { name: 'p', attrs: { style: 'margin:0 0 12px 0;line-height:1.8;' }, children: [] };
        currentChildren = currentP.children;
        nodes.push(currentP);
      }
      currentChildren.push({ name: 'br' });
    } else if (tagName === 'img' && !closing) {
      if (skipImages) {
        // 跳过正文内图片：只保留顶部封面图
      } else {
        const attrs = parseImgAttrs(attrPart);
        const src = attrs.src || attrs['data-src'] || attrs['data-original'] || '';
        if (src) {
          if (!currentP) {
            currentP = { name: 'p', attrs: { style: 'margin:0 0 12px 0;line-height:1.8;' }, children: [] };
            currentChildren = currentP.children;
            nodes.push(currentP);
          }
          currentChildren.push({
            name: 'img',
            attrs: {
              src,
              style: 'max-width:100%;height:auto;display:block;margin:12px 0;border-radius:12px;'
            }
          });
        }
      }
    }

    lastIndex = index + full.length;
  }

  // trailing text
  if (lastIndex < html.length) {
    pushText(html.slice(lastIndex));
  }

  // 最后兜底清理：去掉空段落
  return nodes.filter(n => {
    if (n?.name !== 'p') return true;
    const ch = Array.isArray(n.children) ? n.children : [];
    return ch.some(c => c?.name === 'img' || c?.name === 'br' || (c?.type === 'text' && String(c.text || '').trim()));
  });
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
  return raw?.coverImage || (Array.isArray(raw?.imageUrls) ? raw.imageUrls[0] : '') || '';
}

Page({
  data: {
    id: '',
    loading: true,
    article: {},
    contentNodes: [],
    viewCount: 0,
    shareLogo: ''
  },

  async onLoad(options) {

    const id = options?.id ? decodeURIComponent(options.id) : '';
    this.setData({ id });

    if (!id) {
      wx.showToast({ title: '文章ID缺失', icon: 'none' });
      this.setData({ loading: false });
      return;
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
      const coverImage = pickCover(raw);
      const article = {
        _id: raw?._id || raw?.id || raw?.articleId || id,
        title: raw?.title || '文章详情',
        author: raw?.author || '安得褓贝',
        source: raw?.source || '',
        summary: raw?.summary || '',
        coverImage,
        publishedAtText: raw?.publishedAt ? formatDateTime(raw.publishedAt) : (raw?.createdAt ? formatDateTime(raw.createdAt) : '')
      };

      const content = pickContent(raw);
      // 有封面图时：过滤正文内图片，避免同一张图重复出现
      const contentNodes = toRichTextNodes(content, { skipImages: !!coverImage });

      this.setData({
        article,
        contentNodes
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
    const imageUrl = this.data.shareLogo || article.coverImage || '/images/default-goods-image.png';
    return {
      title,
      path: `/pages/articleDetail/index?id=${encodeURIComponent(String(id))}`,
      imageUrl
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    const article = this.data.article || {};
    const id = article._id || this.data.id || '';
    const title = article.title || '安得褓贝 · 文章';
    const imageUrl = this.data.shareLogo || article.coverImage || '/images/default-goods-image.png';
    return {
      title,
      query: `id=${encodeURIComponent(String(id))}`,
      imageUrl
    };
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
  }
});

