/**
 * AI 分类功能测试页面
 * 用于测试云函数的 AI 分类功能
 */

Page({
  data: {
    testArticles: [
      {
        title: '孕期如何补充叶酸？备孕妈妈必看',
        summary: '叶酸是孕前和孕早期必须补充的营养素，可以预防胎儿神经管畸形。',
        content: '备孕期间，建议每天补充400微克叶酸...'
      },
      {
        title: '孕期产检时间表，准妈妈收藏',
        summary: '从怀孕到分娩，需要做哪些产检？什么时候做？',
        content: '孕早期需要做B超确认宫内孕，孕中期做唐筛、四维...'
      },
      {
        title: '月子餐怎么吃？产后恢复食谱推荐',
        summary: '科学的月子餐可以帮助产后妈妈快速恢复身体。',
        content: '产后第一周以排恶露为主，饮食宜清淡...'
      },
      {
        title: '新生儿黄疸怎么办？什么时候需要就医',
        summary: '大部分新生儿都会出现黄疸，家长不必过于担心。',
        content: '生理性黄疸一般在出生后2-3天出现...'
      },
      {
        title: '6个月宝宝辅食添加指南',
        summary: '宝宝6个月后可以开始添加辅食，从米粉开始。',
        content: '第一口辅食建议选择强化铁的米粉...'
      },
      {
        title: '0-3岁宝宝早教启蒙，亲子互动游戏推荐',
        summary: '早教不是上课，而是在日常生活中的亲子互动。',
        content: '通过绘本阅读、互动游戏培养宝宝的专注力...'
      }
    ],
    results: [],
    testing: false
  },

  onLoad() {
    console.log('AI 分类测试页面加载');
  },

  /**
   * 测试单篇文章分类
   */
  async testSingleArticle(e) {
    const index = e.currentTarget.dataset.index;
    const article = this.data.testArticles[index];

    wx.showLoading({ title: '分类中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'articleService',
        data: {
          action: 'classifyByAI',
          article: article
        }
      });

      console.log('AI 分类结果:', res);

      if (res.result && res.result.success) {
        const tags = res.result.data.tags;
        wx.showToast({
          title: `分类成功: ${tags.join(', ')}`,
          icon: 'success',
          duration: 3000
        });

        // 更新结果
        const results = this.data.results;
        results[index] = {
          article: article.title,
          tags: tags,
          success: true
        };
        this.setData({ results });
      } else {
        wx.showToast({
          title: '分类失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('测试失败:', error);
      wx.showToast({
        title: '调用失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 批量测试所有文章
   */
  async testAllArticles() {
    this.setData({ testing: true, results: [] });
    wx.showLoading({ title: '批量测试中...' });

    const results = [];

    for (let i = 0; i < this.data.testArticles.length; i++) {
      const article = this.data.testArticles[i];
      
      try {
        const res = await wx.cloud.callFunction({
          name: 'articleService',
          data: {
            action: 'classifyByAI',
            article: article
          }
        });

        if (res.result && res.result.success) {
          results.push({
            article: article.title,
            tags: res.result.data.tags,
            success: true
          });
        } else {
          results.push({
            article: article.title,
            error: res.result?.errMsg || '未知错误',
            success: false
          });
        }
      } catch (error) {
        results.push({
          article: article.title,
          error: error.message,
          success: false
        });
      }

      // 更新进度
      this.setData({ results: [...results] });
      
      // 避免频率限制
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    wx.hideLoading();
    this.setData({ testing: false });

    wx.showToast({
      title: '测试完成',
      icon: 'success'
    });
  }
});

