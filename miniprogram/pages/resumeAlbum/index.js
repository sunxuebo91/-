const resumeService = require('../../services/resume');
const userService = require('../../services/userService.js');

const THUMB_SIZE = 360; // 列表缩略图尺寸（像素），越小越快
const THUMB_QUALITY = 70;

// 相册页不展示的分类标题
const HIDE_SECTION_TITLES = ['证书'];

function normalizeToUrls(input) {
  // 兼容嵌套 { files: [...] } 结构
  if (input && typeof input === 'object' && !Array.isArray(input) && Array.isArray(input.files)) {
    input = input.files;
  }
  const arr = Array.isArray(input) ? input : (input ? [input] : []);
  return arr
    .map((x) => {
      if (!x) return '';
      if (typeof x === 'string') return x;
      if (typeof x === 'object') {
        // 优先检查所有常见 URL 属性名（含 COS 系统常用的 cosUrl）
        const knownUrl = x.url || x.fileUrl || x.fileURL || x.cosUrl || x.path || x.src || x.imagePath || x.filePath || x.downloadUrl || x.accessUrl || '';
        if (knownUrl) return knownUrl;
        // 兜底：扫描对象里第一个看起来像 https 链接的字符串属性
        const vals = Object.values(x);
        for (const v of vals) {
          if (typeof v === 'string' && (v.startsWith('https://') || v.startsWith('http://'))) return v;
        }
      }
      return '';
    })
    .filter(Boolean);
}

function pickFirstNonEmptyArray(data, keys) {
  for (const k of keys) {
    const v = data && data[k];
    // 兼容数组和单个对象/字符串
    if (Array.isArray(v) && v.length) return v;
    if (v && !Array.isArray(v)) return [v]; // 单值包装成数组
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

      // 诊断：完整打印 CRM 返回的所有字段及与照片相关字段的值
      const allKeys = Object.keys(data || {});
      console.log('📸 [相册页] CRM 全部字段名:', allKeys);
      // 打印所有可能是"照片"的字段
      const photoKeyGuesses = ['personalPhoto','personalPhotos','photoFiles','photos','photoUrls',
        'uniformPhoto','albums','album','workPhotos','employeePhotos','personal_photo'];
      photoKeyGuesses.forEach(k => {
        if (data[k] !== undefined) console.log(`📸 [相册页] data.${k}:`, JSON.stringify(data[k]).slice(0, 300));
      });
      // 打印所有值是数组且不为空的字段（帮助发现未预期的字段名）
      allKeys.forEach(k => {
        const v = data[k];
        if (Array.isArray(v) && v.length > 0 && !['skills','tags','workExperiences','certificates','reports'].includes(k)) {
          console.log(`📸 [相册页] 非空数组字段 data.${k} (${v.length}项):`, JSON.stringify(v[0]).slice(0, 200));
        }
      });

      // 1) 如果后端直接返回了按分类组织的数据（兼容多种字段名）
      const albums = Array.isArray(data.albums) ? data.albums : (Array.isArray(data.album) ? data.album : []);
      if (albums.length) {
        console.log('📸 [相册页] 使用 albums 数据，共', albums.length, '个分类');
        albums.forEach((a, idx) => {
          const rawPhotos = a.photos || a.files || a.list || a.items;
          console.log(`📸 [相册页] albums[${idx}]:`, {
            name: a.name || a.title || a.categoryName || a.category,
            rawPhotosType: Array.isArray(rawPhotos) ? 'array' : typeof rawPhotos,
            rawPhotosLength: Array.isArray(rawPhotos) ? rawPhotos.length : 0,
            rawPhotos: rawPhotos
          });
        });

        // 记录 albums 中已有的所有 URL，避免与个人照片重复
        const albumUrlSet = new Set();
        const sections = albums
          .map((a) => {
            const title = a.name || a.title || a.categoryName || a.category || '未分类';
            const urls = normalizeToUrls(a.photos || a.files || a.list || a.items);
            urls.forEach((u) => albumUrlSet.add(u));
            console.log(`📸 [相册页] 分类 "${title}" 解析出 ${urls.length} 个 URL:`, urls);
            const items = buildItems(urls);
            return { title, items };
          })
          .filter((x) => x.items && x.items.length)
          .filter((x) => !shouldHideTitle(x.title));

        // albums 数组可能只包含部分分类，平铺字段里的照片需逐一补充（去重）
        const supplementSpecs = [
          {
            title: '个人照片',
            collect: () => {
              const all = [
                ...normalizeToUrls(data.personalPhoto),
                ...normalizeToUrls(data.photoUrls),
                ...normalizeToUrls(data.photoFiles),
                ...normalizeToUrls(data.uniformPhoto),
              ];
              if (data.avatarUrl && typeof data.avatarUrl === 'string') all.push(data.avatarUrl);
              return all;
            },
            prepend: true // 个人照片置顶
          },
          { title: '月子餐',   collect: () => normalizeToUrls(data.confinementMealPhotos   || data.confinementMealPhotoUrls) },
          { title: '烹饪',     collect: () => normalizeToUrls(data.cookingPhotos            || data.cookingPhotoUrls) },
          { title: '辅食',     collect: () => normalizeToUrls(data.complementaryFoodPhotos  || data.complementaryFoodPhotoUrls) },
          { title: '好评展示', collect: () => normalizeToUrls(data.positiveReviewPhotos     || data.positiveReviewPhotoUrls) },
          { title: '体检报告', collect: () => normalizeToUrls(data.reports                  || data.medicalReportUrls) },
        ];

        supplementSpecs.forEach(({ title, collect, prepend }) => {
          const urls = [...new Set(collect())].filter((u) => u && !albumUrlSet.has(u));
          if (!urls.length) return;
          // 已有同名分类则追加图片，否则新增分类
          const existing = sections.find((s) => s.title === title);
          if (existing) {
            existing.items.push(...buildItems(urls));
          } else {
            const section = { title, items: buildItems(urls) };
            if (prepend) sections.unshift(section);
            else sections.push(section);
          }
          console.log(`📸 [相册页] 补充 "${title}" ${urls.length} 张（albums 未包含）`);
        });

        console.log('📸 [相册页] 最终 sections:', sections.map(s => ({ title: s.title, count: s.items.length })));
        this.setData({ sections, loading: false });
        return;
      }

      // 个人照片需合并多个字段（CRM 把照片分散存到 personalPhoto / photoUrls / uniformPhoto / avatarUrl）
      const _personalAll = [
        ...normalizeToUrls(data.personalPhoto),
        ...normalizeToUrls(data.photoUrls),
        ...normalizeToUrls(data.photoFiles),
        ...normalizeToUrls(data.uniformPhoto),
      ];
      if (data.avatarUrl && typeof data.avatarUrl === 'string') _personalAll.push(data.avatarUrl);
      const _personalUrls = [...new Set(_personalAll)].filter(Boolean);

      // 2) 兜底：按简历详情里常见的“多相册字段”拼装分类
      const sectionsSpec = [
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
          console.log(`📸 [相册页] 兜底 "${spec.title}" raw:`, raw);
          const urls = normalizeToUrls(raw);
          console.log(`📸 [相册页] 兜底 "${spec.title}" urls:`, urls);
          const items = buildItems(urls);
          return { title: spec.title, items };
        })
        .filter((x) => x.items.length)
        .filter((x) => !shouldHideTitle(x.title));

      // 个人照片置顶（使用已合并的 _personalUrls，去掉与其他分类重复的图）
      if (_personalUrls.length) {
        sections.unshift({ title: '个人照片', items: buildItems(_personalUrls) });
      }


      console.log('📸 [相册页] 兜底 最终 sections:', sections.map(s => ({ title: s.title, count: s.items.length })));
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
