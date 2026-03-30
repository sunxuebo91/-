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
    contentNodes: [],
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
    this.setData({ id });

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
        summary: raw?.summary || '',
        coverImage,
        publishedAtText: raw?.publishedAt ? formatDateTime(raw.publishedAt) : (raw?.createdAt ? formatDateTime(raw.createdAt) : '')
      };

      const content = pickContent(raw);
      // 只有当有独立封面图字段时才过滤正文图片，避免重复
      // 如果封面图是从HTML提取的，则保留正文中的所有图片
      const contentNodes = toRichTextNodes(content, { skipImages: hasExplicitCover });

      // 小红书风格：提取多图
      const images = this.extractImages(raw);
      console.log('📸 提取到的图片数组:', images);

      this.setData({
        article,
        contentNodes,
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

    // 获取分享者信息
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const localName = wx.getStorageSync('userName') || '';
    const localPhone = wx.getStorageSync('userPhone') || '';
    const localAvatar = wx.getStorageSync('userAvatar') || '';
    const sharerName = localName || crmUserInfo.nickname || crmUserInfo.name || '安得褓贝顾问';
    const sharerPhone = crmUserInfo.phone || localPhone || '';
    const sharerAvatar = localAvatar || crmUserInfo.avatarUrl || crmUserInfo.avatar || '';
    const sharerCompany = '安得褓贝';
    const sharerId = crmUserInfo._id || crmUserInfo.id || crmUserInfo.userId || wx.getStorageSync('userId') || '';

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

    // 获取分享者信息
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const localName = wx.getStorageSync('userName') || '';
    const localPhone = wx.getStorageSync('userPhone') || '';
    const localAvatar = wx.getStorageSync('userAvatar') || '';
    const sharerName = localName || crmUserInfo.nickname || crmUserInfo.name || '安得褓贝顾问';
    const sharerPhone = crmUserInfo.phone || localPhone || '';
    const sharerAvatar = localAvatar || crmUserInfo.avatarUrl || crmUserInfo.avatar || '';
    const sharerCompany = '安得褓贝';
    const sharerId = crmUserInfo._id || crmUserInfo.id || crmUserInfo.userId || wx.getStorageSync('userId') || '';

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

