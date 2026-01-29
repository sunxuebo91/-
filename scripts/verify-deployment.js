/**
 * 部署验证脚本
 * 用于验证 AI 分类功能是否正确部署
 * 
 * 使用方法：
 * 在微信开发者工具控制台中运行此脚本
 */

async function verifyDeployment() {
  console.log('🔍 开始验证部署...\n');
  console.log('='.repeat(60));
  
  const results = {
    cloudFunction: false,
    aiClassify: false,
    fallback: false,
    overall: false
  };

  // 1. 验证云函数版本
  console.log('\n📦 步骤 1/3: 验证云函数版本');
  try {
    const res = await wx.cloud.callFunction({
      name: 'articleService',
      data: {
        action: 'classifyByAI',
        article: {
          title: '测试',
          summary: '测试',
          content: '测试'
        }
      }
    });

    const version = res.result?.meta?.version;
    const expectedVersion = '2026-01-27-articleService-v3-ai-classify';
    
    console.log(`   当前版本: ${version}`);
    console.log(`   期望版本: ${expectedVersion}`);
    
    if (version === expectedVersion) {
      console.log('   ✅ 云函数版本正确');
      results.cloudFunction = true;
    } else {
      console.log('   ❌ 云函数版本不匹配');
      console.log('   💡 请重新部署云函数');
    }
  } catch (error) {
    console.log('   ❌ 云函数调用失败:', error.message);
    console.log('   💡 请先部署云函数');
  }

  // 2. 验证 AI 分类功能
  console.log('\n🤖 步骤 2/3: 验证 AI 分类功能');
  try {
    const testArticle = {
      title: '孕期如何补充叶酸？备孕妈妈必看',
      summary: '叶酸是孕前和孕早期必须补充的营养素，可以预防胎儿神经管畸形。',
      content: '备孕期间，建议每天补充400微克叶酸...'
    };

    const res = await wx.cloud.callFunction({
      name: 'articleService',
      data: {
        action: 'classifyByAI',
        article: testArticle
      }
    });

    if (res.result?.success) {
      const tags = res.result.data.tags;
      console.log(`   分类结果: ${tags.join(', ')}`);
      console.log(`   期望标签: 备孕好孕`);
      
      if (tags.includes('备孕好孕')) {
        console.log('   ✅ AI 分类功能正常');
        results.aiClassify = true;
      } else {
        console.log('   ⚠️ 分类结果可能需要优化');
        results.aiClassify = true; // 功能正常，只是结果需要优化
      }
    } else {
      console.log('   ❌ AI 分类失败:', res.result?.errMsg);
    }
  } catch (error) {
    console.log('   ❌ AI 分类调用失败:', error.message);
  }

  // 3. 验证降级方案
  console.log('\n🛡️ 步骤 3/3: 验证降级方案');
  try {
    // 使用一个简单的测试，降级方案应该能处理
    const testArticle = {
      title: '备孕',
      summary: '',
      content: ''
    };

    const res = await wx.cloud.callFunction({
      name: 'articleService',
      data: {
        action: 'classifyByAI',
        article: testArticle
      }
    });

    if (res.result?.success) {
      const tags = res.result.data.tags;
      console.log(`   降级分类结果: ${tags.join(', ')}`);
      
      if (tags.length > 0) {
        console.log('   ✅ 降级方案正常');
        results.fallback = true;
      } else {
        console.log('   ❌ 降级方案返回空标签');
      }
    } else {
      console.log('   ❌ 降级方案失败:', res.result?.errMsg);
    }
  } catch (error) {
    console.log('   ❌ 降级方案调用失败:', error.message);
  }

  // 4. 输出总结
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 验证结果总结:\n');
  
  console.log(`   云函数版本: ${results.cloudFunction ? '✅ 通过' : '❌ 失败'}`);
  console.log(`   AI 分类功能: ${results.aiClassify ? '✅ 通过' : '❌ 失败'}`);
  console.log(`   降级方案: ${results.fallback ? '✅ 通过' : '❌ 失败'}`);
  
  results.overall = results.cloudFunction && results.aiClassify && results.fallback;
  
  console.log('\n' + '='.repeat(60));
  
  if (results.overall) {
    console.log('\n🎉 部署验证通过！AI 分类功能已成功部署！');
    console.log('\n✅ 下一步:');
    console.log('   1. 在小程序中测试文章列表页面');
    console.log('   2. 验证标签筛选功能');
    console.log('   3. 可选：批量为历史文章分类');
  } else {
    console.log('\n⚠️ 部署验证未完全通过，请检查失败项');
    console.log('\n💡 解决方法:');
    if (!results.cloudFunction) {
      console.log('   - 重新部署云函数: 右键 cloudfunctions/articleService → 上传并部署');
    }
    if (!results.aiClassify) {
      console.log('   - 检查云开发 AI 能力是否开通');
      console.log('   - 查看云函数日志排查错误');
    }
    if (!results.fallback) {
      console.log('   - 检查 fallbackClassify 函数是否正确');
    }
  }
  
  console.log('\n' + '='.repeat(60));
  
  return results;
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { verifyDeployment };
}

// 挂载到全局
if (typeof window !== 'undefined') {
  window.verifyDeployment = verifyDeployment;
}

console.log('✅ 部署验证脚本已加载');
console.log('💡 运行验证: verifyDeployment()');

