const resumeService = require('../../services/resume.js');
const employeeEvaluationService = require('../../services/employeeEvaluation.js');

// 简历详情页视频缓存（用于提升手机端二次打开速度；非 Wi-Fi 不强制预下载）
const VIDEO_CACHE_KEY = 'resumeDetailVideoCache_v1';
const VIDEO_CACHE_MAX = 8;


// 数据字典
const JOB_TYPE_MAP = {
  'yuexin': '月嫂',
  'zhujia-yuer': '住家育儿嫂',
  'baiban-yuer': '白班育儿嫂',
  'baojie': '保洁',
  'baiban-baomu': '白班保姆',
  'zhujia-baomu': '住家保姆',
  'yangchong': '养宠',
  'xiaoshi': '小时工',
  'zhujia-hulao': '住家护老'
};

const EDUCATION_MAP = {
  'no': '无学历',
  'primary': '小学',
  'middle': '初中',
  'secondary': '中专',
  'vocational': '职高',
  'high': '高中',
  'college': '大专',
  'bachelor': '本科',
  'graduate': '研究生'
};

const MATERNITY_LEVEL_MAP = {
  'junior': '初级月嫂',
  'silver': '银牌月嫂',
  'gold': '金牌月嫂',
  'platinum': '铂金月嫂',
  'diamond': '钻石月嫂',
  'crown': '皇冠月嫂'
};

const ORDER_STATUS_MAP = {
  'available': '可接单',
  'busy': '忙碌中',
  'unavailable': '暂不接单'
};

// 区域映射表
const DISTRICT_MAP = {
  'dongcheng': '东城区',
  'xicheng': '西城区',
  'chaoyang': '朝阳区',
  'fengtai': '丰台区',
  'shijingshan': '石景山区',
  'haidian': '海淀区',
  'mentougou': '门头沟区',
  'fangshan': '房山区',
  'tongzhou': '通州区',
  'shunyi': '顺义区',
  'changping': '昌平区',
  'daxing': '大兴区',
  'huairou': '怀柔区',
  'pinggu': '平谷区',
  'miyun': '密云区',
  'yanqing': '延庆区'
};

// 技能映射表（来自 API: GET /api/resumes/enums）
const SKILLS_MAP = {
  'chanhou': '产后修复师',
  'teshu-yinger': '特殊婴儿护理',
  'yiliaobackground': '医疗背景',
  'yuying': '高级育婴师',
  'zaojiao': '早教师',
  'fushi': '辅食营养师',
  'ertui': '小儿推拿师',
  'waiyu': '外语',
  'zhongcan': '中餐',
  'xican': '西餐',
  'mianshi': '面食',
  'jiashi': '驾驶',
  'shouyi': '整理收纳',
  'muying': '母婴护理师',
  'cuiru': '高级催乳师',
  'yuezican': '月子餐营养师',
  'yingyang': '营养师',
  'liliao-kangfu': '理疗康复',
  'shuangtai-huli': '双胎护理',
  'yanglao-huli': '养老护理'
};

// 评价类型映射表
const EVALUATION_TYPE_MAP = {
  'daily': '日常评价',
  'monthly': '月度评价',
  'contract_end': '合同结束评价',
  'special': '特殊评价'
};

/**
 * 格式化日期为 YYYY-MM（只显示年月）
 */
function formatDateYearMonth(dateStr) {
  if (!dateStr) return '';

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    return `${year}-${month}`;
  } catch (e) {
    console.error('日期格式化失败:', dateStr, e);
    return dateStr;
  }
}

/**
 * 转换区域代码为中文名称
 */
function formatDistrict(district) {
  if (!district) return '';

  // 如果已经是中文，直接返回
  if (/[\u4e00-\u9fa5]/.test(district)) {
    return district;
  }

  // 转换拼音为中文
  return DISTRICT_MAP[district.toLowerCase()] || district;
}

// 推荐理由：生成“默认 TopN + 展开/收起”的视图数据，并让每行左右对齐铺满
function buildRecommendationView(tagsAll, expanded, limit, itemsPerRow = 3) {
  const all = Array.isArray(tagsAll) ? tagsAll : [];
  const total = all.length;
  const hasMore = total > limit;
  const visibleBase = expanded ? all : (hasMore ? all.slice(0, limit) : all);
  const visible = visibleBase.map((x) => ({ ...x }));

  // 12 列 grid，默认一行 3 个（每个 4 列）；最后一行按剩余数均分（2 个->6 列，1 个->12 列）
  const perRow = Math.max(1, Number(itemsPerRow) || 3);
  const baseSpan = Math.floor(12 / perRow) || 4;

  visible.forEach((x) => {
    x._gridSpan = baseSpan;
  });

  const remainder = visible.length % perRow;
  if (remainder !== 0) {
    const span = remainder === 1 ? 12 : Math.floor(12 / remainder);
    const start = visible.length - remainder;
    for (let i = start; i < visible.length; i += 1) {
      visible[i]._gridSpan = span;
    }
  }

  return {
    total,
    hasMore,
    hiddenCount: Math.max(0, total - visibleBase.length),
    visible
  };
}

const SHARE_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得最新合同/安得褓贝定稿.jpg';

Page({
  onHide() {
    this.pauseHeroVideo();
  },

  onUnload() {
    this.pauseHeroVideo();
  },

  onShow() {
    // 检查是否有待处理的客服联系请求（登录后自动调起客服）
    this.checkPendingContact();
  },

  data: {

    id: "",
    loaded: false,
    detail: {},


    // 推荐理由展示（默认 TopN + 展开/收起）
    recommendationExpanded: false,
    recommendationDefaultLimit: 8,
    recommendationTotalCount: 0,
    recommendationHiddenCount: 0,
    recommendationHasMore: false,
    recommendationVisibleTags: [],

    // 员工评价数据
    evaluations: {
      statistics: null,  // 评价统计
      list: [],          // 评价列表
      hasMore: false     // 是否有更多评价
    },

    // 顶部视频状态
    heroVideoMuted: true,
    heroShowCenterPlayBtn: true,  // 默认显示播放按钮，等待用户点击
    heroVideoLoading: false,  // 视频加载状态

    // 主媒体区显示状态：video/image
    heroMediaType: 'video',
    // heroMediaType=image 时显示的图片
    heroSelectedImage: '',
    // 底部缩略图数据（有视频时会跳过第1张个人照，避免与视频缩略图重复）
    heroThumbPhotos: [],
    // 固定展示的中间缩略图（最多 3 张），用于两端固定时做等距排布
    heroThumbPhotosPreview: [],
    // 媒体总数量（视频+照片）
    heroTotalMediaCount: 0,

    // 证书（用于"获取证书"票券展示）
    certTicketsAll: [],
    certTicketsShowSwipeHint: false,
    // 分享 LOGO 临时链接
    shareLogo: ''
  },




  onLoad(options) {
    this.setData({ id: options.id || "" });

    // 预取分享 LOGO 的临时链接
    this.loadShareLogo();

    console.log('📄 详情页加载, ID:', options.id);

    // 尝试从列表页获取预加载的视频路径
    const pages = getCurrentPages();

    console.log('📚 当前页面栈:', pages.length, '层');

    if (pages.length >= 2) {
      const prevPage = pages[pages.length - 2];
      console.log('📄 上一页路由:', prevPage.route);

      if (prevPage.route === 'pages/resumeList/index') {
        console.log('📋 列表页简历数量:', prevPage.data.resumes.length);
        const resume = prevPage.data.resumes.find(r => r._id === options.id);

        if (resume) {
          console.log('✅ 找到简历:', resume.name);
          console.log('📹 视频本地路径:', resume.videoLocalPath || '无');

          if (resume.videoLocalPath) {
            console.log('🎉 使用列表页预加载的视频:', resume.videoLocalPath);
            this.preloadedVideoPath = resume.videoLocalPath;
          } else {
            console.log('⚠️ 简历没有预加载视频路径');
          }
        } else {
          console.log('❌ 在列表页未找到该简历');
        }
      }
    }

    this.loadDetail();
  },

  async loadDetail() {
    const id = this.data.id;
    console.log('📄 开始加载简历详情, id:', id, 'id长度:', id ? id.length : 0);

    if (!id) {
      console.error('📄 简历ID为空');
      wx.showToast({ title: "简历ID不能为空", icon: "none" });
      this.setData({ loaded: true });
      return;
    }

    try {
      // 使用 CRM API 获取简历详情
      const resp = await resumeService.getResumeDetailMiniprogram(id);
      console.log('📄 简历详情API响应:', resp);

      // CRM API 响应格式: { success: true, data: {...}, message: "..." }
      if (resp.success) {
        const data = resp.data || {};
        console.log('📄 星座字段检查:', {
          birthDate: data.birthDate,
          constellation: data.constellation,
          constellationText: data.constellationText,
          starSign: data.starSign,
          star_sign: data.star_sign
        });


        // 转换数据格式以兼容现有页面
        // 兼容不同后端字段：优先取接口返回的 id/_id，其次回退到页面入参 id
        const resumeId = String(
          data.id ??
          data._id ??
          data.resumeId ??
          data.resume_id ??
          this.data.id ??
          ''
        );

        const normalizeFileUrls = (input) => {
          const arr = Array.isArray(input) ? input : [];
          return arr
            .map((x) => {
              if (!x) return '';
              if (typeof x === 'string') return x;
              if (typeof x === 'object') return x.url || x.fileUrl || x.path || '';
              return '';
            })
            .filter(Boolean);
        };

        const personalPhotoUrls = normalizeFileUrls(data.personalPhoto);

        const detail = {
          _id: resumeId,
          resumeNoText: resumeId ? resumeId.slice(-8) : '00000000',
          name: data.name,
          phone: data.phone,
          age: data.age,
          gender: data.gender === 'female' ? '女' : '男',
          jobType: data.jobType,
          jobTypeText: JOB_TYPE_MAP[data.jobType] || data.jobType,
          education: data.education,
          educationText: EDUCATION_MAP[data.education] || data.education,
          experienceYears: data.experienceYears,
          // 基本信息字段（接口可能字段名不一致，这里做兼容）
          zodiacText: data.zodiacText ?? data.zodiac ?? data.chineseZodiac ?? data.chinese_zodiac ?? '',
          constellationText: data.constellationText ?? data.constellation ?? data.zodiacSign ?? data.starSign ?? data.star_sign ?? data.starsign ?? '',
          nationText: data.nationText ?? data.nation ?? data.ethnicity ?? data.ethnic ?? data.nationality ?? '',
          nativePlace: data.nativePlace ?? data.native_place ?? data.originPlace ?? data.origin_place ?? '',
          selfIntroduction: data.selfIntroduction,


          intro: data.selfIntroduction,
          wechat: data.wechat,
          currentAddress: data.currentAddress,
          city: data.currentAddress || data.nativePlace,
          hukouAddress: data.hukouAddress,
          birthDate: data.birthDate,
          skills: data.skills || [],
          skillsText: (data.skills || []).map(s => SKILLS_MAP[s] || s),
          tags: (data.skills || []).map(s => SKILLS_MAP[s] || s),
          serviceArea: data.serviceArea || [],
          expectedSalary: data.expectedSalary,
          priceMonth: data.expectedSalary,
          maternityNurseLevel: data.maternityNurseLevel,
          maternityNurseLevelText: MATERNITY_LEVEL_MAP[data.maternityNurseLevel] || data.maternityNurseLevel,
          orderStatus: data.orderStatus,
          orderStatusText: ORDER_STATUS_MAP[data.orderStatus] || data.orderStatus,
          learningIntention: data.learningIntention,
          currentStage: data.currentStage,

          // 推荐理由标签（来自客户评价和内部员工评价的自动提取）
          // 展示策略：默认展示 TopN（详情页 8 个），可“展开/收起”；Top1-3 做强调分层。
          recommendationTags: (() => {
            const raw = Array.isArray(data.recommendationTags) ? data.recommendationTags : [];

            const tags = raw
              .map((t, idx) => {
                const obj = (t && typeof t === 'object') ? t : { tag: String(t || '') };
                const tag = (obj.tag ?? obj.text ?? obj.name ?? obj.label ?? '').toString().trim();
                const count = obj.count ?? obj.freq ?? obj.weight;
                if (!tag) return null;
                return {
                  ...obj,
                  tag,
                  count,
                  _rawIndex: idx
                };
              })
              .filter(Boolean);

            const hasNumericCount = tags.some((x) => x.count !== undefined && x.count !== null && x.count !== '' && !isNaN(Number(x.count)));
            if (hasNumericCount) {
              tags.sort((a, b) => {
                const ca = Number(a.count) || 0;
                const cb = Number(b.count) || 0;
                if (cb !== ca) return cb - ca;
                return (a._rawIndex || 0) - (b._rawIndex || 0);
              });
            }

            tags.forEach((x, i) => {
              x._rank = i + 1;
              x._isTop = i < 3;
            });

            return tags;
          })(),



          // 工作经历：处理完整字段
          workExperiences: (data.workExperiences || []).map(exp => {
            console.log('工作经历原始数据:', exp);

            // 处理工作照片 - API 字段是 photos 不是 workPhotos
            let workPhotos = [];
            const photosArray = exp.photos || exp.workPhotos || [];
            if (Array.isArray(photosArray)) {
              workPhotos = photosArray.map(p => {
                if (typeof p === 'string') return p;
                if (p && p.url) return p.url;
                return '';
              }).filter(url => url);
            }

            console.log('处理后的工作照片:', workPhotos);

            // 处理服务区域 - API 可能返回 district 或 serviceArea
            const serviceArea = exp.serviceArea || exp.district || '';

            // 格式化日期为年月
            const startDate = formatDateYearMonth(exp.startDate);
            const endDate = formatDateYearMonth(exp.endDate);

            // 转换区域代码为中文
            const serviceAreaText = formatDistrict(serviceArea);

            // 处理订单编号：只显示8位，前4位用*遮蔽，后4位保留
            let maskedOrderNumber = '';
            if (exp.orderNumber) {
              const orderNum = exp.orderNumber.toString();
              if (orderNum.length >= 4) {
                const last4 = orderNum.slice(-4);
                maskedOrderNumber = `****${last4}`;
              } else {
                maskedOrderNumber = orderNum;
              }
            }

            return {
              startDate: startDate,
              endDate: endDate,
              description: exp.description || '',
              orderNumber: maskedOrderNumber,
              serviceArea: serviceAreaText,
              customerName: exp.customerName || '',
              customerReview: exp.customerReview || exp.review || '',
              workPhotos: workPhotos
            };
          }),

          // 好评数：按工作经历条数展示（有几段 workExperiences 就显示几个好评）
          positiveReviewCount: Array.isArray(data.workExperiences) ? data.workExperiences.length : 0,


          // 图片字段
          idCardFront: data.idCardFront ? (data.idCardFront.url || data.idCardFront) : '',
          idCardBack: data.idCardBack ? (data.idCardBack.url || data.idCardBack) : '',

          personalPhoto: personalPhotoUrls,
          photos: personalPhotoUrls,
          coverFileId: personalPhotoUrls[0] || '',
          certificates: normalizeFileUrls(data.certificates),
          reports: normalizeFileUrls(data.reports),
          selfIntroductionVideo: data.selfIntroductionVideo ? (data.selfIntroductionVideo.url || data.selfIntroductionVideo) : '',
          videoFileId: data.selfIntroductionVideo ? (data.selfIntroductionVideo.url || data.selfIntroductionVideo) : '',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        };

        const normalizeZodiac = (v) => {
          const s = (v || '').toString().trim();
          if (!s) return '';
          // 已是中文（含"属"或生肖汉字）直接返回
          if (/属|鼠|牛|虎|兔|龙|蛇|马|羊|猴|鸡|狗|猪/.test(s)) return s.includes('属') ? s : `属${s}`;

          const map = {
            rat: '鼠',
            ox: '牛',
            tiger: '虎',
            rabbit: '兔',
            dragon: '龙',
            snake: '蛇',
            horse: '马',
            goat: '羊',
            sheep: '羊',
            monkey: '猴',
            rooster: '鸡',
            chicken: '鸡',
            dog: '狗',
            pig: '猪'
          };
          const key = s.toLowerCase();
          if (map[key]) return `属${map[key]}`;

          // 兜底：字段可能是 "tiger|xxx" 这类，做包含匹配
          const hit = Object.keys(map).find((k) => key.includes(k));
          return hit ? `属${map[hit]}` : s;

        };

        const normalizeConstellation = (v) => {
          // 直接使用 CRM 返回的星座数据，不再自己计算
          const s = (v || '').toString().trim();
          if (!s) return '';
          if (s.endsWith('座')) return s;

          // 将英文星座名转换为中文
          const map = {
            aries: '白羊座',
            taurus: '金牛座',
            gemini: '双子座',
            cancer: '巨蟹座',
            leo: '狮子座',
            virgo: '处女座',
            libra: '天秤座',
            scorpio: '天蝎座',
            sagittarius: '射手座',
            capricorn: '摩羯座',
            aquarius: '水瓶座',
            pisces: '双鱼座'
          };
          const key = s.toLowerCase();
          if (map[key]) return map[key];

          return s.endsWith('座') ? s : `${s}座`;
        };


        const formatNativePlace = (v) => {
          const s = (v || '').toString().trim();
          if (!s) return '';
          // 尽量截取到"省/市/自治区/特别行政区"，并可带一个"市"
          const m = s.match(/^(.+?(省|自治区|特别行政区))(.*?市)?/);
          if (m) return `${m[1]}${m[3] || ''}`;
          const idx = s.indexOf('市');
          if (idx >= 0) return s.slice(0, idx + 1);
          return s;
        };

        // 基本信息行：属相丨年龄丨星座丨籍贯（省市）丨民族丨学历
        const zodiacText = normalizeZodiac(detail.zodiacText) || '—';
        const ageText = detail.age ? `${detail.age}岁` : '—';
        const constellationText = normalizeConstellation(detail.constellationText) || '—';
        const nativePlaceText = formatNativePlace(detail.nativePlace) || detail.city || '—';
        const nationText = (detail.nationText || '').toString().trim() || '—';
        const educationText = detail.educationText || '—';
        const basicInfoItems = [zodiacText, ageText, constellationText, nativePlaceText, nationText, educationText];

        const photos = detail.photos || [];
        // 头像固定取个人照片第一张（没有就回退）
        const avatarSrc = photos[0] || detail.coverFileId || '';
        let detailWithAvatar = {
          ...detail,
          avatarSrc,
          basicInfoItems,
          // 视频缩略图：按你的要求直接用头像图
          videoThumbSrc: avatarSrc
        };

        // 兼容后端把云存储 fileID 写进 url 的情况（cloud://... 必须转临时 https 才能在 <video> 播放）
        if (detailWithAvatar.videoFileId) {
          console.log('🎬 原始视频URL:', detailWithAvatar.videoFileId);

          // 优先使用列表页预加载的视频
          if (this.preloadedVideoPath) {
            console.log('🎉🎉🎉 使用预加载视频路径:', this.preloadedVideoPath);
            detailWithAvatar.videoLocalSrc = this.preloadedVideoPath;
          } else {
            console.log('⚠️ 没有预加载视频，将实时下载');
          }

          const playable = await this.getPlayableVideoUrl(detailWithAvatar.videoFileId);
          detailWithAvatar.videoFileId = playable || '';
          console.log('🎬 转换后视频URL:', detailWithAvatar.videoFileId);

          // 检查视频URL是否有效
          if (!detailWithAvatar.videoFileId) {
            console.error('❌ 视频URL转换失败');
            wx.showToast({ title: '视频地址无效', icon: 'none' });
          } else if (detailWithAvatar.videoFileId.startsWith('cloud://')) {
            console.error('❌ 视频URL仍然是cloud://格式，未成功转换');
            wx.showToast({ title: '视频地址转换失败', icon: 'none' });
          }
        }

        // ========== 顶部缩略图展示算法（按工种决定侧重点） ==========
        // 从后端 albums 或兜底字段里提取分类
        const albums = Array.isArray(data.albums) ? data.albums : (Array.isArray(data.album) ? data.album : []);
        const photoCategories = {}; // url -> 分类名

        const simplifyCategory = (name) => {
          if (!name) return '';
          return name.replace(/照片|图片|展示$/g, '');
        };

        const pickUrlsByKeys = (keys) => {
          for (const k of (keys || [])) {
            const arr = data && data[k];
            const urls = normalizeFileUrls(arr);
            if (urls.length) return urls;
          }
          return [];
        };

        // 1) 优先使用 albums 给每张图打上分类
        albums.forEach((album) => {
          const categoryName = album.name || album.title || album.categoryName || album.category || '';
          const urls = normalizeFileUrls(album.photos || album.files || album.list || album.items);
          urls.forEach((u) => {
            if (u && categoryName) photoCategories[u] = categoryName;
          });
        });

        // 2) 没有 albums 时：按字段名兜底分类
        if (Object.keys(photoCategories).length === 0) {
          const specs = [
            { name: '个人照', keys: ['personalPhoto', 'photoFiles', 'photos'] },
            { name: '月子餐', keys: ['confinementMealPhotos', 'confinementMealPhoto', 'confinementMealFiles'] },
            { name: '烹饪', keys: ['cookingPhotos', 'cookingPhoto', 'cookingFiles'] },
            { name: '辅食', keys: ['complementaryFoodPhotos', 'complementaryFoodPhoto', 'complementaryFoodFiles'] },
            { name: '好评', keys: ['positiveReviewPhotos', 'positiveReviewPhoto', 'positiveReviewFiles'] },
            { name: '证书', keys: ['certificates', 'certificateFiles'] },
            { name: '体检', keys: ['reports', 'medicalReportFiles', 'medicalReports'] }
          ];

          specs.forEach((spec) => {
            const urls = pickUrlsByKeys(spec.keys);
            urls.forEach((u) => {
              if (u) photoCategories[u] = spec.name;
            });
          });
        }

        // 关键分类：用于按工种挑选缩略图
        const avatarUrl = personalPhotoUrls[0] || '';
        const personalUrls = personalPhotoUrls;
        const mealUrls = pickUrlsByKeys(['confinementMealPhotos', 'confinementMealPhoto', 'confinementMealFiles']);
        const cookingUrls = pickUrlsByKeys(['cookingPhotos', 'cookingPhoto', 'cookingFiles']);
        const foodUrls = pickUrlsByKeys(['complementaryFoodPhotos', 'complementaryFoodPhoto', 'complementaryFoodFiles']);
        const reviewUrls = pickUrlsByKeys(['positiveReviewPhotos', 'positiveReviewPhoto', 'positiveReviewFiles']);
        const reportUrls = pickUrlsByKeys(['reports', 'medicalReportFiles', 'medicalReports']);
        const certificateUrls = pickUrlsByKeys(['certificates', 'certificateFiles']);

        const makeThumb = (url, fallbackCategory) => ({
          url,
          category: simplifyCategory(photoCategories[url] || fallbackCategory || '')
        });

        const uniqTake = (urls, fallbackCategory, count, used) => {
          const out = [];
          for (const u of (urls || [])) {
            if (!u) continue;
            if (used.has(u)) continue;
            used.add(u);
            out.push(makeThumb(u, fallbackCategory));
            if (out.length >= count) break;
          }
          return out;
        };

        const buildThumbPreview = () => {
          const used = new Set();
          const hasVideo = !!detailWithAvatar.videoFileId;
          const result = [];

          // 无视频时：第一个优先头像（个人照第一张）
          if (!hasVideo && avatarUrl) {
            used.add(avatarUrl);
            result.push(makeThumb(avatarUrl, '个人照'));
          }

          // 有视频时：避免与视频缩略图（头像）重复
          if (hasVideo && avatarUrl) {
            used.add(avatarUrl);
          }

          const jobType = (detailWithAvatar.jobType || '').toString();
          const isYuesao = jobType === 'yuexin';
          const isBaomu = jobType.includes('baomu');
          const isYuer = jobType.includes('yuer');

          // 目标：固定 3 张图片缩略图（不含视频块）
          const need = 3 - result.length;

          if (need > 0) {
            if (isYuesao) {
              // 月嫂：月子餐 2 + 好评 1；没好评就用更多月子餐补位
              result.push(...uniqTake(mealUrls, '月子餐', 2, used));
              result.push(...uniqTake(reviewUrls, '好评', 1, used));
              // 补位：优先月子餐
              while (result.length < 3) {
                const before = result.length;
                result.push(...uniqTake(mealUrls, '月子餐', 1, used));
                if (result.length === before) break;
              }
            } else if (isBaomu) {
              // 保姆：烹饪 2 + 好评 1；没好评就用更多烹饪补位
              result.push(...uniqTake(cookingUrls, '烹饪', 2, used));
              result.push(...uniqTake(reviewUrls, '好评', 1, used));
              while (result.length < 3) {
                const before = result.length;
                result.push(...uniqTake(cookingUrls, '烹饪', 1, used));
                if (result.length === before) break;
              }
            } else if (isYuer) {
              // 育儿嫂：辅食 2 + 好评 1；没好评就用更多辅食补位
              result.push(...uniqTake(foodUrls, '辅食', 2, used));
              result.push(...uniqTake(reviewUrls, '好评', 1, used));
              while (result.length < 3) {
                const before = result.length;
                result.push(...uniqTake(foodUrls, '辅食', 1, used));
                if (result.length === before) break;
              }
            }
          }

          // 兜底补足：个人照（除头像）-> 好评 -> 月子餐/烹饪/辅食 -> 体检
          if (result.length < 3) result.push(...uniqTake(personalUrls, '个人照', 3 - result.length, used));
          if (result.length < 3) result.push(...uniqTake(reviewUrls, '好评', 3 - result.length, used));
          if (result.length < 3) result.push(...uniqTake(mealUrls, '月子餐', 3 - result.length, used));
          if (result.length < 3) result.push(...uniqTake(cookingUrls, '烹饪', 3 - result.length, used));
          if (result.length < 3) result.push(...uniqTake(foodUrls, '辅食', 3 - result.length, used));
          if (result.length < 3) result.push(...uniqTake(reportUrls, '体检', 3 - result.length, used));

          return result.slice(0, 3);
        };

        const heroThumbPhotosPreview = buildThumbPreview();
        const heroThumbPhotos = heroThumbPhotosPreview;

        // 计算媒体总数量：视频 +（去重后的全部图片；与相册页保持一致，不统计证书）
        const allAlbumUrls = albums.length
          ? albums.flatMap((a) => normalizeFileUrls(a.photos || a.files || a.list || a.items))
          : [
              ...personalUrls,
              ...mealUrls,
              ...cookingUrls,
              ...foodUrls,
              ...reviewUrls,
              ...reportUrls
            ];
        const allPhotoUrls = Array.from(new Set(allAlbumUrls.filter(Boolean))).filter((u) => !certificateUrls.includes(u));
        const heroTotalMediaCount = (detailWithAvatar.videoFileId ? 1 : 0) + allPhotoUrls.length;


        // 证书票券：优先使用 certificates 数组，并尽量关联 skills 的名称
        const certificates = detailWithAvatar.certificates || [];
        const skills = detailWithAvatar.skills || [];
        
        console.log('📜 证书数据:', { 
          certificatesCount: certificates.length, 
          skillsCount: skills.length,
          certificates,
          skills 
        });
        
        // 先为每个 certificate 创建卡片
        const certTicketsFromCerts = certificates.map((certUrl, idx) => ({
          code: skills[idx] || `cert_${idx}`,
          text: skills[idx] ? (SKILLS_MAP[skills[idx]] || skills[idx]) : `证书${idx + 1}`,
          url: certUrl
        }));
        
        // 如果 skills 比 certificates 多，为剩余的 skills 也创建卡片（但没有图片）
        const certTicketsFromSkills = skills.slice(certificates.length).map((skillCode) => ({
          code: skillCode,
          text: SKILLS_MAP[skillCode] || skillCode,
          url: '' // 没有对应的证书图片
        }));
        
        const certTicketsAll = [...certTicketsFromCerts, ...certTicketsFromSkills];
        console.log('📜 生成的证书票券:', certTicketsAll);
        const certTicketsShowSwipeHint = certTicketsAll.length > 2;

        console.log('🎫 证书票券数据:', certTicketsAll);

        const recommendationExpanded = false;
        const recommendationDefaultLimit = this.data.recommendationDefaultLimit || 8;
        const recommendationTagsAll = (detailWithAvatar && detailWithAvatar.recommendationTags) ? detailWithAvatar.recommendationTags : [];
        const recommendationVM = buildRecommendationView(recommendationTagsAll, recommendationExpanded, recommendationDefaultLimit, 3);

        this.setData({
          detail: detailWithAvatar,
          heroThumbPhotos,
          heroThumbPhotosPreview,
          heroTotalMediaCount,
          certTicketsAll,
          certTicketsShowSwipeHint,

          recommendationExpanded,
          recommendationDefaultLimit,
          recommendationTotalCount: recommendationVM.total,
          recommendationHasMore: recommendationVM.hasMore,
          recommendationVisibleTags: recommendationVM.visible,
          recommendationHiddenCount: recommendationVM.hiddenCount,

          loaded: true,
          heroMediaType: detailWithAvatar.videoFileId ? 'video' : 'image',
          heroSelectedImage: '',
          heroShowCenterPlayBtn: detailWithAvatar.videoFileId ? true : false
        });

        console.log('📊 页面状态:', {
          heroMediaType: this.data.heroMediaType,
          heroShowCenterPlayBtn: this.data.heroShowCenterPlayBtn,
          hasVideo: !!detailWithAvatar.videoFileId,
          videoSrc: detailWithAvatar.videoLocalSrc || detailWithAvatar.videoFileId
        });

        console.log('🎬 最终视频源:', detailWithAvatar.videoLocalSrc ? '本地路径 ✅' : '远程URL ⚠️');
        console.log('   路径:', detailWithAvatar.videoLocalSrc || detailWithAvatar.videoFileId);

        // 视频直接使用云存储临时链接，无需预下载
        // 让微信视频组件自己处理流式加载和缓存

        // 加载员工评价数据
        this.loadEvaluations(resumeId);

      } else {
        wx.showToast({ title: resp.message || "简历不存在", icon: "none" });
        this.setData({ loaded: true });
      }
    } catch (e) {
      console.error('加载简历详情失败:', e);
      wx.showToast({ title: "加载失败", icon: "none" });
      this.setData({ loaded: true });
    }
  },

  onTapHeroThumb(e) {
    const type = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.type) || '';
    const url = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.url) || '';

    if (type === 'video') {
      this.setData({
        heroMediaType: 'video',
        heroSelectedImage: '',
        heroShowCenterPlayBtn: true  // 显示播放按钮，让用户手动播放
      });
      return;
    }


    if (type === 'image' && url) {
      // 切换成图片时暂停视频，避免后台继续播放
      this.pauseHeroVideo();
      this.setData({ heroMediaType: 'image', heroSelectedImage: url });
    }

  },

  // 查看全部照片：进入相册页（按分类展示）
  onTapViewAllPhotos() {
    const id = (this.data.detail && this.data.detail._id) || this.data.id;
    if (!id) {
      wx.showToast({ title: '简历ID缺失', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pages/resumeAlbum/index?id=${encodeURIComponent(String(id))}`
    });
  },

  // 查看全部证书（预览图片）
  onTapViewAllCertificates() {
    const fromTickets = (this.data.certTicketsAll || []).map((x) => x.url).filter(Boolean);
    const fromDetail = (this.data.detail && this.data.detail.certificates) ? this.data.detail.certificates : [];
    const list = Array.from(new Set([...(fromDetail || []), ...(fromTickets || [])].filter(Boolean)));
    if (!list.length) {
      wx.showToast({ title: '暂无证书图片', icon: 'none' });
      return;
    }

    wx.previewImage({
      urls: list,
      current: list[0]
    });
  },

  // 点击证书票券：预览对应证书图片
  onTapCertificateTicket(e) {
    console.log('🎫 点击证书卡片, event:', e);
    const clickedUrl = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.url;
    console.log('🎫 点击的证书URL:', clickedUrl);
    
    const fromTickets = (this.data.certTicketsAll || []).map((x) => x.url).filter(Boolean);
    console.log('🎫 票券中的证书URLs:', fromTickets);
    
    const fromDetail = (this.data.detail && this.data.detail.certificates) ? this.data.detail.certificates : [];
    console.log('🎫 详情中的证书URLs:', fromDetail);
    
    const list = Array.from(new Set([...(fromDetail || []), ...(fromTickets || [])].filter(Boolean)));
    console.log('🎫 合并后的证书列表:', list);
    
    const current = clickedUrl || list[0];
    console.log('🎫 当前要预览的图片:', current);

    if (!current || !list.length) {
      console.log('❌ 没有可预览的证书图片');
      wx.showToast({ title: '暂无证书图片', icon: 'none' });
      return;
    }

    console.log('✅ 开始预览证书图片');
    wx.previewImage({
      urls: list,
      current
    });
  },

  onTapPhoto(e) {
    // 页面内其他图片（证书等）仍然保留预览
    const url = e.currentTarget.dataset.url;
    const urls = (this.data.detail && this.data.detail.photos) || [];
    if (!url || !urls.length) return;
    wx.previewImage({ current: url, urls });
  },

  // 展开/收起推荐理由（默认 TopN，避免占满首屏）
  onToggleRecommendationTags() {
    const expanded = !this.data.recommendationExpanded;
    const limit = this.data.recommendationDefaultLimit || 8;
    const tagsAll = (this.data.detail && this.data.detail.recommendationTags) ? this.data.detail.recommendationTags : [];
    const vm = buildRecommendationView(tagsAll, expanded, limit, 3);

    this.setData({
      recommendationExpanded: expanded,
      recommendationHasMore: vm.hasMore,
      recommendationVisibleTags: vm.visible,
      recommendationTotalCount: vm.total,
      recommendationHiddenCount: vm.hiddenCount
    });
  },

  // 点击推荐理由标签：展示完整文案（不做“按钮式”强交互，但允许点开看完整内容）
  onTapRecommendationTag(e) {
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const tag = (ds.tag || '').toString().trim();
    const count = ds.count;

    if (!tag) return;

    const countText = (count === undefined || count === null || count === '') ? '' : `（${count}）`;

    wx.showModal({
      title: '推荐理由',
      content: `${tag}${countText}`,
      showCancel: false,
      confirmText: '知道了'
    });
  },



  // 点击咨询按钮：先判断登录，再拉起客服
  onTapConsult() {
    console.log('🔔 点击咨询按钮');

    if (!this.isLoggedIn()) {
      console.log('⚠️ 未登录，跳转到登录页');
      wx.setStorageSync('pendingContact', '1');
      wx.showToast({ title: '请先登录后联系客服', icon: 'none' });
      wx.navigateTo({ url: '/pages/login/index' });
      return;
    }

    console.log('✅ 已登录，调起客服');
    this.openCustomerService();
  },

  // 检查是否已登录
  isLoggedIn() {
    const crmUserInfo = wx.getStorageSync('crmUserInfo');
    const isLoggedIn = !!(crmUserInfo && (crmUserInfo.phone || crmUserInfo.nickname));
    console.log('🔐 登录状态检查:', isLoggedIn, crmUserInfo);
    return isLoggedIn;
  },

  // 登录后自动进入客服（检查待处理标记）
  checkPendingContact() {
    const pending = wx.getStorageSync('pendingContact');
    console.log('🔍 检查待处理客服请求:', pending);

    if (pending && this.isLoggedIn()) {
      console.log('✅ 有待处理请求且已登录，自动调起客服');
      wx.removeStorageSync('pendingContact');
      this.openCustomerService();
    }
  },

  // 拉起小程序客服（优先使用 openCustomerServiceChat）
  openCustomerService() {
    console.log('📞 开始调起客服');

    if (wx.openCustomerServiceChat) {
      console.log('✅ 使用 openCustomerServiceChat API');
      wx.openCustomerServiceChat({
        extInfo: {},
        success: () => {
          console.log('✅ 客服调起成功');
        },
        fail: (err) => {
          console.error('❌ openCustomerServiceChat 失败', err);
          wx.showToast({ title: '客服暂时不可用', icon: 'none' });
        }
      });
      return;
    }

    console.warn('⚠️ 当前微信版本不支持客服功能');
    wx.showToast({ title: '当前微信版本不支持客服', icon: 'none' });
  },



  pauseHeroVideo() {
    try {
      const ctx = wx.createVideoContext('heroVideo', this);
      ctx && ctx.pause && ctx.pause();
    } catch (e) {
      // ignore
    }
  },

  playHeroVideo() {
    try {
      const ctx = wx.createVideoContext('heroVideo', this);
      ctx && ctx.play && ctx.play();
    } catch (e) {
      console.warn('创建/播放 videoContext 失败：', e);
    }
  },


  onHeroVideoLoaded() {
    // 视频元数据加载完成，显示中间播放按钮让用户手动播放
    if (this.data.heroMediaType !== 'video') return;

    console.log('✅ 视频元数据加载完成');
    // 显示播放按钮，等待用户点击
    this.setData({
      heroShowCenterPlayBtn: true,
      heroVideoLoading: false
    });
  },

  onHeroVideoWaiting() {
    // 视频缓冲中
    console.log('⏳ 视频缓冲中...');
    this.setData({ heroVideoLoading: true });
  },

  onHeroVideoCanPlay() {
    // 视频可以播放了
    console.log('✅ 视频可以播放');
    this.setData({ heroVideoLoading: false });
  },

  onHeroVideoProgress(e) {
    // 视频加载进度
    const buffered = e.detail.buffered;
    console.log('📊 视频加载进度:', buffered + '%');
  },

  onHeroVideoEnded() {
    // 自动播放结束后：暂停并展示居中播放按钮（用于再次播放）
    if (this.data.heroMediaType !== 'video') return;
    this.pauseHeroVideo();
    this.setData({ heroShowCenterPlayBtn: true });
  },

  onTapHeroCenterPlay() {
    if (this.data.heroMediaType !== 'video') return;
    this.setData({ heroShowCenterPlayBtn: false });
    // 用户点击播放按钮后才开始播放
    this.playHeroVideo();
  },

  onTapHeroMute() {
    const next = !this.data.heroVideoMuted;
    this.setData({ heroVideoMuted: next });
  },



  onHeroVideoError(e) {
    const errMsg = (e && e.detail && e.detail.errMsg) || '视频播放失败';
    const src = (this.data.detail && this.data.detail.videoFileId) || '';
    console.error('❌ 视频组件错误：', errMsg, 'src:', src);

    this.setData({
      heroVideoLoading: false,
      heroShowCenterPlayBtn: true
    });

    // 常见原因提示：
    // - cloud:// fileID 未转临时 URL
    // - 视频编码不兼容（H.265/HEVC 等在部分机型会黑屏）
    // - 视频域名未加入小程序下载域名/未支持 Range
    // - 视频格式不支持（建议使用 mp4/H.264）
    wx.showToast({ title: '视频加载失败，请检查网络后重试', icon: 'none', duration: 3000 });
  },

  getPlayableVideoUrl(raw) {
    const s = (raw || '').toString().trim();
    if (!s) return Promise.resolve('');

    // 云存储 fileID 需要转临时 https
    if (s.startsWith('cloud://')) {
      return new Promise((resolve) => {
        wx.cloud.getTempFileURL({
          fileList: [s],
          success: (res) => {
            const temp = res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL;
            resolve(temp || '');
          },
          fail: (err) => {
            console.warn('获取视频临时链接失败：', err, s);
            resolve('');
          }
        });
      });
    }

    return Promise.resolve(s);
  },

  preloadVideo(url) {

    if (!url) return;

    // 已有本地 src 就不再重复处理
    if (this.data.detail && this.data.detail.videoLocalSrc) return;

    const fs = wx.getFileSystemManager();

    const doDownload = () => {
      // 手机流量下不强制整段下载（避免"缓存很慢"拖累首屏）
      wx.getNetworkType({
        success: ({ networkType }) => {
          if (networkType && networkType !== 'wifi') return;

          wx.downloadFile({
            url,
            timeout: 30000,
            success: (res) => {
              if (res.statusCode === 200 && res.tempFilePath) {
                // 保存到本地持久文件，二次进入可秒开
                fs.saveFile({
                  tempFilePath: res.tempFilePath,
                  success: (saveRes) => {
                    const savedFilePath = saveRes && saveRes.savedFilePath ? saveRes.savedFilePath : res.tempFilePath;
                    const cacheMap = wx.getStorageSync(VIDEO_CACHE_KEY) || {};
                    cacheMap[url] = savedFilePath;

                    // 简单控制缓存数量（FIFO）
                    const keys = Object.keys(cacheMap);
                    if (keys.length > VIDEO_CACHE_MAX) {
                      const removeKeys = keys.slice(0, keys.length - VIDEO_CACHE_MAX);
                      removeKeys.forEach((k) => {
                        const p = cacheMap[k];
                        delete cacheMap[k];
                        try {
                          p && fs.unlink({ filePath: p });
                        } catch (e) {
                          // ignore
                        }
                      });
                    }

                    wx.setStorageSync(VIDEO_CACHE_KEY, cacheMap);

                    this.setData({
                      'detail.videoLocalSrc': savedFilePath
                    });

                    // 下载成本地后立即触发一次播放（配合 autoplay）
                    if (this.data.heroMediaType === 'video') {
                      setTimeout(() => this.playHeroVideo(), 0);
                    }
                  },
                  fail: () => {
                    // saveFile 失败也不影响播放，继续使用临时路径
                    this.setData({
                      'detail.videoLocalSrc': res.tempFilePath
                    });
                  }
                });
              }
            },
            fail: (err) => {
              console.warn('视频预加载失败，回退到远程地址播放：', err);
            }
          });
        },
        fail: () => {
          // 无法判断网络类型时：不强制预下载
        }
      });
    };

    // 命中缓存则直接用
    const cacheMap = wx.getStorageSync(VIDEO_CACHE_KEY) || {};
    const cachedPath = cacheMap[url];
    if (cachedPath) {
      fs.access({
        path: cachedPath,
        success: () => {
          this.setData({ 'detail.videoLocalSrc': cachedPath });
        },
        fail: () => {
          // 缓存失效，清理后重新走下载逻辑
          try {
            delete cacheMap[url];
            wx.setStorageSync(VIDEO_CACHE_KEY, cacheMap);
          } catch (e) {
            // ignore
          }
          doDownload();
        }
      });
      return;
    }

    doDownload();
  },

  /**
   * 预览工作照片
   */
  onPreviewWorkPhoto(e) {
    const { urls, current } = e.currentTarget.dataset;
    if (!urls || !urls.length) return;

    wx.previewImage({
      urls: urls,
      current: current || urls[0]
    });
  },

  /**
   * 工作照片加载错误
   */
  onWorkPhotoError(e) {
    const { current } = e.currentTarget.dataset;
    console.error('工作照片加载失败:', current, e.detail);
  },

  /**
   * 加载员工评价数据
   */
  async loadEvaluations(employeeId) {
    if (!employeeId) {
      console.warn('⭐ 员工ID为空，跳过加载评价');
      return;
    }

    console.log('⭐ 开始加载员工评价, employeeId:', employeeId);

    try {
      // 并行加载评价统计和评价列表
      const [statisticsResp, listResp] = await Promise.all([
        employeeEvaluationService.getEvaluationStatistics(employeeId).catch(err => {
          console.error('⭐ 获取评价统计失败:', err);
          return { success: false, error: err };
        }),
        employeeEvaluationService.getEvaluationList({
          employeeId: employeeId,
          page: 1,
          pageSize: 5  // 只显示前5条评价
        }).catch(err => {
          console.error('⭐ 获取评价列表失败:', err);
          return { success: false, error: err };
        })
      ]);

      console.log('⭐ 评价统计响应:', JSON.stringify(statisticsResp));
      console.log('⭐ 评价列表响应:', JSON.stringify(listResp));

      // 处理统计数据
      let statistics = null;
      if (statisticsResp.success && statisticsResp.data) {
        console.log('⭐ 统计数据原始值:', JSON.stringify(statisticsResp.data));

        const data = statisticsResp.data;

        // 兼容不同的字段名格式
        const totalCount = data.totalCount || data.total || 0;
        const averageRating = data.averageRating || data.averageOverallRating || data.average_rating || 0;
        const averageServiceAttitude = data.averageServiceAttitude || data.averageServiceAttitudeRating || data.average_service_attitude || 0;
        const averageProfessionalSkill = data.averageProfessionalSkill || data.averageProfessionalSkillRating || data.average_professional_skill || 0;
        const averageWorkEfficiency = data.averageWorkEfficiency || data.averageWorkEfficiencyRating || data.average_work_efficiency || 0;
        const averageCommunication = data.averageCommunication || data.averageCommunicationRating || data.average_communication || 0;

        statistics = {
          totalCount: totalCount,
          averageRating: averageRating ? Number(averageRating).toFixed(1) : '0.0',
          averageServiceAttitude: averageServiceAttitude ? Number(averageServiceAttitude).toFixed(1) : '0.0',
          averageProfessionalSkill: averageProfessionalSkill ? Number(averageProfessionalSkill).toFixed(1) : '0.0',
          averageWorkEfficiency: averageWorkEfficiency ? Number(averageWorkEfficiency).toFixed(1) : '0.0',
          averageCommunication: averageCommunication ? Number(averageCommunication).toFixed(1) : '0.0'
        };
        console.log('⭐ 统计数据处理后:', JSON.stringify(statistics));
      } else {
        console.warn('⭐ 统计数据加载失败或无数据:', {
          success: statisticsResp.success,
          hasData: !!statisticsResp.data,
          response: JSON.stringify(statisticsResp)
        });
      }

      // 处理评价列表
      let list = [];
      let hasMore = false;
      if (listResp.success && listResp.data) {
        const items = listResp.data.items || listResp.data.list || [];
        list = items.map(item => ({
          ...item,
          evaluationTypeText: EVALUATION_TYPE_MAP[item.evaluationType] || item.evaluationType,
          createdAtText: this.formatEvaluationDate(item.createdAt)
        }));

        const total = listResp.data.total || 0;
        hasMore = total > list.length;
      }

      // 如果统计接口失败但有评价列表，从列表中计算统计数据
      if (!statistics && list.length > 0) {
        console.log('⭐ 统计接口失败，从评价列表计算统计数据');

        const totalRating = list.reduce((sum, item) => sum + (item.overallRating || 0), 0);
        const totalServiceAttitude = list.reduce((sum, item) => sum + (item.serviceAttitudeRating || 0), 0);
        const totalProfessionalSkill = list.reduce((sum, item) => sum + (item.professionalSkillRating || 0), 0);
        const totalWorkEfficiency = list.reduce((sum, item) => sum + (item.workEfficiencyRating || 0), 0);
        const totalCommunication = list.reduce((sum, item) => sum + (item.communicationRating || 0), 0);

        statistics = {
          totalCount: list.length,
          averageRating: list.length > 0 ? (totalRating / list.length).toFixed(1) : '0.0',
          averageServiceAttitude: list.length > 0 ? (totalServiceAttitude / list.length).toFixed(1) : '0.0',
          averageProfessionalSkill: list.length > 0 ? (totalProfessionalSkill / list.length).toFixed(1) : '0.0',
          averageWorkEfficiency: list.length > 0 ? (totalWorkEfficiency / list.length).toFixed(1) : '0.0',
          averageCommunication: list.length > 0 ? (totalCommunication / list.length).toFixed(1) : '0.0'
        };
        console.log('⭐ 从列表计算的统计数据:', JSON.stringify(statistics));
      }

      // 更新页面数据
      this.setData({
        evaluations: {
          statistics,
          list,
          hasMore
        }
      });

      console.log('⭐ 评价数据加载完成:', {
        statisticsLoaded: !!statistics,
        listCount: list.length,
        hasMore
      });

    } catch (e) {
      console.error('⭐ 加载评价数据失败:', e);
      // 不显示错误提示，静默失败
    }
  },

  /**
   * 格式化评价日期
   */
  formatEvaluationDate(dateStr) {
    if (!dateStr) return '';

    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;

      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (days === 0) {
        return '今天';
      } else if (days === 1) {
        return '昨天';
      } else if (days < 7) {
        return `${days}天前`;
      } else if (days < 30) {
        const weeks = Math.floor(days / 7);
        return `${weeks}周前`;
      } else if (days < 365) {
        const months = Math.floor(days / 30);
        return `${months}个月前`;
      } else {
        const years = Math.floor(days / 365);
        return `${years}年前`;
      }
    } catch (e) {
      console.error('格式化评价日期失败:', e);
      return dateStr;
    }
  },

  /**
   * 查看更多评价
   */
  onViewMoreEvaluations() {
    // TODO: 跳转到评价列表页
    wx.showToast({ title: '评价列表页开发中', icon: 'none' });
  },

  // 分享给好友（右上角转发按钮）
  onShareAppMessage() {
    const detail = this.data.detail || {};
    const id = detail._id || this.data.id || '';
    const titleBase = detail.name ? `${detail.name} · ${detail.jobTypeText || '家政服务'}` : '安得褓贝 · 家政简历';
    const imageUrl = this.data.shareLogo || detail.avatarSrc || detail.coverFileId || '/images/default-goods-image.png';

    return {
      title: titleBase,
      path: `/pages/resumeDetail/index?id=${encodeURIComponent(String(id))}`,
      imageUrl
    };
  },

  // 转发到朋友圈
  onShareTimeline() {
    const detail = this.data.detail || {};
    const id = detail._id || this.data.id || '';
    const titleBase = detail.name ? `${detail.name} · ${detail.jobTypeText || '家政服务'}` : '安得褓贝 · 家政简历';
    const imageUrl = this.data.shareLogo || detail.avatarSrc || detail.coverFileId || '/images/default-goods-image.png';

    return {
      title: titleBase,
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




