# AI 分类功能部署指南

## 📋 部署检查清单

### 部署前检查 ✅

- [x] 云函数代码已更新（`cloudfunctions/articleService/index.js`）
- [x] 前端代码已优化（`miniprogram/pages/articleList/index.js`）
- [x] 测试页面已创建（`miniprogram/pages/test-ai-classify.*`）
- [x] 测试脚本已准备（`test-ai-quick.js`）
- [x] 批量分类脚本已创建（`scripts/batch-classify-articles.js`）
- [x] 文档已完善

### 部署步骤 📝

- [ ] 1. 部署云函数到生产环境
- [ ] 2. 验证云函数版本和功能
- [ ] 3. 测试 AI 分类功能
- [ ] 4. 编译并上传小程序代码
- [ ] 5. 提交审核（可选）

---

## 🚀 详细部署步骤

### 步骤 1：部署云函数（必须）

#### 1.1 上传云函数

1. 打开微信开发者工具
2. 在左侧文件树中找到 `cloudfunctions/articleService`
3. **右键点击** `articleService` 文件夹
4. 选择 **"上传并部署：云端安装依赖"**
5. 等待部署完成（约 1-2 分钟）

#### 1.2 验证部署

在控制台运行以下代码验证：

```javascript
(async function() {
  const res = await wx.cloud.callFunction({
    name: 'articleService',
    data: { action: 'classifyByAI', article: { 
      title: '测试', 
      summary: '测试', 
      content: '测试' 
    }}
  });
  console.log('云函数版本:', res.result?.meta?.version);
  console.log('期望版本: 2026-01-27-articleService-v3-ai-classify');
  console.log('部署状态:', res.result?.meta?.version === '2026-01-27-articleService-v3-ai-classify' ? '✅ 成功' : '❌ 失败');
})();
```

**预期输出**:
```
云函数版本: 2026-01-27-articleService-v3-ai-classify
期望版本: 2026-01-27-articleService-v3-ai-classify
部署状态: ✅ 成功
```

---

### 步骤 2：测试 AI 分类功能（推荐）

#### 2.1 快速测试

在控制台运行：

```javascript
(async function() {
  console.log('🚀 测试 AI 分类...\n');
  
  const res = await wx.cloud.callFunction({
    name: 'articleService',
    data: {
      action: 'classifyByAI',
      article: {
        title: '孕期如何补充叶酸？备孕妈妈必看',
        summary: '叶酸是孕前和孕早期必须补充的营养素',
        content: '备孕期间，建议每天补充400微克叶酸...'
      }
    }
  });
  
  if (res.result?.success) {
    console.log('✅ AI 分类成功!');
    console.log('   分类结果:', res.result.data.tags);
    console.log('   期望结果: ["备孕好孕"]');
    console.log('   测试状态:', res.result.data.tags.includes('备孕好孕') ? '✅ 通过' : '⚠️ 需优化');
  } else {
    console.log('❌ 分类失败:', res.result?.errMsg);
  }
})();
```

#### 2.2 完整测试（可选）

访问测试页面进行完整测试：

```javascript
wx.navigateTo({
  url: '/pages/test-ai-classify'
})
```

---

### 步骤 3：编译并上传小程序代码

#### 3.1 编译代码

1. 点击微信开发者工具顶部的 **"编译"** 按钮
2. 确保没有编译错误
3. 在模拟器中测试基本功能

#### 3.2 上传代码（生产环境）

1. 点击顶部的 **"上传"** 按钮
2. 填写版本号：`1.x.x`（根据实际版本）
3. 填写项目备注：`新增 AI 智能分类功能`
4. 点击 **"上传"**

#### 3.3 提交审核（可选）

1. 登录微信公众平台
2. 进入 **"版本管理"**
3. 选择刚上传的版本
4. 点击 **"提交审核"**
5. 填写审核信息

---

## 🔄 回滚方案

如果部署后发现问题，可以快速回滚：

### 方案 1：回滚云函数

1. 在云开发控制台找到 `articleService`
2. 查看历史版本
3. 选择上一个稳定版本
4. 点击 **"回滚"**

### 方案 2：禁用 AI 分类

在云函数中临时禁用 AI 分类，使用降级方案：

```javascript
// 在 classifyArticleByAI 函数开头添加
async function classifyArticleByAI(article) {
  // 临时禁用 AI，直接使用降级方案
  return fallbackClassify(article);
  
  // ... 原有代码
}
```

### 方案 3：前端回滚

如果前端有问题，可以回滚到使用纯前端分类：

```javascript
// 在 articleList/index.js 中
// 注释掉优先使用后端标签的代码
// let tags = article.tags || extractCanonicalTags(article);

// 改为只使用前端分类
let tags = extractCanonicalTags(article);
```

---

## 📊 部署后验证

### 验证清单

- [ ] 云函数版本正确（`2026-01-27-articleService-v3-ai-classify`）
- [ ] AI 分类功能正常工作
- [ ] 降级方案可以正常触发
- [ ] 前端页面正常显示
- [ ] 标签筛选功能正常
- [ ] 没有报错信息

### 监控指标

部署后需要监控以下指标：

1. **AI 调用成功率** - 应该 > 95%
2. **分类准确率** - 应该 > 90%
3. **响应时间** - 应该 < 3秒
4. **错误日志** - 查看云函数日志

---

## 💰 成本监控

### 预期成本

- **单次分类**: 约 0.0001元
- **每天 10 篇**: 0.001元/天
- **每月 300 篇**: 0.03元/月

### 监控方法

1. 登录微信云开发控制台
2. 查看 **"资源统计"**
3. 监控 AI 调用次数和费用

---

## 🐛 常见问题

### Q1: 云函数部署失败

**原因**: 网络问题或权限不足  
**解决**: 
1. 检查网络连接
2. 确认云开发环境已开通
3. 重试部署

### Q2: AI 调用失败

**原因**: AI 能力未开通或配额不足  
**解决**: 
1. 会自动降级到关键词匹配
2. 检查云开发控制台的 AI 配额
3. 联系微信云开发支持

### Q3: 分类不准确

**原因**: Prompt 需要优化  
**解决**: 
1. 调整 `classifyArticleByAI` 中的 prompt
2. 增加更多示例说明
3. 调整 temperature 参数

---

## 📞 技术支持

- 📄 优化方案: `docs/标签匹配算法优化方案.md`
- 📄 使用说明: `docs/AI分类功能使用说明.md`
- 📄 实现总结: `docs/AI分类功能实现总结.md`
- 🧪 测试页面: `pages/test-ai-classify`
- 🔧 云函数: `cloudfunctions/articleService/index.js`

---

## 📝 部署记录

| 日期 | 版本 | 操作 | 状态 | 备注 |
|------|------|------|------|------|
| 2026-01-27 | v3-ai-classify | 新增 AI 分类功能 | ⏳ 待部署 | 初始版本 |

---

**准备就绪！现在可以开始部署了。** 🚀

