const articleService = require('../../services/article.js');

Page({
  data: {
    // 轮播图配置
    indicatorDots: true,
    autoplay: true,
    interval: 5000,
    duration: 500,
    // 轮播图数据
    bannerList: [],
    // 文章相关数据
    articles: [],
    articlesLoading: false
  },

  async onLoad() {
    // 并行加载所有数据，不等待初始化阅读量完成
    Promise.all([
      this.autoInitializeViewCounts(), // 后台初始化，不阻塞
      this.loadBanners(),
      this.loadArticles()
    ]).catch(err => {
      console.error('❌ 页面加载出错:', err);
    });
  },

  /**
   * 自动初始化阅读量（仅首次运行）
   */
  async autoInitializeViewCounts() {
    try {
      // 检查是否已经初始化过
      const hasInitialized = wx.getStorageSync('viewCountsInitialized');
      if (hasInitialized) {
        console.log('📊 阅读量已初始化，跳过');
        return;
      }

      console.log('🔄 首次启动，正在初始化阅读量...');
      const result = await articleService.batchInitializeViewCounts();

      if (result.success) {
        // 标记已初始化
        wx.setStorageSync('viewCountsInitialized', true);
        console.log('✅ 阅读量初始化成功:', result);
      }
    } catch (err) {
      console.error('❌ 阅读量初始化失败:', err);
      // 失败不影响页面加载
    }
  },

  onShow() {
    // 更新自定义 tabBar 选中状态（首页是索引0）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0
      });
    }
  },

  // 加载Banner列表
  loadBanners() {
    console.log('🎨 开始加载Banner列表');
    wx.request({
      url: 'https://crm.andejiazheng.com/api/banners/miniprogram/active',
      method: 'GET',
      success: (res) => {
        console.log('🎨 Banner API响应:', res);
        if (res.data && res.data.success) {
          const banners = res.data.data || [];
          console.log('🎨 获取到', banners.length, '个Banner');
          // 按order字段排序
          banners.sort((a, b) => (a.order || 0) - (b.order || 0));
          this.setData({ bannerList: banners });
        } else {
          console.warn('🎨 Banner API返回失败:', res.data?.message);
        }
      },
      fail: (err) => {
        console.error('🎨 Banner API请求失败:', err);
      }
    });
  },

  goResumeList(e) {
    const jobType = e?.currentTarget?.dataset?.jobtype;
    console.log('🏠 首页点击按钮，工种:', jobType);

    // 跳转到简历列表页（普通页面跳转，带参数）
    wx.navigateTo({
      url: `/pages/resumeList/index?jobType=${jobType}`,
      success: () => {
        console.log('🏠 navigateTo 成功');
      },
      fail: (err) => {
        console.error('🏠 navigateTo 失败:', err);
      }
    });
  },

  goService(e) {
    const type = e?.currentTarget?.dataset?.type;
    console.log('goService type:', type);
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 跳转到透明服务页面
  goTransparentService() {
    wx.navigateTo({
      url: '/pages/transparentService/index',
      fail: (err) => {
        console.error('跳转失败:', err);
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        });
      }
    });
  },

  // 跳转到答疑解惑页面
  goQA() {
    wx.navigateTo({
      url: '/pages/qaService/index',
      fail: (err) => {
        console.error('跳转失败:', err);
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        });
      }
    });
  },

  // 加载文章列表
  async loadArticles() {
    this.setData({ articlesLoading: true });
    console.log('📰 开始加载文章列表');

    try {
      // 1. 从后端API获取文章列表
      const resp = await articleService.getArticleList({
        page: 1,
        pageSize: 6  // 只加载6篇文章
      });

      console.log('📰 文章列表API响应:', resp);

      if (!resp || !resp.success || !resp.data) {
        console.warn('📰 文章列表API返回失败:', resp?.message);
        return;
      }

      const articles = resp.data.list || [];
      console.log('📰 获取到', articles.length, '篇文章');

      if (articles.length === 0) {
        console.warn('📰 ⚠️ 数据库中没有已发布的文章！');
        this.setData({ articles: [] });
        return;
      }

      // 2. 从云数据库获取阅读量
      const getArticleId = (a) => a?._id || a?.id || a?.articleId || a?.article_id;
      const articleIdPreview = articles.map(a => ({
        _id: a?._id,
        id: a?.id,
        articleId: a?.articleId,
        title: a?.title
      }));
      console.log('📰 文章ID字段预览(_id/id/articleId):', articleIdPreview);

      const articleIds = articles
        .map(a => getArticleId(a))
        .filter(id => id !== undefined && id !== null && String(id).trim() !== '')
        .map(id => String(id));

      console.log('📰 准备获取阅读量，文章IDs:', articleIds);

      if (articles.length > 0 && articleIds.length === 0) {
        console.error('📰 ❌ 文章列表有数据，但未提取到任何文章ID；请检查接口字段是否为 _id/id/articleId');
        wx.showToast({ title: '文章ID缺失，阅读量无法加载', icon: 'none' });
      }

      let viewCountMap = {};
      try {
        viewCountMap = await articleService.batchGetViewCounts(articleIds);
        console.log('📰 获取到阅读量映射:', viewCountMap);
      } catch (err) {
        console.error('📰 获取阅读量失败，使用默认值0:', err);
      }

      // 3. 合并数据
      const formattedArticles = articles.map(article => {
        const articleId = getArticleId(article);
        const normalizedId = (articleId !== undefined && articleId !== null) ? String(articleId) : '';
        const viewCount = normalizedId ? (viewCountMap[normalizedId] || 0) : 0;
        console.log(`📰 文章 ${article.title} (id=${normalizedId || 'N/A'}) 阅读量: ${viewCount}`);

        return {
          _id: normalizedId,
          title: article.title || '无标题',
          author: article.author || '安得褓贝',
          source: article.source || '',
          summary: article.summary || '',
          coverImage: article.coverImage || (article.imageUrls && article.imageUrls[0]) || '',
          publishedAt: article.publishedAt || article.createdAt,
          viewCount: viewCount
        };
      });

      console.log('📰 最终文章数据:', formattedArticles);
      this.setData({ articles: formattedArticles });

    } catch (e) {
      console.error('📰 加载文章列表异常:', e);
      console.error('📰 错误详情:', e.message);
    } finally {
      this.setData({ articlesLoading: false });
    }
  },

  // 跳转到文章详情页
  goArticleDetail(e) {
    const id = e?.currentTarget?.dataset?.id;
    console.log('📰 点击文章:', id);

    if (!id) {
      wx.showToast({ title: '文章ID缺失', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pages/articleDetail/index?id=${encodeURIComponent(String(id))}`
    });
  },

  // 轮播图点击事件
  onBannerTap(e) {
    const item = e?.currentTarget?.dataset?.item;
    console.log('🖼️ Banner 点击:', item);

    if (!item || !item.linkType) {
      console.log('🖼️ Banner 无跳转配置');
      return;
    }

    // 根据 linkType 处理不同的跳转类型
    switch (item.linkType) {
      case 'page':
        // 小程序内页面跳转
        if (item.linkUrl) {
          wx.navigateTo({
            url: item.linkUrl,
            fail: () => {
              // 如果是 tabBar 页面，使用 switchTab
              wx.switchTab({
                url: item.linkUrl,
                fail: (err) => {
                  console.error('🖼️ 页面跳转失败:', err);
                  wx.showToast({ title: '页面跳转失败', icon: 'none' });
                }
              });
            }
          });
        }
        break;

      case 'miniprogram':
        // 跳转到其他小程序
        if (item.appId) {
          wx.navigateToMiniProgram({
            appId: item.appId,
            path: item.linkUrl || '',
            fail: (err) => {
              console.error('🖼️ 小程序跳转失败:', err);
              wx.showToast({ title: '小程序跳转失败', icon: 'none' });
            }
          });
        }
        break;

      case 'web':
        // 打开网页（需要配置业务域名）
        if (item.linkUrl) {
          wx.navigateTo({
            url: `/pages/web/index?url=${encodeURIComponent(item.linkUrl)}`,
            fail: (err) => {
              console.error('🖼️ 网页跳转失败:', err);
              wx.showToast({ title: '网页跳转失败', icon: 'none' });
            }
          });
        }
        break;

      case 'none':
      default:
        // 无跳转
        console.log('🖼️ Banner 无跳转');
        break;
    }
  }
});
