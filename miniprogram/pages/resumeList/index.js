const resumeService = require('../../services/resume.js');


// 月嫂等级映射表（与API保持一致）
const MATERNITY_LEVEL_MAP = {
  'junior': '初级',
  'silver': '银牌',
  'gold': '金牌',
  'platinum': '铂金',
  'diamond': '钻石',
  'crown': '皇冠'
};

// 服务等级选项（自定义弹层，不受 ActionSheet 6 条限制）
const LEVEL_OPTIONS = [
  { key: null, label: '全部' },
  { key: 'crown', label: '皇冠' },
  { key: 'diamond', label: '钻石' },
  { key: 'platinum', label: '铂金' },
  { key: 'gold', label: '金牌' },
  { key: 'silver', label: '银牌' },
  { key: 'junior', label: '初级' }
];

// 工种类型选项（自定义弹层，不受 ActionSheet 6 条限制）
const TYPE_OPTIONS = [
  { key: null, label: '全部', emoji: '📋', iconClass: 'icon-all' },
  { key: 'yuexin', label: '月嫂', icon: '/images/icons/yuexin.svg', iconClass: 'icon-yuexin' },
  { key: 'zhujia-yuer', label: '住家育儿嫂', icon: '/images/icons/yuer.svg', iconClass: 'icon-yuer' },
  { key: 'baiban-yuer', label: '白班育儿嫂', icon: '/images/icons/yuer.svg', iconClass: 'icon-yuer' },
  { key: 'zhujia-baomu', label: '住家保姆', icon: '/images/icons/baomu.svg', iconClass: 'icon-baomu' },
  { key: 'baiban-baomu', label: '白班保姆', icon: '/images/icons/baomu.svg', iconClass: 'icon-baomu' },
  { key: 'xiaoshi', label: '小时工', emoji: '⏰', iconClass: 'icon-xiaoshi' },
  { key: 'zhujia-hulao', label: '住家护老', emoji: '👴', iconClass: 'icon-hulao' }
];

// 视频预加载管理器
class VideoPreloader {
  constructor() {
    this.cache = new Map(); // url -> { status, tempFilePath, timestamp }
    this.downloading = new Set(); // 正在下载的 URL
    this.maxCache = 15; // 最多缓存 15 个视频
    this.preloadQueue = []; // 预加载队列
  }

  // 预加载视频
  async preload(videoUrl, resumeId) {
    if (!videoUrl) {
      console.log('⏭️ 跳过预加载（无效URL）:', videoUrl);
      return null;
    }

    // 如果是 cloud:// 格式，先转换成临时 URL
    if (videoUrl.startsWith('cloud://')) {
      console.log('🔄 转换 cloud:// URL:', resumeId);
      videoUrl = await this._convertCloudUrl(videoUrl);
      if (!videoUrl) {
        console.log('❌ cloud:// URL 转换失败:', resumeId);
        return null;
      }
      console.log('✅ cloud:// URL 转换成功:', resumeId, videoUrl);
    }

    // 已缓存
    if (this.cache.has(videoUrl)) {
      const cached = this.cache.get(videoUrl);
      console.log('✅ 视频已缓存:', resumeId, cached.tempFilePath);
      return cached.tempFilePath;
    }

    // 正在下载
    if (this.downloading.has(videoUrl)) {
      console.log('⏳ 视频正在下载中:', resumeId);
      return null;
    }

    // 开始下载
    this.downloading.add(videoUrl);
    console.log('📥 开始预加载视频:', resumeId);
    console.log('   URL:', videoUrl);

    try {
      const startTime = Date.now();
      const res = await this._downloadFile(videoUrl);
      const duration = Date.now() - startTime;

      console.log('📊 下载响应:', {
        statusCode: res.statusCode,
        duration: duration + 'ms',
        tempFilePath: res.tempFilePath
      });

      if (res.statusCode === 200 && res.tempFilePath) {
        // 保存到缓存
        this.cache.set(videoUrl, {
          status: 'success',
          tempFilePath: res.tempFilePath,
          timestamp: Date.now(),
          resumeId
        });

        // 清理旧缓存
        this._cleanOldCache();

        console.log('✅ 视频预加载成功:', resumeId, '耗时:', duration + 'ms');
        return res.tempFilePath;
      } else {
        console.warn('❌ 下载失败，状态码:', res.statusCode);
      }
    } catch (err) {
      console.error('❌ 视频预加载异常:', resumeId, err);
    } finally {
      this.downloading.delete(videoUrl);
    }

    return null;
  }

  // 批量预加载（限制并发数）
  async batchPreload(videos, maxConcurrent = 3) {
    const queue = [...videos];
    const results = [];

    while (queue.length > 0) {
      const batch = queue.splice(0, maxConcurrent);
      const promises = batch.map(({ videoUrl, resumeId }) =>
        this.preload(videoUrl, resumeId)
      );
      const batchResults = await Promise.allSettled(promises);
      results.push(...batchResults);
    }

    return results;
  }

  // 获取缓存的视频路径
  getCached(videoUrl) {
    const cached = this.cache.get(videoUrl);
    return cached ? cached.tempFilePath : null;
  }

  // 清理旧缓存（FIFO）
  _cleanOldCache() {
    if (this.cache.size <= this.maxCache) return;

    const entries = Array.from(this.cache.entries());
    // 按时间戳排序，删除最旧的
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toDelete = entries.slice(0, this.cache.size - this.maxCache);
    toDelete.forEach(([url]) => {
      console.log('🗑️ 清理旧视频缓存:', url);
      this.cache.delete(url);
    });
  }

  // 转换 cloud:// URL 为临时 HTTPS URL
  _convertCloudUrl(cloudUrl) {
    return new Promise((resolve) => {
      wx.cloud.getTempFileURL({
        fileList: [cloudUrl],
        success: (res) => {
          const temp = res?.fileList?.[0]?.tempFileURL;
          resolve(temp || '');
        },
        fail: (err) => {
          console.warn('❌ 获取临时链接失败:', err);
          resolve('');
        }
      });
    });
  }

  // 下载文件（Promise 封装）
  _downloadFile(url) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        timeout: 30000,
        success: resolve,
        fail: reject
      });
    });
  }

  // 清空所有缓存
  clear() {
    this.cache.clear();
    this.downloading.clear();
    console.log('🗑️ 已清空所有视频缓存');
  }
}

// 全局视频预加载器实例
const videoPreloader = new VideoPreloader();

Page({
  data: {
    keyword: "",
    resumes: [],
    page: 1,  // CRM API 页码从 1 开始
    pageSize: 10,
    hasMore: true,
    loading: false,
    sortText: "默认",
    activeTab: '',  // 当前激活的 tab
    total: 0,  // 总数
    selectedLevel: null,  // 当前选中的等级筛选
    selectedLevelText: '服务等级',  // 当前选中的等级文本
    selectedType: null,  // 当前选中的职位类型筛选
    selectedTypeText: '全部',  // 当前选中的职位类型文本（默认显示全部）
    typeSheetVisible: false,
    typeOptions: TYPE_OPTIONS,
    levelSheetVisible: false,
    levelOptions: LEVEL_OPTIONS
  },

  // 页面显示时的观察器
  intersectionObserver: null,

  onLoad(options) {
    console.log('📋 页面 onLoad, options:', options);

    // 从 URL 参数获取工种
    const jobType = options?.jobType;

    if (jobType) {
      console.log('🔍 从 URL 参数获取工种:', jobType);

      // 根据工种映射到对应的筛选项
      const typeMapping = {
        'baomu': 'zhujia-baomu',      // 保姆 -> 住家保姆
        'yuexin': 'yuexin',            // 月嫂 -> 月嫂
        'yuesao': 'zhujia-yuer',       // 育儿嫂 -> 住家育儿嫂
        'hulao': 'zhujia-hulao'        // 护老 -> 住家护老
      };

      const mappedType = typeMapping[jobType];
      console.log('🔍 映射后的工种:', mappedType);

      if (mappedType) {
        const typeOption = TYPE_OPTIONS.find(opt => opt.key === mappedType);
        if (typeOption) {
          console.log('🔍 设置工种筛选:', typeOption.label, '(', mappedType, ')');
          // 设置筛选条件
          this.setData({
            selectedType: mappedType,
            selectedTypeText: typeOption.label
          });
        }
      }
    }

    // 加载数据
    this.reload();
  },

  onShow() {
    console.log('📋 页面 onShow');
  },



  onReachBottom() {
    this.loadMore();
  },

  onPullDownRefresh() {
    this.reload().finally(() => wx.stopPullDownRefresh());
  },

  // 批量预加载当前页的所有视频（智能限流）
  async preloadAllVideos() {
    const resumes = this.data.resumes.filter(r => r.videoUrl);

    if (resumes.length === 0) {
      console.log('📭 当前列表无视频');
      return;
    }

    console.log('📥 开始预加载视频，共', resumes.length, '个');

    // 分批预加载，每批 3 个，避免网络拥堵
    for (let i = 0; i < resumes.length; i += 3) {
      const batch = resumes.slice(i, i + 3);
      const videos = batch.map(r => ({
        videoUrl: r.videoUrl,
        resumeId: r._id
      }));

      console.log(`� 预加载第 ${Math.floor(i/3) + 1} 批:`, videos.length, '个');

      // 并发下载这一批
      const results = await videoPreloader.batchPreload(videos, 3);

      // 更新 data 中的视频路径（批量更新，避免多次 setData）
      let needUpdate = false;
      const updatedResumes = this.data.resumes.map(r => {
        const batchIndex = batch.findIndex(b => b._id === r._id);
        if (batchIndex >= 0) {
          const result = results[batchIndex];
          if (result.status === 'fulfilled' && result.value) {
            console.log('💾 更新简历视频路径:', r._id, result.value);
            needUpdate = true;
            return { ...r, videoLocalPath: result.value };
          }
        }
        return r;
      });

      if (needUpdate) {
        this.setData({ resumes: updatedResumes });
      }

      // 每批之间延迟 500ms，避免过载
      if (i + 3 < resumes.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('✅ 所有视频预加载完成');
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  async reload() {
    this.setData({ page: 1, resumes: [], hasMore: true });
    await this.loadMore();
  },

  async loadMore() {
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ loading: true });

    try {
      const { page, pageSize, keyword, selectedLevel, selectedType } = this.data;
      console.log('📋 开始加载简历列表, page:', page, 'pageSize:', pageSize, 'keyword:', keyword, 'level:', selectedLevel, 'type:', selectedType);

      // 使用 CRM API 获取简历列表（使用 /resumes 接口）
      const params = {
        page,
        pageSize,
        keyword
      };

      // 如果选择了等级筛选，添加到请求参数
      if (selectedLevel) {
        params.maternityNurseLevel = selectedLevel;
      }

      // 如果选择了职位类型筛选，添加到请求参数
      if (selectedType) {
        params.jobType = selectedType;
        console.log('🔍 职位类型筛选:', selectedType);
      }

      const resp = await resumeService.getResumeList(params);

      console.log('📋 简历列表API响应:', resp);
      console.log('📋 请求参数:', params);

      // CRM API 响应格式: { success: true, data: { items: [...] }, message: "..." }
      if (resp.success) {
        // 数据在 resp.data.items 中
        const rawList = (resp.data && resp.data.items) || [];
        const rawListLength = rawList.length;

        // 兜底：如果后端未实现筛选，这里前端也做一次过滤，保证“有反应”
        let list = rawList;

        // 等级筛选
        if (selectedLevel) {
          list = list.filter(item => item.maternityNurseLevel === selectedLevel);
        }

        // 职位类型筛选
        if (selectedType) {
          list = list.filter(item => {
            console.log('🔍 简历职位类型:', item.name, item.jobType);
            return item.jobType === selectedType;
          });
        }

        console.log('📋 获取到', rawListLength, '条简历',
          (selectedLevel || selectedType) ? `（筛选后 ${list.length} 条）` : '');

        // 转换数据格式以兼容现有页面
        const formattedList = list.map(item => {
          console.log('📋 简历数据:', item._id, item.name);

          // 处理 personalPhoto 数组
          const photos = Array.isArray(item.personalPhoto)
            ? item.personalPhoto.map(p => p.url || p)
            : [];

	      // 格式化工作类型
	      const formatJobType = (jobType) => {
	        if (!jobType) return '';
	        if (jobType.includes('zhuzhai')) return '住家';
	        if (jobType.includes('baiban')) return '白班';
	        if (jobType.includes('buzhu')) return '不住家';
	        if (jobType === 'xiaoshi') return '小时工';
	        return '';  // 不匹配的返回空字符串，不显示
	      };

          // 格式化学历（无或未知学历时不显示，占位符也不显示）
          const formatEducation = (education) => {
            if (!education) return '';

            const map = {
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

            // 如果是未识别的编码，就返回空字符串，不渲染“—”占位符
            return map[education] || '';
          };

          // 格式化籍贯 / 地址：只保留省或直辖市（没有省市时保留前几个字）
          const formatNativePlace = (nativePlace, currentAddress) => {
            const raw = nativePlace || currentAddress || '';
            if (!raw) return '';

            const str = String(raw).trim();
            // 如果本身就很短（2~3 个字），直接返回，例如“朝阳”、“北京”
            if (str.length <= 3) return str;

            // 尝试匹配 “xx省”/“xx市”/“xx自治区”/“xx特别行政区”
            const match = str.match(/^(.+?(省|市|自治区|特别行政区))/);
            if (match && match[1]) {
              return match[1];
            }

            // 兜底：只取前 3 个字，避免整段详细地址太长
            return str.slice(0, 3);
          };

          // 格式化技能标签（拼音转中文）
          const formatSkills = (skills) => {
            console.log('🏷️ 原始技能标签:', skills);
            if (!Array.isArray(skills)) return [];

            // 技能映射表（来自 API: GET /api/resumes/enums）
            const skillMap = {
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

            const formattedSkills = skills.map(skill => {
              // 如果是拼音，转换成中文
              const lowerSkill = String(skill).toLowerCase();
              if (skillMap[lowerSkill]) {
                console.log(`✅ 转换: ${skill} -> ${skillMap[lowerSkill]}`);
                return skillMap[lowerSkill];
              }
              // 如果已经是中文或其他，直接返回
              console.log(`⚠️ 未转换: ${skill}`);
              return skill;
            });
            console.log('🏷️ 格式化后的标签:', formattedSkills);
            return formattedSkills;
          };

          // 调试：打印月嫂等级
          console.log('🏅 月嫂等级 -', item.name, ':', item.maternityNurseLevel);

	      // 预先格式化部分字段，便于后续组合展示
	      const jobTypeText = formatJobType(item.jobType);
	      const educationText = formatEducation(item.education);
	      // 价格单位：
	      // - 月嫂（jobType === 'yuexin'）统一显示“/26天”，不再依赖是否有等级
	      // - 保姆岗位（*baomu）显示“/月”
	      // - 其他类型不显示单位
	      let priceUnit = '';
	      if (item.jobType === 'yuexin') {
	        priceUnit = '/26天';
	      } else {
	        priceUnit = '/月';
	      }

          // 组装“基本信息”单行文案，用竖线分隔，超出时由样式控制省略号
          const infoParts = [];
          // 籍贯：只显示省或直辖市
          const nativeText = formatNativePlace(item.nativePlace, item.currentAddress);
          if (nativeText) infoParts.push(nativeText);
          if (item.age) infoParts.push(`${item.age}岁`);
          if (item.experienceYears) infoParts.push(`${item.experienceYears}年经验`);
          if (jobTypeText) infoParts.push(jobTypeText);
          if (educationText) infoParts.push(educationText);
          const infoLine = infoParts.length ? infoParts.join(' | ') : '—';

	          // 提取视频 URL
            const videoUrl = item.selfIntroductionVideo?.url || '';
            if (videoUrl) {
              console.log('🎬 简历有视频:', item._id, item.name, videoUrl.substring(0, 50) + '...');
            }

            return {
            _id: item._id,  // 使用 _id 而不是 id
            name: item.name,
            age: item.age,
            city: item.currentAddress || item.nativePlace,
            nativePlace: item.nativePlace,
	            experienceYears: item.experienceYears,
	            priceMonth: item.expectedSalary,
	            priceUnit,
            tags: formatSkills(item.skills || []),  // 使用格式化后的标签
            intro: item.selfIntroduction,
            coverFileId: photos[0] || '',
            photos: photos,
            videoUrl: videoUrl,  // 添加视频 URL
            videoLocalPath: '',  // 预加载后的本地路径
            jobType: item.jobType,
            jobTypeText,
            orderStatus: item.orderStatus,
            maternityNurseLevel: item.maternityNurseLevel,
            education: item.education,
            educationText,
            infoLine,
            updatedAt: item.updatedAt
          };
        })
        // 过滤掉没有头像的简历
        .filter(item => item.coverFileId);

        console.log('📋 过滤后剩余', formattedList.length, '条有头像的简历');

        this.setData({
          resumes: this.data.resumes.concat(formattedList),
          page: page + 1,
          // 是否还有更多：使用服务端返回的原始条数判断，避免前端过滤导致提前停止
          hasMore: rawListLength === pageSize,
          // 开启筛选时不使用服务端 total（通常是未筛选的总数），让 header 回退到 resumes.length
          total: selectedLevel ? 0 : (resp.data.total || this.data.resumes.length + formattedList.length)
        });

        // 加载完成后，立即开始预加载所有视频
        console.log('🚀 列表加载完成，开始预加载视频...');
        setTimeout(() => {
          this.preloadAllVideos();
        }, 300);
      } else {
        console.error('📋 简历列表API失败:', resp.message);
        wx.showToast({ title: resp.message || "加载失败", icon: "none" });
      }
    } catch (e) {
      console.error('📋 加载简历列表异常:', e);
      wx.showToast({ title: e.message || "加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/resumeDetail/index?id=${id}`,
    });
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;

    // 激活 tab（用于高亮/下划线），弹窗关闭后会自动复位
    this.setData({ activeTab: tab });

    // 根据不同的 tab 显示不同的选项
    if (tab === 'type') {
      // 工种类型筛选 - 使用自定义弹层（不受 ActionSheet 6 条限制）
      const isOpen = !!this.data.typeSheetVisible;
      this.setData({
        typeSheetVisible: !isOpen,
        activeTab: !isOpen ? 'type' : ''
      });
      return;
    } else if (tab === 'level') {
      // ⚠️ wx.showActionSheet 的 itemList 最多 6 条；这里等级有 7 条，改用自定义弹层
      const isOpen = !!this.data.levelSheetVisible;
      this.setData({
        levelSheetVisible: !isOpen,
        activeTab: !isOpen ? 'level' : ''
      });
      return;
    } else if (tab === 'sort') {
      this.onTapSort();
    } else {
      this.setData({ activeTab: '' });
    }
  },

  onTapFind() {
    wx.showToast({ title: "请联系安得褓贝客服", icon: "none" });
  },

  onTapSort() {
    wx.showActionSheet({
      itemList: ["默认（按更新时间）", "价格从低到高（仅已加载）", "价格从高到低（仅已加载）"],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.setData({ sortText: "默认" });
          return;
        }

        const asc = res.tapIndex === 1;
        const sorted = (this.data.resumes || []).slice().sort((a, b) => {
          const pa = Number(a.priceMonth) || 0;
          const pb = Number(b.priceMonth) || 0;
          return asc ? pa - pb : pb - pa;
        });
        this.setData({
          resumes: sorted,
          sortText: asc ? "价格↑" : "价格↓",
        });
      },
      complete: () => {
        this.setData({ activeTab: '' });
      }
    });
  },

  // 根据月嫂等级筛选
  filterByLevel(level) {
    console.log('筛选等级:', level);
    const levelText = level ? MATERNITY_LEVEL_MAP[level] : '服务等级';
    this.setData({ 
      selectedLevel: level,
      selectedLevelText: levelText,
      levelSheetVisible: false,
      activeTab: ''  // 关闭tab激活状态
    }, () => {
      this.reload();
    });
  },

  closeLevelSheet() {
    this.setData({ levelSheetVisible: false, activeTab: '' });
  },

  noop() {},

  onPickLevel(e) {
    const level = e.currentTarget.dataset.level;
    this.filterByLevel(level);
  },

  // 选择工种类型
  onPickType(e) {
    const type = e.currentTarget.dataset.type;
    this.filterByType(type);
  },

  // 根据工种类型筛选
  filterByType(type) {
    console.log('筛选工种:', type);
    // 从 TYPE_OPTIONS 中找到对应的 label
    const typeOption = TYPE_OPTIONS.find(opt => opt.key === type);
    const typeText = typeOption ? typeOption.label : '月嫂';

    this.setData({
      selectedType: type,
      selectedTypeText: typeText,
      typeSheetVisible: false,
      activeTab: ''  // 关闭tab激活状态
    }, () => {
      this.reload();
    });
  },

  // 关闭工种类型弹窗
  closeTypeSheet() {
    this.setData({ typeSheetVisible: false, activeTab: '' });
  }
});
