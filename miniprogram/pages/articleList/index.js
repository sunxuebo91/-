const articleService = require('../../services/article.js');
const userService = require('../../services/userService.js');

// 提取图片 URL（兼容字符串/对象/数组）
function normalizeImageUrl(input) {
  if (!input) return '';
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    for (const v of input) {
      const u = normalizeImageUrl(v);
      if (u) return u;
    }
    return '';
  }
  if (typeof input === 'object') {
    return input.url || input.fileUrl || input.path || input.src || '';
  }
  return '';
}

function safeParseJsonArray(str) {
  try {
    const s = String(str || '').trim();
    if (!s) return null;
    if (!s.startsWith('[') || !s.endsWith(']')) return null;
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const jsonArr = safeParseJsonArray(value);
    if (jsonArr) return jsonArr;
    return value.split(/[，,\s/|]+/).map(s => String(s || '').trim()).filter(Boolean);
  }
  return [value];
}

const STOP_TAGS = new Set([
  '安得褓贝', '安得', '褓贝分享', '分享', '文章', '资讯', '原创', '推荐', '精选', '默认',
  'null', 'undefined', '无', '暂无', '其他'
]);

const CANONICAL_TAG_DEFS = [
  { tag: '备孕好孕', patterns: [/备孕|好孕|孕前|叶酸|排卵|受孕|优生|孕前检查|备孕调理|备孕饮食|验孕|怀孕准备/] },
  { tag: '孕期呵护', patterns: [/孕期|孕妇|产检|胎动|唐筛|四维|B超|妊娠|孕早期|孕中期|孕晚期|孕周|孕吐|胎教|孕期饮食|孕期运动|孕期不适/] },
  { tag: '产后恢复', patterns: [/产后|月子|坐月子|产褥|哺乳|母乳|催乳|月子餐|产后恢复|产后修复|产后抑郁|开奶|追奶|堵奶|盆底肌|腹直肌|恶露/] },
  { tag: '新生儿养护', patterns: [/新生儿|0-3个月|0-3 月|满月|月龄|百天|脐带护理|拍嗝|黄疸|肠胀气|红屁屁|新生儿喂养|混合喂养|奶粉喂养|母乳喂养/] },
  { tag: '婴幼护理', patterns: [/婴幼儿|4个月|4-6个月|6-12个月|1岁|2岁|3岁|辅食|添加辅食|断奶|米粉|果泥|如厕训练|口腔护理|湿疹|积食|腹泻|感冒|安全防护|生长发育|身高体重/] },
  { tag: '亲子早教', patterns: [/早教|启蒙|亲子|互动游戏|绘本|感统|专注力|语言启蒙|大运动|精细运动|好习惯培养|玩具选择|行为解读/] }
];

const PREFERRED_TAG_ORDER = [
  '备孕好孕', '孕期呵护', '产后恢复', '新生儿养护', '婴幼护理', '亲子早教',
  '未分类'
];


function normalizeRawTag(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';

  // 过滤明显噪声
  if (s.length > 12) return '';
  if (/^https?:\/\//i.test(s)) return '';
  if (/^[\d\W_]+$/.test(s)) return '';

  // 统一大小写
  const lower = s.toLowerCase();
  if (STOP_TAGS.has(s) || STOP_TAGS.has(lower)) return '';

  // 归一化常见同义
  s = s
    .replace(/孕中|孕期中/g, '孕期呵护')
    .replace(/孕早期|孕中期|孕晚期/g, '孕期呵护')
    .replace(/孕中/g, '孕期呵护')
    .replace(/产后恢复|产后修复|月子护理|坐月子/g, '产后恢复')
    .replace(/育儿知识|育儿经验|育儿/g, '婴幼护理')
    .replace(/早教|启蒙/g, '亲子早教')
    .replace(/新生儿护理|新生儿/g, '新生儿养护')
    .replace(/备孕|孕前/g, '备孕好孕');


  // 尝试映射到规范标签
  const canonical = toCanonicalTag(s);
  return canonical || '';
}

function toCanonicalTag(text) {
  const t = String(text || '').trim();
  if (!t) return '';

  // 直接命中
  const direct = CANONICAL_TAG_DEFS.find(d => d.tag === t);
  if (direct) return direct.tag;

  // 正则命中
  for (const def of CANONICAL_TAG_DEFS) {
    for (const p of def.patterns) {
      if (p.test(t)) return def.tag;
    }
  }

  return '';
}

function scoreByText(def, title, summary) {
  let score = 0;
  for (const p of def.patterns) {
    if (p.test(title)) score += 6;
    if (p.test(summary)) score += 3;
  }
  return score;
}

function extractCanonicalTags(article = {}) {
  // 1) 结构化字段优先（但只收敛到规范标签，避免脏标签污染导航）
  const rawSources = [
    article.tags,
    article.tag,
    article.tagNames,
    article.labels,
    article.label,
    article.categories,
    article.category,
    article.categoryName,
    article.columns,
    article.columnName,
    article.topics,
    article.topic,
    article.type,
    article.scene,
    article.keyword,
    article.keywords
  ];

  const structured = [];
  rawSources.forEach((src) => {
    toArray(src).forEach((t) => {
      const normalized = normalizeRawTag(t);
      if (normalized) structured.push(normalized);
    });
  });

  const structuredSet = new Set(structured);

  // 2) 标题/摘要推断（避免用 content：列表接口通常不带全文，且成本高）
  const title = String(article.title || '').trim();
  const summary = String(article.summary || '').trim();

  const scores = new Map();
  CANONICAL_TAG_DEFS.forEach((def) => {
    const s = scoreByText(def, title, summary);
    if (s > 0) scores.set(def.tag, s);
  });

  // 3) 将结构化标签作为强信号加权
  structuredSet.forEach((t) => {
    scores.set(t, (scores.get(t) || 0) + 20);
  });

  // 4) 选主标签+副标签（最多 2 个），并保持稳定顺序
  const sorted = Array.from(scores.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return PREFERRED_TAG_ORDER.indexOf(a[0]) - PREFERRED_TAG_ORDER.indexOf(b[0]);
    })
    .map(([tag]) => tag);

  const result = [];
  if (sorted.length) {
    result.push(sorted[0]);
    // 只在分数足够接近时，保留一个副标签，减少“乱贴标签”
    if (sorted.length > 1) {
      const firstScore = scores.get(sorted[0]) || 0;
      const secondScore = scores.get(sorted[1]) || 0;
      if (secondScore >= Math.max(10, Math.floor(firstScore * 0.5))) {
        result.push(sorted[1]);
      }
    }
  }

  if (!result.length) {
    result.push('未分类');
  }

  return result;
}

Page({
  data: {
    allArticles: [], // 原始列表（用于过滤）
    articles: [],    // 展示列表
    loading: false,
    page: 1,
    pageSize: 10,
    hasMore: true,
    total: 0,
    tags: ['全部'],
    activeTag: '全部',
    keyword: ''
  },

  onLoad() {
    this.loadArticles({ reset: true });
  },

  onPullDownRefresh() {
    this.loadArticles({ reset: true }).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    this.loadArticles();
  },

  // 跳转到文章详情
  goArticleDetail(e) {
    const id = e?.currentTarget?.dataset?.id;
    if (!id) {
      wx.showToast({ title: '文章ID缺失', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/articleDetail/index?id=${encodeURIComponent(String(id))}`
    });
  },

  onTagTap(e) {
    const tag = e?.currentTarget?.dataset?.tag;
    if (!tag) return;
    this.setData({ activeTag: tag });
    this.applyFilters();
  },

  onSearchInput(e) {
    const keyword = e?.detail?.value || '';
    this.setData({ keyword });
    this.applyFilters();
  },

  onSearchConfirm(e) {
    const keyword = e?.detail?.value || '';
    this.setData({ keyword });
    this.applyFilters();
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this.applyFilters();
  },

  buildTagList() {
    return ['全部', ...PREFERRED_TAG_ORDER.filter(t => t !== '未分类'), '未分类'];
  },


  applyFilters() {
    const keyword = String(this.data.keyword || '').trim().toLowerCase();
    const activeTag = this.data.activeTag;

    const filtered = this.data.allArticles.filter((a) => {
      const tags = Array.isArray(a.tags) ? a.tags : [];
      const primary = a.primaryTag || tags[0];

      const matchTag = activeTag === '全部' || primary === activeTag || tags.includes(activeTag);
      if (!matchTag) return false;

      if (!keyword) return true;
      const pool = [a.title, a.summary, a.author]
        .map((v) => String(v || '').toLowerCase());
      return pool.some((v) => v.includes(keyword));
    });

    this.setData({ articles: filtered });
  },

  async loadArticles(options = {}) {
    const { reset = false } = options;

    if (this.data.loading) return;
    if (!this.data.hasMore && !reset) return;

    const page = reset ? 1 : this.data.page;
    const pageSize = this.data.pageSize;

    this.setData({ loading: true });

    try {
      const resp = await articleService.getArticleList({ page, pageSize });
      if (!resp || !resp.success || !resp.data) {
        wx.showToast({ title: resp?.message || '获取文章失败', icon: 'none' });
        return;
      }

      const articles = resp.data.items || resp.data.list || [];
      const total = resp.data.total || resp.data.totalCount || resp.data.count || resp.data?.pagination?.total || 0;

      // 取 ID 用于阅读量
      const getArticleId = (a) => a?._id || a?.id || a?.articleId || a?.article_id;
      const articleIds = articles
        .map(a => getArticleId(a))
        .filter(id => id !== undefined && id !== null && String(id).trim() !== '')
        .map(id => String(id));

      let viewCountMap = {};
      try {
        viewCountMap = await articleService.batchGetViewCounts(articleIds);
      } catch (err) {
        console.error('获取阅读量失败，使用默认值0:', err);
      }

      const formatted = articles.map(article => {
        const articleId = getArticleId(article);
        const normalizedId = (articleId !== undefined && articleId !== null) ? String(articleId) : '';
        const viewCount = normalizedId ? (viewCountMap[normalizedId] || 0) : 0;

        let coverImage = normalizeImageUrl(article.imageUrls);
        if (!coverImage) {
          coverImage = normalizeImageUrl(article.coverImage);
        }
        if (!coverImage) {
          const content = article.content || article.contentHtml || article.htmlContent || article.contentRaw || '';
          if (content) {
            const imgMatch = content.match(/<img[^>]+?(?:src|data-src|data-original)=["']([^"']+)["']/i);
            if (imgMatch && imgMatch[1]) {
              coverImage = imgMatch[1];
            }
          }
        }
        if (coverImage && /^http:\/\//i.test(coverImage)) {
          coverImage = coverImage.replace(/^http:\/\//i, 'https://');
        }

        // 优先使用后端返回的标签（AI 分类结果）
        let tags = [];
        if (article.tags && Array.isArray(article.tags) && article.tags.length > 0) {
          // 后端已经分类好了，直接使用
          tags = article.tags.filter(t =>
            ['备孕好孕', '孕期呵护', '产后恢复', '新生儿养护', '婴幼护理', '亲子早教'].includes(t)
          );
        }

        // 如果后端没有标签，使用前端简化分类
        if (tags.length === 0) {
          tags = extractCanonicalTags(article);
        }

        const primaryTag = tags[0] || '未分类';

        return {
          _id: normalizedId,
          title: article.title || '无标题',
          author: article.author || '安得褓贝',
          coverImage,
          viewCount,
          summary: article.summary || '',
          tags,
          primaryTag,
          displayTags: tags.slice(0, 1)  // 只显示1个标签
        };
      });

      const articlesWithCovers = await this.resolveCoverImages(formatted);

      const merged = reset ? articlesWithCovers : this.data.allArticles.concat(articlesWithCovers);
      const hasMore = total
        ? merged.length < total
        : articlesWithCovers.length === pageSize;

      const tags = this.buildTagList(merged);

      // activeTag 若不在导航里，回退到“全部”
      const activeTag = tags.includes(this.data.activeTag) ? this.data.activeTag : '全部';

      this.setData({
        allArticles: merged,
        tags,
        page: page + 1,
        hasMore,
        total: total || merged.length,
        activeTag
      });
      this.applyFilters();
    } catch (err) {
      console.error('加载文章列表异常:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 处理 cloud:// 封面图
  async resolveCoverImages(list = []) {
    const fileIds = Array.from(
      new Set(
        list
          .map((a) => a.coverImage)
          .filter((u) => u && typeof u === 'string' && u.startsWith('cloud://'))
      )
    );
    if (!fileIds.length) return list;

    try {
      const res = await wx.cloud.getTempFileURL({ fileList: fileIds });
      const map = {};
      (res?.fileList || []).forEach((item) => {
        if (item.fileID && item.tempFileURL) {
          map[item.fileID] = item.tempFileURL;
        }
      });
      return list.map((a) => ({
        ...a,
        coverImage: map[a.coverImage] || a.coverImage
      }));
    } catch (err) {
      console.error('封面图转临时链接失败，使用原图:', err);
      return list;
    }
  }
});
