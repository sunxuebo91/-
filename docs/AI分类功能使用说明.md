# AI 智能分类功能使用说明

## 📋 功能概述

已成功实现 AI 智能分类功能，使用 DeepSeek-V3 大模型为文章自动分类，替代原有的关键词匹配算法。

## ✅ 已完成的工作

### 1. 云函数实现 ✅

**文件**: `cloudfunctions/articleService/index.js`

**新增功能**:
- `classifyArticleByAI(article)` - 使用 AI 进行智能分类
- `fallbackClassify(article)` - 降级方案（简单关键词匹配）
- 新增 action: `classifyByAI` - 云函数入口

**特性**:
- ✅ 使用 DeepSeek-V3 模型
- ✅ 支持6个分类标签
- ✅ 自动降级到关键词匹配
- ✅ 详细的日志输出
- ✅ 错误处理机制

### 2. 前端优化 ✅

**文件**: `miniprogram/pages/articleList/index.js`

**优化内容**:
- ✅ 优先使用后端返回的标签（AI 分类结果）
- ✅ 后端无标签时使用前端简化分类
- ✅ 保持向后兼容

### 3. 测试页面 ✅

**文件**: 
- `miniprogram/pages/test-ai-classify.js`
- `miniprogram/pages/test-ai-classify.wxml`
- `miniprogram/pages/test-ai-classify.wxss`
- `miniprogram/pages/test-ai-classify.json`

**功能**:
- ✅ 单篇文章测试
- ✅ 批量测试
- ✅ 结果展示
- ✅ 准确率统计

### 4. 测试脚本 ✅

**文件**: `test-ai-classify-cli.js`

**功能**:
- ✅ 命令行测试
- ✅ 6个典型测试用例
- ✅ 准确率统计

---

## 🚀 部署步骤

### 步骤 1：部署云函数

1. 打开微信开发者工具
2. 右键点击 `cloudfunctions/articleService` 文件夹
3. 选择 **"上传并部署：云端安装依赖"**
4. 等待部署完成（约1-2分钟）

### 步骤 2：测试 AI 分类功能

#### 方法 A：使用测试页面（推荐）

1. 在微信开发者工具中编译小程序
2. 在模拟器中访问测试页面：`pages/test-ai-classify`
3. 点击 **"批量测试所有文章"** 按钮
4. 查看分类结果

#### 方法 B：使用命令行测试

1. 在微信开发者工具的控制台中运行：
```javascript
// 加载测试脚本
require('./test-ai-classify-cli.js')

// 运行批量测试
testAllArticles()
```

2. 查看控制台输出的测试结果

### 步骤 3：验证功能

测试通过标准：
- ✅ 所有6篇测试文章都能成功调用 AI
- ✅ 分类准确率达到 100%（或至少 80%+）
- ✅ 没有报错信息

---

## 📊 使用方式

### 在 CRM 后台集成（推荐）

在文章发布/更新时自动调用 AI 分类：

```javascript
// CRM 后台文章发布接口
async function publishArticle(articleData) {
  // 1. 调用云函数进行 AI 分类
  const result = await wx.cloud.callFunction({
    name: 'articleService',
    data: {
      action: 'classifyByAI',
      article: {
        title: articleData.title,
        summary: articleData.summary,
        content: articleData.content
      }
    }
  });
  
  const tags = result.result.data.tags || ['未分类'];
  
  // 2. 保存文章时包含标签
  await db.collection('articles').add({
    data: {
      ...articleData,
      tags: tags,
      primaryTag: tags[0],
      status: 'published',
      publishedAt: new Date()
    }
  });
  
  console.log(`文章《${articleData.title}》已分类为: ${tags.join(', ')}`);
}
```

### 在小程序端调用

```javascript
// 为单篇文章分类
const res = await wx.cloud.callFunction({
  name: 'articleService',
  data: {
    action: 'classifyByAI',
    article: {
      title: '孕期如何补充叶酸',
      summary: '叶酸是孕前和孕早期必须补充的营养素',
      content: '备孕期间，建议每天补充400微克叶酸...'
    }
  }
});

const tags = res.result.data.tags;
console.log('AI 分类结果:', tags);  // ['备孕好孕']
```

---

## 💰 成本分析

### DeepSeek-V3 定价
- **输入**: 0.07元/百万tokens
- **输出**: 0.28元/百万tokens

### 单次分类成本
- 单篇文章约 750 tokens
- 单次分类成本: **约 0.0001元**（1分钱可以分类100篇）

### 月度成本估算
- 假设每天发布 10 篇文章
- 每月 300 篇文章
- **月成本**: 300 × 0.0001 = **0.03元**

**结论：成本几乎可以忽略不计！**

---

## 🎯 分类标签说明

| 标签 | 适用内容 |
|------|---------|
| **备孕好孕** | 备孕准备、孕前检查、叶酸补充、排卵受孕等 |
| **孕期呵护** | 孕期保健、产检、胎动、孕期饮食、孕期不适等 |
| **产后恢复** | 月子护理、产后修复、哺乳催乳、产后抑郁等 |
| **新生儿养护** | 0-3个月宝宝护理、新生儿喂养、黄疸、脐带护理等 |
| **婴幼护理** | 4个月以上宝宝护理、辅食添加、生长发育、常见疾病等 |
| **亲子早教** | 早教启蒙、亲子互动、绘本阅读、习惯培养等 |

---

## 🔧 故障排查

### 问题 1：AI 调用失败

**可能原因**:
- 云函数未部署或版本不对
- 微信云开发 AI 能力未开通
- 网络问题

**解决方法**:
1. 检查云函数版本号（应为 `2026-01-27-articleService-v3-ai-classify`）
2. 查看云函数日志
3. 使用降级方案（自动触发）

### 问题 2：分类不准确

**可能原因**:
- Prompt 需要优化
- 文章内容不够清晰

**解决方法**:
1. 调整 `classifyArticleByAI` 函数中的 prompt
2. 增加更多示例说明
3. 调整 temperature 参数（当前为 0.3）

---

## 📝 后续优化建议

1. **批量处理历史文章** - 为现有文章批量分类
2. **人工审核机制** - 允许手动修改 AI 分类结果
3. **分类日志** - 记录分类历史，用于优化 prompt
4. **A/B 测试** - 对比 AI 分类和关键词分类的效果

---

## 📞 技术支持

如有问题，请查看：
- 云函数日志：微信开发者工具 → 云开发 → 云函数 → articleService → 日志
- 测试页面：`pages/test-ai-classify`
- 优化方案文档：`docs/标签匹配算法优化方案.md`

