/**
 * AI 分类功能命令行测试脚本
 * 用于在部署云函数后快速测试 AI 分类功能
 * 
 * 使用方法：
 * 1. 先在微信开发者工具中部署 articleService 云函数
 * 2. 在小程序开发者工具的控制台中运行此脚本
 */

// 测试文章数据
const testArticles = [
  {
    title: '孕期如何补充叶酸？备孕妈妈必看',
    summary: '叶酸是孕前和孕早期必须补充的营养素，可以预防胎儿神经管畸形。',
    content: '备孕期间，建议每天补充400微克叶酸...',
    expectedTags: ['备孕好孕']
  },
  {
    title: '孕期产检时间表，准妈妈收藏',
    summary: '从怀孕到分娩，需要做哪些产检？什么时候做？',
    content: '孕早期需要做B超确认宫内孕，孕中期做唐筛、四维...',
    expectedTags: ['孕期呵护']
  },
  {
    title: '月子餐怎么吃？产后恢复食谱推荐',
    summary: '科学的月子餐可以帮助产后妈妈快速恢复身体。',
    content: '产后第一周以排恶露为主，饮食宜清淡...',
    expectedTags: ['产后恢复']
  },
  {
    title: '新生儿黄疸怎么办？什么时候需要就医',
    summary: '大部分新生儿都会出现黄疸，家长不必过于担心。',
    content: '生理性黄疸一般在出生后2-3天出现...',
    expectedTags: ['新生儿养护']
  },
  {
    title: '6个月宝宝辅食添加指南',
    summary: '宝宝6个月后可以开始添加辅食，从米粉开始。',
    content: '第一口辅食建议选择强化铁的米粉...',
    expectedTags: ['婴幼护理']
  },
  {
    title: '0-3岁宝宝早教启蒙，亲子互动游戏推荐',
    summary: '早教不是上课，而是在日常生活中的亲子互动。',
    content: '通过绘本阅读、互动游戏培养宝宝的专注力...',
    expectedTags: ['亲子早教']
  }
];

/**
 * 测试单篇文章分类
 */
async function testSingleArticle(article, index) {
  console.log(`\n📝 测试文章 ${index + 1}: ${article.title}`);
  console.log(`   期望标签: ${article.expectedTags.join(', ')}`);
  
  try {
    const res = await wx.cloud.callFunction({
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

    if (res.result && res.result.success) {
      const tags = res.result.data.tags;
      const isCorrect = tags.some(tag => article.expectedTags.includes(tag));
      
      console.log(`   ✅ AI 分类: ${tags.join(', ')}`);
      console.log(`   ${isCorrect ? '✅ 分类正确' : '⚠️ 分类可能不准确'}`);
      
      return { success: true, correct: isCorrect, tags };
    } else {
      console.log(`   ❌ 分类失败: ${res.result?.errMsg || '未知错误'}`);
      return { success: false };
    }
  } catch (error) {
    console.log(`   ❌ 调用失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 批量测试所有文章
 */
async function testAllArticles() {
  console.log('🚀 开始批量测试 AI 分类功能...\n');
  console.log('=' .repeat(60));
  
  const results = [];
  
  for (let i = 0; i < testArticles.length; i++) {
    const result = await testSingleArticle(testArticles[i], i);
    results.push(result);
    
    // 避免频率限制
    if (i < testArticles.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // 统计结果
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 测试结果统计:');
  
  const successCount = results.filter(r => r.success).length;
  const correctCount = results.filter(r => r.success && r.correct).length;
  
  console.log(`   总测试数: ${testArticles.length}`);
  console.log(`   成功调用: ${successCount} (${(successCount / testArticles.length * 100).toFixed(1)}%)`);
  console.log(`   分类准确: ${correctCount} (${(correctCount / testArticles.length * 100).toFixed(1)}%)`);
  
  if (successCount === testArticles.length && correctCount === testArticles.length) {
    console.log('\n🎉 所有测试通过！AI 分类功能工作正常！');
  } else if (successCount === testArticles.length) {
    console.log('\n✅ AI 调用成功，但部分分类可能需要优化 prompt');
  } else {
    console.log('\n⚠️ 部分测试失败，请检查云函数配置');
  }
  
  console.log('\n' + '='.repeat(60));
}

// 导出测试函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testSingleArticle, testAllArticles, testArticles };
}

// 如果在浏览器环境中，挂载到全局
if (typeof window !== 'undefined') {
  window.testAIClassify = { testSingleArticle, testAllArticles, testArticles };
}

console.log('✅ AI 分类测试脚本已加载');
console.log('💡 使用方法:');
console.log('   1. 确保已部署 articleService 云函数');
console.log('   2. 在控制台运行: testAllArticles()');
console.log('   3. 或测试单篇: testSingleArticle(testArticles[0], 0)');

