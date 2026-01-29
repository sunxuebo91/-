/**
 * 快速测试 AI 分类功能
 * 在微信开发者工具控制台中直接运行
 */

// 测试单篇文章
async function quickTest() {
  console.log('🚀 开始测试 AI 分类功能...\n');
  
  const testArticle = {
    title: '孕期如何补充叶酸？备孕妈妈必看',
    summary: '叶酸是孕前和孕早期必须补充的营养素，可以预防胎儿神经管畸形。',
    content: '备孕期间，建议每天补充400微克叶酸...'
  };
  
  console.log('📝 测试文章:', testArticle.title);
  console.log('   期望标签: 备孕好孕\n');
  
  try {
    const res = await wx.cloud.callFunction({
      name: 'articleService',
      data: {
        action: 'classifyByAI',
        article: testArticle
      }
    });
    
    console.log('📦 云函数返回:', res);
    
    if (res.result && res.result.success) {
      const tags = res.result.data.tags;
      console.log('\n✅ AI 分类成功!');
      console.log('   分类结果:', tags);
      console.log('   云函数版本:', res.result.meta?.version);
      
      if (tags.includes('备孕好孕')) {
        console.log('\n🎉 测试通过！分类准确！');
      } else {
        console.log('\n⚠️ 分类结果可能需要优化');
      }
    } else {
      console.log('\n❌ 分类失败:', res.result?.errMsg || '未知错误');
    }
  } catch (error) {
    console.log('\n❌ 调用失败:', error);
    console.log('\n💡 可能的原因:');
    console.log('   1. 云函数未部署或版本不对');
    console.log('   2. 微信云开发 AI 能力未开通');
    console.log('   3. 网络问题');
  }
}

// 自动运行测试
console.log('✅ 快速测试脚本已加载');
console.log('💡 运行测试: quickTest()');
console.log('');

// 如果在浏览器环境，挂载到全局
if (typeof window !== 'undefined') {
  window.quickTest = quickTest;
}

