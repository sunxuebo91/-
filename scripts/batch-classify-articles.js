/**
 * 批量为历史文章添加 AI 分类标签
 * 
 * 使用方法：
 * 1. 在微信开发者工具的云开发控制台中运行
 * 2. 或者在小程序页面中调用此脚本
 * 
 * 注意：
 * - 会跳过已有标签的文章
 * - 每次处理 50 篇文章（避免超时）
 * - 自动延迟避免频率限制
 */

/**
 * 批量分类文章
 * @param {Object} options 配置选项
 * @param {number} options.batchSize 每批处理数量，默认 50
 * @param {number} options.delay 每篇文章之间的延迟（毫秒），默认 500
 * @param {boolean} options.forceUpdate 是否强制更新已有标签的文章，默认 false
 */
async function batchClassifyArticles(options = {}) {
  const {
    batchSize = 50,
    delay = 500,
    forceUpdate = false
  } = options;

  console.log('🚀 开始批量分类文章...');
  console.log(`   批次大小: ${batchSize}`);
  console.log(`   延迟时间: ${delay}ms`);
  console.log(`   强制更新: ${forceUpdate ? '是' : '否'}`);
  console.log('');

  try {
    // 1. 获取需要分类的文章
    console.log('📊 正在获取文章列表...');
    
    const res = await wx.cloud.callFunction({
      name: 'articleService',
      data: {
        action: 'getArticlesForClassify',
        batchSize: batchSize,
        forceUpdate: forceUpdate
      }
    });

    if (!res.result || !res.result.success) {
      throw new Error(res.result?.errMsg || '获取文章列表失败');
    }

    const articles = res.result.data.articles || [];
    
    if (articles.length === 0) {
      console.log('✅ 没有需要分类的文章');
      return {
        success: true,
        total: 0,
        classified: 0,
        failed: 0
      };
    }

    console.log(`   找到 ${articles.length} 篇待分类文章\n`);

    // 2. 逐篇分类
    const results = {
      total: articles.length,
      classified: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const progress = `[${i + 1}/${articles.length}]`;
      
      console.log(`${progress} 正在分类: ${article.title}`);

      try {
        // 调用 AI 分类
        const classifyRes = await wx.cloud.callFunction({
          name: 'articleService',
          data: {
            action: 'classifyByAI',
            article: {
              title: article.title,
              summary: article.summary,
              content: article.content
            }
          }
        });

        if (classifyRes.result && classifyRes.result.success) {
          const tags = classifyRes.result.data.tags;
          
          // 更新文章标签（这里需要调用 CRM 后台 API）
          // 注意：这部分需要根据实际的 CRM API 进行调整
          console.log(`${progress} ✅ 分类成功: ${tags.join(', ')}`);
          
          results.classified++;
        } else {
          throw new Error(classifyRes.result?.errMsg || '分类失败');
        }

      } catch (error) {
        console.log(`${progress} ❌ 分类失败: ${error.message}`);
        results.failed++;
        results.errors.push({
          articleId: article._id,
          title: article.title,
          error: error.message
        });
      }

      // 延迟，避免频率限制
      if (i < articles.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // 3. 输出统计结果
    console.log('\n' + '='.repeat(60));
    console.log('📊 批量分类完成！');
    console.log(`   总计: ${results.total} 篇`);
    console.log(`   成功: ${results.classified} 篇 (${(results.classified / results.total * 100).toFixed(1)}%)`);
    console.log(`   失败: ${results.failed} 篇 (${(results.failed / results.total * 100).toFixed(1)}%)`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ 失败的文章:');
      results.errors.forEach((err, idx) => {
        console.log(`   ${idx + 1}. ${err.title}: ${err.error}`);
      });
    }
    
    console.log('='.repeat(60));

    return {
      success: true,
      ...results
    };

  } catch (error) {
    console.error('❌ 批量分类失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { batchClassifyArticles };
}

// 挂载到全局
if (typeof window !== 'undefined') {
  window.batchClassifyArticles = batchClassifyArticles;
}

console.log('✅ 批量分类脚本已加载');
console.log('💡 使用方法:');
console.log('   batchClassifyArticles()                    // 默认配置');
console.log('   batchClassifyArticles({ batchSize: 100 }) // 自定义批次大小');
console.log('   batchClassifyArticles({ forceUpdate: true }) // 强制更新所有文章');

