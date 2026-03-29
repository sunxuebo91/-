const resumeService = require('../../services/resume');
const userService = require('../../services/userService.js');

const THUMB_SIZE = 360; // 列表缩略图尺寸（像素），越小越快
const THUMB_QUALITY = 70;

// 相册页不展示的分类标题
const HIDE_SECTION_TITLES = ['证书'];

function normalizeToUrls(input) {
  const arr = Array.isArray(input) ? input : [];
  return arr
    .map((x) => {
      if (!x) return '';
      if (typeof x === 'string') return x;
      if (typeof x === 'object') return x.url || x.fileUrl || x.path || '';
      return '';
    })
    .filter(Boolean);
}

function pickFirstNonEmptyArray(data, keys) {
  for (const k of keys) {
    const v = data && data[k];
    if (Array.isArray(v) && v.length) return v;
  }
  return [];
}

function toThumbUrl(url) {
  if (!url) return '';
  const s = String(url);

  // 云开发/本地临时路径不做处理
  if (s.startsWith('cloud://') || s.startsWith('wxfile://') || s.startsWith('http://tmp') || s.startsWith('https://tmp')) {
    return s;
  }

  // 避免重复追加
  if (s.includes('imageMogr2') || s.includes('imageView2') || s.includes('x-oss-process')) {
    return s;
  }

  const joiner = s.includes('?') ? '&' : '?';

  // 腾讯云 COS / QCloud 场景（常见域名包含 myqcloud / qcloud）
  if (s.includes('myqcloud.com') || s.includes('qcloud.com') || s.includes('.cos.')) {
    return `${s}${joiner}imageMogr2/thumbnail/!${THUMB_SIZE}x${THUMB_SIZE}r/quality/${THUMB_QUALITY}/format/webp`;
  }

  // 阿里 OSS
  if (s.includes('aliyuncs.com') || s.includes('oss-')) {
    return `${s}${joiner}x-oss-process=image/resize,m_fill,w_${THUMB_SIZE},h_${THUMB_SIZE}/quality,q_${THUMB_QUALITY}/format,webp`;
  }

  // 七牛
  if (s.includes('qiniu') || s.includes('qiniucdn') || s.includes('clouddn')) {
    return `${s}${joiner}imageView2/1/w/${THUMB_SIZE}/h/${THUMB_SIZE}/q/${THUMB_QUALITY}/format/webp`;
  }

  // 兜底：不确定处理规则时保持原图
  return s;
}

function buildItems(urls) {
  const list = Array.isArray(urls) ? urls : [];
  const seen = new Set();
  return list
    .filter(Boolean)
    .filter((u) => {
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    })
    .map((u) => ({ url: u, thumb: toThumbUrl(u) }));
}

function shouldHideTitle(title) {
  const t = (title || '').toString().trim();
  if (!t) return false;
  return HIDE_SECTION_TITLES.some((x) => x === t);
}

Page({
  data: {
    id: '',
    loading: true,
    sections: []
  },

  onLoad(options) {
    const id = options && options.id;
    this.setData({ id: id ? String(id) : '' });
    this.loadAlbum();
  },

  async loadAlbum() {
    const id = this.data.id;
    if (!id) {
      this.setData({ loading: false, sections: [] });
      wx.showToast({ title: '简历ID缺失', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const resp = await resumeService.getResumeDetailMiniprogram(id);
      const data = (resp && resp.success && resp.data) ? resp.data : {};

      // 1) 如果后端直接返回了按分类组织的数据（兼容多种字段名）
      const albums = Array.isArray(data.albums) ? data.albums : (Array.isArray(data.album) ? data.album : []);
      if (albums.length) {
        const sections = albums
          .map((a) => {
            const title = a.name || a.title || a.categoryName || a.category || '未分类';
            const urls = normalizeToUrls(a.photos || a.files || a.list || a.items);
            const items = buildItems(urls);
            return { title, items };
          })
          .filter((x) => x.items && x.items.length)
          .filter((x) => !shouldHideTitle(x.title));

        this.setData({ sections, loading: false });
        return;
      }

      // 2) 兜底：按简历详情里常见的“多相册字段”拼装分类
      const sectionsSpec = [
        { title: '个人照片', keys: ['personalPhoto', 'photoFiles', 'photos'] },
        { title: '月子餐', keys: ['confinementMealPhotos', 'confinementMealPhoto', 'confinementMealFiles'] },
        { title: '烹饪', keys: ['cookingPhotos', 'cookingPhoto', 'cookingFiles'] },
        { title: '辅食', keys: ['complementaryFoodPhotos', 'complementaryFoodPhoto', 'complementaryFoodFiles'] },
        { title: '好评展示', keys: ['positiveReviewPhotos', 'positiveReviewPhoto', 'positiveReviewFiles'] },
        // { title: '证书', keys: ['certificates', 'certificateFiles'] }, // 按需求隐藏
        { title: '体检报告', keys: ['reports', 'medicalReportFiles', 'medicalReports'] }
      ];

      const sections = sectionsSpec
        .map((spec) => {
          const raw = pickFirstNonEmptyArray(data, spec.keys);
          const urls = normalizeToUrls(raw);
          const items = buildItems(urls);
          return { title: spec.title, items };
        })
        .filter((x) => x.items.length)
        .filter((x) => !shouldHideTitle(x.title));

      this.setData({ sections, loading: false });
    } catch (e) {
      console.error('相册加载失败', e);
      this.setData({ loading: false, sections: [] });
      wx.showToast({ title: '相册加载失败', icon: 'none' });
    }
  },

  onPullDownRefresh() {
    this.loadAlbum().finally(() => wx.stopPullDownRefresh());
  },

  onTapPhoto(e) {
    const sectionIndex = Number(e.currentTarget.dataset.sectionIndex || 0);
    const url = e.currentTarget.dataset.url;
    const sections = this.data.sections || [];
    const currentSection = sections[sectionIndex] || {};
    const urls = (currentSection.items || []).map((x) => x.url).filter(Boolean);
    if (!url || !urls.length) return;

    wx.previewImage({
      current: url,
      urls
    });
  }
});
