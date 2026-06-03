const resumeService = require('../../services/resume.js');
const employeeEvaluationService = require('../../services/employeeEvaluation.js');
const userService = require('../../services/userService.js');
const { publicRequest } = require('../../utils/request.js');
const { ensureStaffIdentity } = require('../../utils/staffIdentity.js');

// 简历详情页视频缓存（用于提升手机端二次打开速度；非 Wi-Fi 不强制预下载）
const VIDEO_CACHE_KEY = 'resumeDetailVideoCache_v1';
const VIDEO_CACHE_MAX = 8;


// 数据字典
const JOB_TYPE_MAP = {
  'yuexin': '月嫂',
  'yuesao': '月嫂',
  'zhujia-yuer': '住家育儿嫂',
  'baiban-yuer': '白班育儿嫂',
  'baojie': '保洁',
  'baiban-baomu': '白班保姆',
  'zhujia-baomu': '住家保姆',
  'yangchong': '养宠',
  'xiaoshi': '小时工',
  'zhujia-hulao': '住家护老',
  'hugong': '护工',
  'qita': '其他'
};

const WORK_EXPERIENCE_ICON_MAP = {
  'yuexin': '/images/icons/yuexin.svg',
  '月嫂': '/images/icons/yuexin.svg',
  'zhujia-yuer': '/images/icons/work-yuer.svg',
  'baiban-yuer': '/images/icons/work-yuer.svg',
  '育儿嫂': '/images/icons/work-yuer.svg',
  '住家育儿嫂': '/images/icons/work-yuer.svg',
  '白班育儿嫂': '/images/icons/work-yuer.svg',
  'baiban-baomu': '/images/icons/baomu.svg',
  'zhujia-baomu': '/images/icons/baomu.svg',
  '保姆': '/images/icons/baomu.svg',
  '住家保姆': '/images/icons/baomu.svg',
  '白班保姆': '/images/icons/baomu.svg',
  'zhujia-hulao': '/images/icons/hulao.svg',
  '护老': '/images/icons/hulao.svg',
  '住家护老': '/images/icons/hulao.svg',
  'hugong': '/images/icons/hulao.svg',
  '护工': '/images/icons/hulao.svg'
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
  'accepting': '可接单',
  'on-service': '可接单',
  'busy': '忙碌中',
  'working': '忙碌中',
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
const POSTER_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得褓贝定稿.png';

// 简历查看订阅通知模板 ID（与 app.js / settings / profile 保持一致）
const RESUME_VIEW_TEMPLATE_ID = 'VXhA_qhgIRRy8avH1X9uE-eLGk--0M5Bs9Q27EEDmrM';

Page({
  onHide() {
    this.pauseHeroVideo();
  },

  onUnload() {
    this.pauseHeroVideo();
  },

  onShow() {
    this.refreshLoginStatus();
    // 检查是否有待处理的客服联系请求
    this.checkPendingContact();
  },


  data: {

    id: "",
    loaded: false,
    detail: {},

    // 分享相关
    isShared: false,
    sharerInfo: null,
    sharerIsStaff: false, // 分享者是否为员工（控制顾问栏显示）
    displayName: '',
    maskedPhone: '',
    maskedIdNumber: '',
    maskedWechat: '',

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
    // heroMediaType=image 时显示的图片（从缩略图切换时更新）
    heroSelectedImage: '',
    // 头像 URL（独立顶层属性，避免嵌套 detail 对象未更新问题）
    heroAvatarSrc: '',
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
    shareLogo: '',
    // 分享卡片裁剪缩略图（上半身裁图，异步生成后填入）
    croppedShareImage: '',

    // 登录态：用于控制 open-type="contact" 是否生效
    isLoggedIn: false,

    // 员工标识（非员工看脱敏简历）
    isStaff: false
  },





  async onLoad(options) {
    // 启用分享功能
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });

    const { id: rawId, shared, sharerId, sharer, sharerPhone, sharerCompany, sharerAvatar, scene } = options;

    // 兼容从海报小程序码扫码进入（scene = "id%3Dxxx"）
    let qrId = '';
    if (!rawId && scene) {
      try {
        const sceneStr = decodeURIComponent(scene);
        sceneStr.split('&').forEach(pair => {
          const eqIdx = pair.indexOf('=');
          if (eqIdx > -1 && pair.slice(0, eqIdx) === 'id') {
            qrId = pair.slice(eqIdx + 1);
          }
        });
      } catch (e) {
        console.warn('📄 scene 参数解析失败:', e);
      }
    }
    const id = rawId || qrId;

    console.log('📄 详情页加载, 参数:', options);

    // 检查是否通过分享进入
    // options.p 是海报二维码扫码进入时的紧凑电话参数（card-share 用 sharerPhone）
    // options.sf = '1' 表示分享者是员工（staff flag），只有员工分享时才会携带
    if (shared === '1') {
      const resolvedPhone = sharerPhone || options.p || '';
      const resolvedSharerId = sharerId ? decodeURIComponent(sharerId) : '';
      const sharerInfoData = {
        id: resolvedSharerId,
        name: decodeURIComponent(sharer || '安得褓贝顾问'),
        phone: resolvedPhone ? decodeURIComponent(resolvedPhone) : '',
        company: decodeURIComponent(sharerCompany || '安得褓贝'),
        avatar: sharerAvatar ? decodeURIComponent(sharerAvatar) : ''
      };
      this.setData({
        isShared: true,
        sharerInfo: sharerInfoData,
        sharerIsStaff: options.sf === '1'  // 卡片分享：sf=1 表示员工分享
      });

      // 海报二维码扫码进来：URL 里没有顾问姓名，异步拉取完整信息补全（与卡片分享保持一致）
      // 同时传入 phone 作为回退查询条件，解决 CRM userId 与云数据库 _id 不一致问题
      // 查询成功即确认分享者是员工，设置 sharerIsStaff
      if (!sharer && (resolvedSharerId || resolvedPhone)) {
        wx.cloud.callFunction({
          name: 'userService',
          data: { action: 'getStaffPublicInfo', userId: resolvedSharerId, phone: resolvedPhone }
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
              },
              sharerIsStaff: true  // 海报二维码：查到员工信息则确认是员工分享
            });
            // 修复竞争条件：loadDetail() 与本调用并发，若简历已加载完成则在此补发通知
            // （若 loadDetail 尚未完成，sharerIsStaff 已为 true，loadDetail 完成后会正常触发通知）
            if (this.data.loaded && this.data.detail) {
              const nurseName = (this.data.detail && this.data.detail.name) || '';
              const resumeId = this.data.id || (this.data.detail && this.data.detail._id) || '';
              if (nurseName && resumeId) {
                this._sendResumeViewNotify(nurseName, resumeId);
              }
            }
          }
        }).catch(err => {
          console.warn('⚠️ 拉取顾问信息失败（不影响主流程）:', err);
        });
      }

      // 分享访问时隐藏 home 按钮
      try {
        if (wx.hideHomeButton) {
          wx.hideHomeButton();
        }
      } catch (e) {
        console.log('隐藏home按钮失败:', e);
      }
    }

    this.setData({ id: id || "" });

    // 预取分享 LOGO 的临时链接（不需要等待结果）
    this.loadShareLogo();

    // 尝试从列表页获取预加载的视频路径
    const pages = getCurrentPages();
    if (pages.length >= 2) {
      const prevPage = pages[pages.length - 2];
      if (prevPage.route === 'pages/resumeList/index') {
        const resume = prevPage.data.resumes && prevPage.data.resumes.find(r => r._id === id);
        if (resume && resume.coverFileId) {
          this.preloadedCoverFileId = resume.coverFileId;
        }
        if (resume && resume.videoLocalPath) {
          this.preloadedVideoPath = resume.videoLocalPath;
        }
      }
    }

    // 必须先确认员工身份，再加载简历（避免脱敏竞争条件）
    await this.checkStaffRole();
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
          // 兼容嵌套 { files: [...] } 结构
          if (input && typeof input === 'object' && !Array.isArray(input) && Array.isArray(input.files)) {
            input = input.files;
          }
          // 兼容：单个对象/字符串 或 数组
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
        };

        // ===== 调试：打印 CRM 返回的所有字段，帮助排查头像缺失问题 =====
        console.log('📸 CRM 简历数据字段一览:', Object.keys(data || {}));
        console.log('📸 个人照片相关字段:', {
          personalPhoto: data.personalPhoto,
          photoFiles: data.photoFiles,
          personalPhotos: data.personalPhotos,
          photoUrls: data.photoUrls,
          avatarUrl: data.avatarUrl,
          avatar: data.avatar,
          headPhoto: data.headPhoto,
          profilePhoto: data.profilePhoto,
          coverImage: data.coverImage,
          albums: Array.isArray(data.albums) ? data.albums.map(a => ({ name: a.name, count: (a.photos || a.files || []).length })) : data.albums
        });

        // 兼容多种 CRM 字段名：依次尝试直到找到有效图片
        const personalPhotoUrls = (() => {
          // 1. 优先：个人照片数组
          let urls = normalizeFileUrls(data.personalPhoto);
          if (!urls.length) urls = normalizeFileUrls(data.photoFiles);
          if (!urls.length) urls = normalizeFileUrls(data.personalPhotos);
          // 2. 工装照（uniformPhoto）：没有个人照时用工装照作头像
          if (!urls.length) urls = normalizeFileUrls(data.uniformPhoto);
          // 3. 通用照片数组（photoUrls）
          if (!urls.length) urls = normalizeFileUrls(data.photoUrls);
          // 4. 单张头像字段回退（字符串或对象均可）
          if (!urls.length) {
            const single = data.avatarUrl || data.avatar || data.headPhoto || data.profilePhoto || data.coverImage || '';
            const singleStr = typeof single === 'string' ? single : (single && (single.url || single.fileUrl || single.fileURL || single.path || single.src) || '');
            if (singleStr) urls = [singleStr];
          }
          console.log('📸 解析出的个人照片URLs:', urls);
          return urls;
        })();

        // 与列表页保持一致：头像只按 personalPhoto[0] -> avatarUrl 这条链路取值
        const listLikeRawPhotos = Array.isArray(data.personalPhoto)
          ? data.personalPhoto
          : (data.personalPhoto ? [data.personalPhoto] : []);
        const listLikePhotoUrls = listLikeRawPhotos
          .map(p => {
            if (typeof p === 'string') return p;
            if (!p) return '';
            const knownUrl = p.url || p.fileUrl || p.fileURL || p.cosUrl || p.path || p.src || p.imagePath || p.filePath || p.downloadUrl || p.accessUrl || '';
            if (knownUrl) return knownUrl;
            // 兜底：扫描对象里第一个 http(s) 字符串
            const vals = Object.values(p);
            for (const v of vals) {
              if (typeof v === 'string' && (v.startsWith('https://') || v.startsWith('http://'))) return v;
            }
            return '';
          })
          .filter(Boolean);
        const listLikeAvatarUrl = typeof data.avatarUrl === 'string'
          ? data.avatarUrl
          : ((data.avatarUrl && (data.avatarUrl.url || data.avatarUrl.fileUrl || data.avatarUrl.path)) || '');
        const listLikeCoverFileId = listLikePhotoUrls[0] || listLikeAvatarUrl || '';
        console.log('📸 列表页同款取图结果:', {
          preloadedCoverFileId: this.preloadedCoverFileId || '',
          listLikePhotoUrls,
          listLikeAvatarUrl,
          listLikeCoverFileId
        });

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

            // 优先取工作经历自身的工种，没有则退回简历整体工种
            const expJobType = exp.jobType || exp.serviceType || exp.workType || data.jobType || '';
            const expJobTypeText = JOB_TYPE_MAP[expJobType] || exp.jobTypeText || exp.serviceTypeText || exp.workTypeText || expJobType || '';

            return {
              startDate: startDate,
              endDate: endDate,
              description: exp.description || '',
              orderNumber: maskedOrderNumber,
              serviceArea: serviceAreaText,
              customerName: exp.customerName || '',
              customerReview: exp.customerReview || exp.review || '',
              workPhotos: workPhotos,
              jobType: expJobType,
              jobTypeText: expJobTypeText,
              jobTypeIcon: WORK_EXPERIENCE_ICON_MAP[expJobType] || WORK_EXPERIENCE_ICON_MAP[expJobTypeText] || '/images/icons/work-experience.svg'
            };
          }),

          // 好评数：按工作经历条数展示（有几段 workExperiences 就显示几个好评）
          positiveReviewCount: Array.isArray(data.workExperiences) ? data.workExperiences.length : 0,


          // 图片字段
          idCardFront: data.idCardFront ? (data.idCardFront.url || data.idCardFront) : '',
          idCardBack: data.idCardBack ? (data.idCardBack.url || data.idCardBack) : '',

          personalPhoto: listLikePhotoUrls.length ? listLikePhotoUrls : personalPhotoUrls,
          photos: listLikePhotoUrls.length ? listLikePhotoUrls : personalPhotoUrls,
          coverFileId: this.preloadedCoverFileId || listLikeCoverFileId || personalPhotoUrls[0] || data.avatarUrl || data.avatar || data.headPhoto || data.profilePhoto || data.coverImage
            || normalizeFileUrls(data.uniformPhoto)[0] || normalizeFileUrls(data.photoUrls)[0] || '',
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
        // 优先复用列表页已算好的封面图；否则按列表页同款规则取个人照第一张/cover
        const avatarSrc = this.preloadedCoverFileId || photos[0] || detail.coverFileId || '';
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
        // 若 personalPhotoUrls 仍为空，从已构建的 photoCategories 里找"个人照"兜底
        let effectivePersonalUrls = personalPhotoUrls.slice();
        if (!effectivePersonalUrls.length && Object.keys(photoCategories).length > 0) {
          effectivePersonalUrls = Object.entries(photoCategories)
            .filter(([, cat]) => {
              const s = simplifyCategory(cat); // 规范化后比较，"个人照片"→"个人"
              return s === '个人照' || s === '个人';
            })
            .map(([url]) => url);
        }
        console.log('📸 effectivePersonalUrls（含albums兜底）:', effectivePersonalUrls);
        const avatarUrl = effectivePersonalUrls[0] || '';
        const personalUrls = effectivePersonalUrls;

        // 如果 albums 兜底后找到了头像，补回到 detailWithAvatar
        if (avatarUrl && !detailWithAvatar.avatarSrc) {
          detailWithAvatar = {
            ...detailWithAvatar,
            avatarSrc: avatarUrl,
            coverFileId: detailWithAvatar.coverFileId || avatarUrl,
            videoThumbSrc: avatarUrl,
            photos: effectivePersonalUrls.length ? effectivePersonalUrls : detailWithAvatar.photos
          };
        }

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

        // 提取头像 URL 为独立顶层属性，避免 setData 嵌套对象未能更新到 WXML 的问题
        const heroAvatarSrc = this.preloadedCoverFileId || detailWithAvatar.avatarSrc || detailWithAvatar.coverFileId || '';
        // ===== 扫码路径关键诊断 =====
        const isQrCodeEntry = !this.preloadedCoverFileId;
        console.log(isQrCodeEntry ? '📲 [扫码入口] preloadedCoverFileId 为空，依赖 API 数据取图' : '📋 [列表入口] preloadedCoverFileId 已预加载');
        console.log('🖼️ setData前最终检查:', {
          入口: isQrCodeEntry ? '扫码/冷启动' : '列表页',
          preloadedCoverFileId: this.preloadedCoverFileId || '(空)',
          coverFileId: detailWithAvatar.coverFileId,
          avatarSrc: detailWithAvatar.avatarSrc,
          heroAvatarSrc: heroAvatarSrc || '⚠️ 最终为空！',
          photos: detailWithAvatar.photos,
          rawAvatarUrl: data.avatarUrl,
          rawPhotoUrls: data.photoUrls,
          rawPersonalPhoto: data.personalPhoto
        });

        this.setData({
          detail: detailWithAvatar,
          heroAvatarSrc,
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

        if (heroAvatarSrc) {
          Promise.resolve()
            .then(() => this._downloadImage(heroAvatarSrc))
            .then((localAvatarPath) => {
              if (!localAvatarPath) return;
              console.log('🖼️ 头像已下载到本地临时路径:', localAvatarPath);
              const nextData = { heroAvatarSrc: localAvatarPath };
              if (!detailWithAvatar.videoFileId && !this.data.heroSelectedImage) {
                nextData.heroSelectedImage = localAvatarPath;
              }
              this.setData(nextData);
              // 后台异步生成分享卡片裁剪图（取上半身），不阻塞主流程
              this._generateShareThumbnail(localAvatarPath).then(croppedPath => {
                if (croppedPath) this.setData({ croppedShareImage: croppedPath });
              });
            })
            .catch((err) => {
              console.warn('⚠️ 头像下载本地失败，继续使用远程地址:', heroAvatarSrc, err);
            });
        }

        // 仅对非员工脱敏；员工身份无论是否走分享链路都看完整数据
        if (!this.data.isStaff) {
          const surname = detailWithAvatar.name ? detailWithAvatar.name.charAt(0) : '某';
          // 脱敏工作经历中的客户姓名
          if (detailWithAvatar.workExperiences) {
            detailWithAvatar.workExperiences = detailWithAvatar.workExperiences.map(exp => {
              if (exp.customerName) {
                const csurname = exp.customerName.charAt(0);
                return { ...exp, customerName: `${csurname}女士` };
              }
              return exp;
            });
          }
          this.setData({
            detail: detailWithAvatar,
            displayName: `${surname}阿姨`,
            maskedPhone: this.maskPhone(detailWithAvatar.phone),
            maskedWechat: this.maskWechat(detailWithAvatar.wechat)
          });
        } else {
          // 员工直接显示全名
          this.setData({ displayName: detailWithAvatar.name });
        }

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

        // 员工分享的简历被查看 → 发订阅消息通知员工
        console.log('🔔 通知条件检查:', {
          isShared: this.data.isShared,
          sharerIsStaff: this.data.sharerIsStaff,
          sharerInfo: this.data.sharerInfo,
          sharerPhone: this.data.sharerInfo && this.data.sharerInfo.phone
        });
        if (this.data.isShared && this.data.sharerIsStaff && this.data.sharerInfo && this.data.sharerInfo.phone) {
          this._sendResumeViewNotify(detailWithAvatar.name || detail.name, resumeId);
        } else {
          console.warn('🔕 通知未触发，条件不满足（见上方条件检查日志）');
        }

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

  // 发送"简历被查看"通知给分享该简历的员工（fire-and-forget，不影响主流程）
  _sendResumeViewNotify(nurseName, resumeId) {
    // 防止竞争条件导致重复发送（海报二维码路径：getStaffPublicInfo 与 loadDetail 并发时均可能触发）
    if (this._resumeViewNotifySent) return;
    this._resumeViewNotifySent = true;

    const sharerInfo = this.data.sharerInfo || {};
    const sharerPhone = sharerInfo.phone || '';
    if (!sharerPhone) return;

    // 客户姓名：优先用微信昵称，其次手机号，都没有用默认值
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const customerName = crmUserInfo.nickname || wx.getStorageSync('userName') || '新客户';

    console.log('📨 发送简历查看通知 → 员工:', sharerPhone, '阿姨:', nurseName);

    wx.cloud.callFunction({
      name: 'notificationService',
      data: {
        action: 'sendResumeViewNotify',
        sharerPhone,
        customerName,
        nurseName,
        resumeId
      }
    }).then(res => {
      if (res && res.result && res.result.success) {
        console.log('✅ 简历查看通知发送成功');
      } else {
        console.warn('⚠️ 简历查看通知发送失败:', res && res.result && res.result.errMsg);
      }
    }).catch(err => {
      console.warn('⚠️ 简历查看通知调用异常:', err);
    });
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
      url: `/pages/resumeAlbum/index?id=${encodeURIComponent(String(id))}${this.data.isShared ? '&shared=1' : ''}`
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



  // 点击咨询按钮：未登录先去登录；已登录由 open-type="contact" 打开客服
  onTapConsult() {
    console.log('🔔 点击咨询按钮');

    if (!this.isLoggedIn()) {
      console.log('⚠️ 未登录，跳转到登录页');
      wx.setStorageSync('pendingContact', '1');
      wx.showToast({ title: '请先登录后联系客服', icon: 'none' });
      wx.navigateTo({ url: '/pages/login/index' });
      return;
    }

    console.log('✅ 已登录，点击按钮将打开客服');
    this.setData({ isLoggedIn: true });
  },

  refreshLoginStatus() {
    const loggedIn = this.isLoggedIn();
    if (loggedIn !== this.data.isLoggedIn) {
      this.setData({ isLoggedIn: loggedIn });
    }
  },

  // 检查是否已登录
  isLoggedIn() {
    return userService.isLoggedIn();
  },

  // 登录后提醒用户再点一次（open-type="contact" 无法代码中自动触发）
  checkPendingContact() {
    const pending = wx.getStorageSync('pendingContact');
    console.log('🔍 检查待处理客服请求:', pending);

    if (pending && this.isLoggedIn()) {
      wx.removeStorageSync('pendingContact');
      this.setData({ isLoggedIn: true });
      wx.showToast({ title: '登录成功，请点击咨询客服进入客服', icon: 'none' });
    }
  },

  // 小程序客服回调（用户从客服消息进入/返回）
  handleContact(e) {
    console.log('客服消息回调:', e.detail);
  },

  // 检查当前用户是否为员工
  // 走统一的 ensureStaffIdentity：缓存命中直接返回；否则用 phone 调 CRM /staff/info 兜底
  // 确认是员工后，主动从 staff/info 接口刷新 CRM 真实姓名和头像（无需重新登录）
  async checkStaffRole() {
    const isStaff = await ensureStaffIdentity();
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    console.log('👤 用户角色（ensureStaffIdentity）:', isStaff ? '员工' : '客户');

    this.setData({ isStaff });

    // 确认是员工后，主动刷新 CRM 端的真实姓名和头像（用于分享卡片署名锁定）
    if (isStaff && crmUserInfo.phone) {
      this._refreshCrmStaffInfo(crmUserInfo.phone);
    }
  },

  // 从 staff/info 接口刷新员工真实姓名和头像，写回 crmUserInfo 缓存
  _refreshCrmStaffInfo(phone) {
    wx.request({
      url: `https://crm.andejiazheng.com/api/resumes/staff/info?phone=${phone}`,
      method: 'GET',
      success: (res) => {
        if (res.data && res.data.success && res.data.data) {
          const staffData = res.data.data;
          const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
          let changed = false;
          if (staffData.name && staffData.name !== crmUserInfo.crmName) {
            crmUserInfo.crmName = staffData.name;
            changed = true;
          }
          if (staffData.avatar && staffData.avatar !== crmUserInfo.crmAvatar) {
            crmUserInfo.crmAvatar = staffData.avatar;
            changed = true;
          }
          if (changed) {
            wx.setStorageSync('crmUserInfo', crmUserInfo);
            console.log('✅ CRM 员工信息已刷新:', staffData.name, staffData.avatar);
          }
        }
      },
      fail: () => {} // 静默失败，不影响主流程
    });
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



  onHeroImageLoad(e) {
    const currentSrc = this.data.heroSelectedImage || this.data.heroAvatarSrc || '/images/default-goods-image.png';
    console.log('✅ hero图片加载成功:', currentSrc, 'detail:', e && e.detail);
  },

  onHeroImageError(e) {
    const src = this.data.heroSelectedImage || this.data.heroAvatarSrc || (this.data.detail && (this.data.detail.coverFileId || this.data.detail.avatarSrc)) || '';
    console.error('❌ hero图片加载失败! src:', src, 'error:', e && e.detail);
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

  // 手机号脱敏处理
  maskPhone(phone) {
    if (!phone || phone.length < 7) return phone;
    return phone.substring(0, 3) + '****' + phone.substring(phone.length - 4);
  },

  // 身份证号脱敏处理
  maskIdNumber(idNumber) {
    if (!idNumber || idNumber.length < 8) return idNumber;
    return idNumber.substring(0, 4) + '****' + idNumber.substring(idNumber.length - 4);
  },

  // 微信号脱敏处理
  maskWechat(wechat) {
    if (!wechat || wechat.length < 6) return wechat;
    return wechat.substring(0, 2) + '****' + wechat.substring(wechat.length - 2);
  },

  // 图片分享入口（同步 tap handler）：必须保持同步以调起订阅弹窗
  // wx.requestSubscribeMessage 只能在同步 tap 上下文中调用，async 函数会丢失手势权限
  onGeneratePoster() {
    const detail = this.data.detail || {};
    const photoUrl = detail.avatarSrc || detail.coverFileId || '';

    if (!photoUrl) {
      wx.showToast({ title: '暂无照片可生成海报', icon: 'none' });
      return;
    }

    // ① 直接在同步 tap handler 中调用，保证手势上下文有效
    wx.requestSubscribeMessage({
      tmplIds: [RESUME_VIEW_TEMPLATE_ID],
      success: (res) => {
        console.log('📨 订阅配额申请结果:', res[RESUME_VIEW_TEMPLATE_ID]);
      },
      fail: (err) => {
        console.warn('⚠️ 订阅配额申请失败（不影响海报生成）:', err);
      }
    });

    // ② 异步执行后续海报生成逻辑（不阻塞订阅弹窗）
    this._doGeneratePoster(detail);
  },

  // 海报生成的异步实现，由 onGeneratePoster 调用
  async _doGeneratePoster(detail) {
    const photoUrl = detail.avatarSrc || detail.coverFileId || '';
    // 先从后端获取 AI 推荐文案并复制到剪贴板，显示提示后再弹生成海报的 loading
    const recText = await this._fetchRecommendationText();
    if (recText) {
      wx.setClipboardData({ data: recText });
      wx.showToast({ title: '推荐理由复制成功', icon: 'success', duration: 1500 });
      // 等提示消失后再显示 loading，避免两个系统弹层互相覆盖
      await new Promise(r => setTimeout(r, 800));
    }

    wx.showLoading({ title: '生成海报中...' });
    try {
      // 1. 并行：下载照片 & 获取小程序码
      // 优先使用 this.data.id（URL 入参，是成功加载本简历的已知正确 ID）
      const resumeQrId = this.data.id || detail._id || '';
      // 读取当前员工信息，嵌入二维码路径，让客户扫码后能看到"联系顾问"
      const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
      // userInfo 由 CRM 账号登录（auth.js）写入，含 name / avatar 等真实员工字段
      const localUserInfo = wx.getStorageSync('userInfo') || {};
      // 统一转为字符串，避免整数类型（CRM userId 为数字）与云函数/URL 参数字符串类型不匹配
      const staffId = String(crmUserInfo._id || crmUserInfo.id || crmUserInfo.userId || wx.getStorageSync('userId') || '');
      const staffPhone = crmUserInfo.phone || wx.getStorageSync('userPhone') || '';
      // 优先用 CRM 端锁定的 crmName/crmAvatar（来自 staff/info 接口），避免被本地昵称覆盖
      const staffName = crmUserInfo.crmName || crmUserInfo.name || crmUserInfo.nickname || '';
      const staffAvatar = crmUserInfo.crmAvatar || crmUserInfo.avatarUrl || crmUserInfo.avatar || '';

      // 将员工信息缓存到云数据库，供用户扫码时查询顾问姓名和头像（复用分享卡片数据链路）
      // staffId 或 staffPhone 任一存在即可保存，兼容招生老师等无 userId 但有手机号的场景
      if ((staffId || staffPhone) && (staffName || staffPhone)) {
        wx.cloud.callFunction({
          name: 'userService',
          data: { action: 'saveStaffProfile', staffId: staffId || staffPhone, name: staffName, phone: staffPhone, avatar: staffAvatar, company: '安得褓贝' }
        }).catch(err => console.warn('⚠️ 缓存顾问信息失败(不影响海报生成):', err));
      }

      const [photoLocalPath, qrLocalPath, logoLocalPath] = await Promise.all([
        this._downloadImage(photoUrl),
        this._getResumeMiniCodePath(resumeQrId, staffId, staffPhone),
        this._downloadImage(POSTER_LOGO_FILE_ID)
      ]);

      // 2. Canvas 绘制海报
      const posterPath = await this._drawPosterCanvas(detail, photoLocalPath, qrLocalPath, logoLocalPath);

      wx.hideLoading();

      // 3. 调起分享图片菜单（可分享给朋友或保存）
      wx.showShareImageMenu({
        path: posterPath,
        fail: (err) => {
          console.error('分享图片失败:', err);
          // 降级：保存到相册
          wx.saveImageToPhotosAlbum({
            filePath: posterPath,
            success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
            fail: () => wx.showToast({ title: '分享失败，请重试', icon: 'none' })
          });
        }
      });
    } catch (err) {
      wx.hideLoading();
      console.error('生成海报失败:', err);
      wx.showToast({ title: '海报生成失败', icon: 'none' });
    }
  },

  // 下载图片到本地（兼容 cloud:// 和 https）
  async _downloadImage(url) {
    if (!url) return '';
    if (url.startsWith('cloud://')) {
      const res = await wx.cloud.downloadFile({ fileID: url });
      return res.tempFilePath;
    }
    const res = await new Promise((resolve, reject) => {
      wx.downloadFile({ url, success: resolve, fail: reject });
    });
    return res.tempFilePath;
  },

  // 生成分享卡片缩略图：取照片上半身部分（宽度 × 宽度 的正方形从顶部裁剪）
  // 输出 500×500，与 WeChat 分享卡方块预览区域匹配
  async _generateShareThumbnail(localPath) {
    if (!localPath) return '';
    try {
      const imgInfo = await new Promise((resolve, reject) =>
        wx.getImageInfo({ src: localPath, success: resolve, fail: reject })
      );
      const { width: imgW, height: imgH } = imgInfo;
      // 裁剪高度 = 图片宽度（保证是正方形，且只取上半身）；但不超过实际高度
      const cropH = Math.min(imgW, imgH);
      const outSize = 500;

      const canvas = wx.createOffscreenCanvas({ type: '2d', width: outSize, height: outSize });
      const ctx = canvas.getContext('2d');
      const img = canvas.createImage();
      img.src = localPath;
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });

      // 垂直居中后再往下偏移 20%（裁剪窗口下移 → 人头出现在画面上方，减少顶部留白）
      // 用 Math.min 确保裁剪区不超出图片底部
      const sy = Math.min(imgH - cropH, Math.floor((imgH - cropH) / 2 + imgH * 0.2));
      ctx.drawImage(img, 0, sy, imgW, cropH, 0, 0, outSize, outSize);

      const result = await new Promise((resolve, reject) =>
        wx.canvasToTempFilePath({ canvas, fileType: 'jpg', quality: 0.92,
          success: r => resolve(r.tempFilePath), fail: reject })
      );
      return result;
    } catch (err) {
      console.warn('⚠️ 分享缩略图生成失败，回退到原图:', err);
      return '';
    }
  },

  // 调云函数生成简历小程序码，返回本地临时路径（失败时返回空串）
  // staffId / staffPhone 非空时，生成的二维码会携带 shared=1&sharerId=xxx&p=phone，
  // 扫码进入时底部会展示"联系顾问"而非"联系客服"
  async _getResumeMiniCodePath(resumeId, staffId, staffPhone) {
    if (!resumeId) return '';
    try {
      const cfRes = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'getResumeMiniCode',
          resumeId,
          staffId: staffId || '',
          staffPhone: staffPhone || ''
        }
      });
      const fileID = cfRes?.result?.fileID;
      if (!fileID) return '';
      const tempRes = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const tempUrl = tempRes?.fileList?.[0]?.tempFileURL || '';
      if (!tempUrl) return '';
      return await this._downloadImage(tempUrl);
    } catch (err) {
      console.warn('获取小程序码失败，海报将跳过二维码:', err);
      return '';
    }
  },

  // 用 Canvas 2D 绘制海报并导出为临时文件路径（v2 杂志封面风格）
  _drawPosterCanvas(detail, photoLocalPath, qrLocalPath, logoLocalPath) {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this).select('#posterCanvas')
        .fields({ node: true, size: true })
        .exec(async (res) => {
          try {
            const canvas = res[0].node;
            const ctx = canvas.getContext('2d');
            const dpr = wx.getSystemInfoSync().pixelRatio || 2;
            const W = 375, H = 640;
            canvas.width = W * dpr;
            canvas.height = H * dpr;
            ctx.scale(dpr, dpr);

            // ── 辅助函数：绘制圆角矩形路径 ──
            const roundRectPath = (x, y, w, h, r) => {
              ctx.beginPath();
              ctx.moveTo(x + r, y);
              ctx.lineTo(x + w - r, y);
              ctx.arcTo(x + w, y, x + w, y + r, r);
              ctx.lineTo(x + w, y + h - r);
              ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
              ctx.lineTo(x + r, y + h);
              ctx.arcTo(x, y + h, x, y + h - r, r);
              ctx.lineTo(x, y + r);
              ctx.arcTo(x, y, x + r, y, r);
              ctx.closePath();
            };

            // ── Layer 1：深色背景兜底 ──
            ctx.fillStyle = '#0f051e';
            ctx.fillRect(0, 0, W, H);

            // ── Layer 2：全出血照片（Cover 模式，不变形）──
            if (photoLocalPath) {
              const photoImg = canvas.createImage();
              photoImg.src = photoLocalPath;
              await new Promise(r => { photoImg.onload = r; photoImg.onerror = r; });
              const imgW = photoImg.width, imgH = photoImg.height;
              const scale = Math.max(W / imgW, H / imgH);
              const drawW = imgW * scale;
              const drawH = imgH * scale;
              const dx = (W - drawW) / 2;
              const dy = Math.min(0, (H - drawH) * 0.15);
              ctx.drawImage(photoImg, dx, dy, drawW, drawH);
            }

            // ── Layer 3：底部渐变遮罩（透明 → 深紫近黑）──
            const grad = ctx.createLinearGradient(0, H * 0.42, 0, H);
            grad.addColorStop(0,    'rgba(15,5,30,0)');
            grad.addColorStop(0.45, 'rgba(15,5,30,0.6)');
            grad.addColorStop(0.75, 'rgba(15,5,30,0.88)');
            grad.addColorStop(1,    'rgba(15,5,30,0.97)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);

            // ── 数据准备 ──
            const ZODIAC_MAP = {
              rat:'鼠', ox:'牛', tiger:'虎', rabbit:'兔', dragon:'龙',
              snake:'蛇', horse:'马', goat:'羊', sheep:'羊',
              monkey:'猴', rooster:'鸡', chicken:'鸡', dog:'狗', pig:'猪'
            };
            const zodiacRaw = (detail.zodiacText || '').replace(/^属/, '').trim();
            const zodiac = ZODIAC_MAP[zodiacRaw.toLowerCase()] || zodiacRaw;
            const surname = detail.name ? detail.name.charAt(0) : '';
            const displayName = surname ? `${surname}阿姨` : '阿姨';
            const subParts = [
              detail.age ? `${detail.age}岁` : '',
              zodiac ? `属${zodiac}` : '',
              (detail.nativePlace || detail.city || '').slice(0, 4),
            ].filter(Boolean);
            const pillTags = [
              detail.jobTypeText || '',
              detail.experienceYears ? `${detail.experienceYears}年经验` : '',
              detail.orderStatusText || '',
            ].filter(Boolean);
            const salary = detail.expectedSalary || '';

            // ── 布局锚点 ──
            const Y_SEP    = 532;
            const bottomZoneAll = H - Y_SEP;
            const qrBlockHAll = 72 + 11 + 5;
            const qrGap = (bottomZoneAll - qrBlockHAll) / 2;
            const Y_ROW2   = Y_SEP - qrGap - 11;
            const Y_ROW1   = Y_ROW2 - 42;
            const bottomZone = H - Y_SEP;
            const brandMid = Y_SEP + bottomZone / 2;
            const Y_SLOGAN = brandMid;
            const QW = 72, QH = 72;
            const qrBlockH = QH + 11 + 5;
            const QX = W - QW - 16;
            const QY = Y_SEP + (bottomZone - qrBlockH) / 2;

            // ── Layer 4：信息文字区（左右两列，各两行）──
            ctx.textBaseline = 'middle';

            // ── 左列 Row1：姓名大字 ──
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 30px sans-serif';
            const nameChars = displayName.split('');
            let nx = 20;
            nameChars.forEach(ch => {
              ctx.fillText(ch, nx, Y_ROW1);
              nx += ctx.measureText(ch).width + 3;
            });

            // ── 左列 Row2：年龄 · 属相 · 籍贯 ──
            if (subParts.length) {
              ctx.fillStyle = 'rgba(255,255,255,0.72)';
              ctx.font = '14px sans-serif';
              ctx.fillText(subParts.join('  ·  '), 20, Y_ROW2);
            }

            // ── 右列 Row1：工种/经验胶囊标签（右对齐，从右往左排） ──
            if (pillTags.length) {
              const pillH = 28, pillR = 14;
              let rx = W - 20;
              [...pillTags].reverse().forEach(tag => {
                ctx.font = '13px sans-serif';
                const tw = ctx.measureText(tag).width;
                const pw = tw + 22;
                rx -= pw;
                if (rx < 20) return;
                roundRectPath(rx, Y_ROW1 - pillH / 2, pw, pillH, pillR);
                ctx.fillStyle = 'rgba(255,255,255,0.13)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.40)';
                ctx.lineWidth = 0.8;
                ctx.stroke();
                ctx.fillStyle = '#ffffff';
                ctx.textBaseline = 'middle';
                ctx.fillText(tag, rx + 11, Y_ROW1 + 1);
                rx -= 8;
              });
            }

            // ── 右列 Row2：月薪金色（右对齐，与副标题同高）──
            if (salary) {
              ctx.fillStyle = '#C8A96E';
              ctx.font = 'bold 22px sans-serif';
              ctx.textBaseline = 'middle';
              ctx.textAlign = 'right';
              ctx.fillText(salary, W - 20, Y_ROW2);
              ctx.textAlign = 'left';
            }

            // ── Layer 5：底部品牌栏 ──
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(16, Y_SEP);
            ctx.lineTo(W - 16, Y_SEP);
            ctx.stroke();

            // 品牌 slogan —— 在二维码左侧区域居中显示
            const sloganText = '为爱，全力以赴！';
            const sloganAreaLeft = 0;
            const sloganAreaRight = QX - 8;
            const sloganCenterX = (sloganAreaLeft + sloganAreaRight) / 2;
            ctx.fillStyle = '#C8A96E';
            ctx.font = 'italic bold 25px "PingFang SC", "STKaiti", "KaiTi", Georgia, serif';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText(sloganText, sloganCenterX, Y_SLOGAN);
            ctx.textAlign = 'left';

            // ── Layer 6：二维码圆角白卡（右侧，顶贴分隔线）──
            roundRectPath(QX, QY, QW, QH, 8);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            if (qrLocalPath) {
              const qrImg = canvas.createImage();
              qrImg.src = qrLocalPath;
              await new Promise(r => { qrImg.onload = r; qrImg.onerror = r; });
              ctx.save();
              roundRectPath(QX + 5, QY + 5, QW - 10, QH - 10, 4);
              ctx.clip();
              ctx.drawImage(qrImg, QX + 5, QY + 5, QW - 10, QH - 10);
              ctx.restore();
            }

            // "扫码查看简历"（QR 正下方居中）
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('扫码查看简历', QX + QW / 2, QY + QH + 11);
            ctx.textAlign = 'left';

            // ── Layer 7：右上角 Logo ──
            if (logoLocalPath) {
              const logoImg = canvas.createImage();
              logoImg.src = logoLocalPath;
              await new Promise(r => { logoImg.onload = r; logoImg.onerror = r; });
              const logoSize = 78;
              const logoX = W - logoSize - 6;
              const logoY = 6;
              ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
            }

            // ── 导出为 jpg ──
            wx.canvasToTempFilePath({
              canvas,
              fileType: 'jpg',
              quality: 0.95,
              success: (r) => resolve(r.tempFilePath),
              fail: reject
            });
          } catch (err) {
            reject(err);
          }
        });
    });
  },

  // 分享给好友（右上角转发按钮）
  onShareAppMessage() {
    const detail = this.data.detail || {};
    const id = detail._id || this.data.id || '';

    // 获取姓氏
    const surname = detail.name ? detail.name.charAt(0) : '某';
    // 获取工种
    const jobType = detail.jobTypeText || '家政服务';

    // 获取头像图片（优先用异步生成的上半身裁剪图，否则回退原图）
    const shareImage = this.data.croppedShareImage || detail.avatarSrc || detail.coverFileId || this.data.shareLogo || '';

    // 优先用 CRM 端锁定的 crmName/crmAvatar，避免员工随便改昵称/头像后污染分享卡片署名
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const sharerName = crmUserInfo.crmName || crmUserInfo.name || crmUserInfo.nickname || '安得褓贝顾问';
    const sharerPhone = crmUserInfo.phone || '';
    const sharerAvatar = crmUserInfo.crmAvatar || crmUserInfo.avatarUrl || crmUserInfo.avatar || '';
    const sharerCompany = '安得褓贝';
    const sharerId = String(crmUserInfo._id || crmUserInfo.id || crmUserInfo.userId || '');

    const isStaffSharer = this.data.isStaff ? '&sf=1' : '';
    const sharePath = `/pages/resumeDetail/index?id=${encodeURIComponent(String(id))}&shared=1&sharerId=${encodeURIComponent(sharerId)}&sharer=${encodeURIComponent(sharerName)}&sharerPhone=${encodeURIComponent(sharerPhone)}&sharerCompany=${encodeURIComponent(sharerCompany)}&sharerAvatar=${encodeURIComponent(sharerAvatar)}${isStaffSharer}`;

    return {
      title: `${surname}阿姨的简历-${jobType}`,
      path: sharePath,
      imageUrl: shareImage
    };
  },

  // 转发到朋友圈
  onShareTimeline() {
    const detail = this.data.detail || {};
    const id = detail._id || this.data.id || '';

    const surname = detail.name ? detail.name.charAt(0) : '某';
    const jobType = detail.jobTypeText || '家政服务';
    const shareImage = this.data.croppedShareImage || detail.avatarSrc || detail.coverFileId || this.data.shareLogo || '';

    // 优先用 CRM 端锁定的 crmName/crmAvatar
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const sharerName = crmUserInfo.crmName || crmUserInfo.name || crmUserInfo.nickname || '安得褓贝顾问';
    const sharerPhone = crmUserInfo.phone || '';
    const sharerAvatar = crmUserInfo.crmAvatar || crmUserInfo.avatarUrl || crmUserInfo.avatar || '';
    const sharerCompany = '安得褓贝';
    const sharerId = String(crmUserInfo._id || crmUserInfo.id || crmUserInfo.userId || '');

    const isStaffSharer = this.data.isStaff ? '&sf=1' : '';
    const shareQuery = `id=${encodeURIComponent(String(id))}&shared=1&sharerId=${encodeURIComponent(sharerId)}&sharer=${encodeURIComponent(sharerName)}&sharerPhone=${encodeURIComponent(sharerPhone)}&sharerCompany=${encodeURIComponent(sharerCompany)}&sharerAvatar=${encodeURIComponent(sharerAvatar)}${isStaffSharer}`;

    return {
      title: `${surname}阿姨的简历-${jobType}`,
      query: shareQuery,
      imageUrl: shareImage
    };
  },

  // 点击分享到朋友圈按钮
  shareToMoments() {
    const detail = this.data.detail || {};
    const surname = detail.name ? detail.name.charAt(0) : '某';
    const jobType = detail.jobTypeText || '家政服务';

    wx.showModal({
      title: '分享到朋友圈',
      content: `即将分享"${surname}阿姨的简历-${jobType}"到朋友圈\n\n请点击右上角"..."按钮，选择"分享到朋友圈"`,
      showCancel: true,
      cancelText: '取消',
      confirmText: '知道了'
    });
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
      itemList.push(`拨打电话：${sharerInfo.phone}`);
      actions.push(() => {
        wx.makePhoneCall({
          phoneNumber: sharerInfo.phone,
          fail: (error) => {
            console.error('拨打电话失败:', error);
            wx.showToast({ title: '拨打电话失败', icon: 'none' });
          }
        });
      });
    }

    if (itemList.length === 0) {
      wx.showToast({ title: '暂无联系方式', icon: 'none' });
      return;
    }

    wx.showActionSheet({
      itemList: itemList,
      success: (res) => {
        if (res.tapIndex < actions.length) {
          actions[res.tapIndex]();
        }
      }
    });
  },

  // 编辑简历
  onEditResume() {
    const id = (this.data.detail && this.data.detail._id) || this.data.id;
    if (!id) {
      wx.showToast({ title: '简历ID缺失', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/admin/resumeEdit/index?id=${encodeURIComponent(String(id))}`
    });
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

  // 调用后端 AI 接口获取推荐文案（无需 Token，用手机号做员工校验；失败时静默返回空串）
  async _fetchRecommendationText() {
    const resumeId = this.data.id || (this.data.detail && this.data.detail._id) || '';
    if (!resumeId) return '';
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const phone = crmUserInfo.phone || wx.getStorageSync('userPhone') || '';
    if (!phone) {
      console.warn('⚠️ 未找到员工手机号，跳过推荐文案获取');
      return '';
    }
    try {
      const res = await publicRequest({
        url: `/resumes/miniprogram/${resumeId}/recommendation`,
        method: 'POST',
        data: { phone }
      });
      // 后端返回体: { success: true, data: { recommendation: "..." } }
      return (res && res.data && res.data.recommendation) ? res.data.recommendation : '';
    } catch (err) {
      console.warn('⚠️ 获取 AI 推荐文案失败，跳过复制:', err);
      return '';
    }
  },

  // "分享简历"按钮 tap 处理器：先复制推荐文案，open-type=share 随后触发原生分享
  async onBeforeShare() {
    // ① 在用户点击事件中申请订阅配额（与 open-type=share 并行，不阻塞分享面板弹出）
    this._requestResumeViewSubscription();

    // ② 同步员工手机号到 users 集合（确保 notificationService 能按手机号找到 openid）
    // 与"图片分享"路径的 saveStaffProfile 保持一致
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const staffId = String(crmUserInfo._id || crmUserInfo.id || crmUserInfo.userId || '');
    const staffPhone = crmUserInfo.phone || '';
    const staffName = crmUserInfo.crmName || crmUserInfo.name || crmUserInfo.nickname || '';
    const staffAvatar = crmUserInfo.crmAvatar || crmUserInfo.avatarUrl || crmUserInfo.avatar || '';
    if (staffId && staffPhone) {
      wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'saveStaffProfile', staffId, name: staffName, phone: staffPhone, avatar: staffAvatar, company: '安得褓贝' }
      }).catch(err => console.warn('⚠️ saveStaffProfile 失败（不影响分享）:', err));
    }

    const text = await this._fetchRecommendationText();
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '推荐理由复制成功', icon: 'success', duration: 2000 });
      }
    });
  },

  // 申请"简历被查看"订阅通知配额（在用户点击事件中调用，fire-and-forget）
  // 每次分享前调用，确保有可用配额；已永久订阅时微信自动跳过弹窗
  _requestResumeViewSubscription() {
    return new Promise((resolve) => {
      wx.requestSubscribeMessage({
        tmplIds: [RESUME_VIEW_TEMPLATE_ID],
        success: (res) => {
          const status = res[RESUME_VIEW_TEMPLATE_ID];
          console.log('📨 订阅配额申请结果:', status);
          resolve(status === 'accept');
        },
        fail: (err) => {
          // 非员工或模板配置问题时忽略，不影响分享主流程
          console.warn('⚠️ 订阅配额申请失败（不影响分享）:', err);
          resolve(false);
        }
      });
    });
  }
});




