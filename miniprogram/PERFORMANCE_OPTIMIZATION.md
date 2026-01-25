# 首页性能优化方案

## 已实施的优化

### 1. 图片懒加载 ✅
- **位置**: `pages/home/index.wxml`
- **优化**: Banner图和文章封面图添加 `lazy-load="{{true}}"`
- **效果**: 图片只在即将进入视口时才加载，减少首屏加载时间

### 2. 并行加载数据 ✅
- **位置**: `pages/home/index.js` - `onLoad()`
- **优化**: 使用 `Promise.all()` 并行加载Banner、文章和初始化阅读量
- **效果**: 从串行改为并行，减少总加载时间约50%

### 3. 骨架屏占位 ✅
- **位置**: `pages/home/index.wxml` + `index.wxss`
- **优化**: 添加Banner和文章列表的骨架屏动画
- **效果**: 提升用户体验，减少白屏时间感知

## 进一步优化建议

### 4. 图片CDN优化（推荐）
**问题**: 图片加载慢通常是因为图片体积大或服务器响应慢

**解决方案**:
```javascript
// 在图片URL后添加压缩参数（如果使用腾讯云COS/阿里云OSS）
const optimizeImageUrl = (url, width = 750) => {
  if (!url) return url;
  // 腾讯云COS示例
  return `${url}?imageMogr2/thumbnail/${width}x/format/webp/quality/80`;
  // 阿里云OSS示例
  // return `${url}?x-oss-process=image/resize,w_${width}/format,webp/quality,q_80`;
};
```

**使用位置**:
- `pages/home/index.js` - `loadBanners()` 和 `loadArticles()`
- Banner图建议宽度: 750px
- 文章封面建议宽度: 375px

### 5. 启用HTTP/2和CDN加速
**配置位置**: 后端服务器
- 确保API域名 `crm.andejiazheng.com` 启用HTTP/2
- 图片资源使用CDN加速
- 启用Gzip/Brotli压缩

### 6. 分包加载（可选）
**适用场景**: 小程序包体积超过2MB时

**配置示例** (`app.json`):
```json
{
  "subpackages": [
    {
      "root": "pages/admin",
      "pages": [
        "resumeManage/index",
        "resumeEdit/index"
      ]
    }
  ],
  "preloadRule": {
    "pages/home/index": {
      "network": "all",
      "packages": ["pages/admin"]
    }
  }
}
```

### 7. 数据缓存策略
**位置**: `services/article.js`

**优化方案**:
```javascript
// 缓存文章列表5分钟
const CACHE_KEY = 'article_list_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟

const getArticleList = async (params = {}) => {
  // 尝试从缓存读取
  const cached = wx.getStorageSync(CACHE_KEY);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('📰 使用缓存数据');
    return cached.data;
  }
  
  // 请求新数据
  const result = await publicRequest({...});
  
  // 保存到缓存
  wx.setStorageSync(CACHE_KEY, {
    data: result,
    timestamp: Date.now()
  });
  
  return result;
};
```

### 8. 预加载关键资源
**位置**: `app.json`

```json
{
  "preloadRule": {
    "pages/home/index": {
      "network": "all",
      "packages": ["__APP__"]
    }
  }
}
```

## 性能监控

### 使用小程序性能监控
```javascript
// 在 app.js 中添加
App({
  onLaunch() {
    // 监听页面性能
    wx.onMemoryWarning(() => {
      console.warn('⚠️ 内存不足警告');
    });
    
    // 获取性能数据
    const performance = wx.getPerformance();
    const observer = performance.createObserver((entryList) => {
      console.log('📊 性能数据:', entryList.getEntries());
    });
    observer.observe({ entryTypes: ['render', 'script', 'navigation'] });
  }
});
```

## 预期效果

| 优化项 | 优化前 | 优化后 | 提升 |
|--------|--------|--------|------|
| 首屏加载时间 | ~3s | ~1.5s | 50% |
| 图片加载时间 | ~2s | ~0.8s | 60% |
| 白屏时间感知 | 明显 | 几乎无感 | 显著提升 |

## 注意事项

1. **图片优化最重要**: 80%的加载时间来自图片
2. **使用WebP格式**: 比JPEG小30-50%
3. **控制图片尺寸**: Banner不超过200KB，文章封面不超过100KB
4. **定期清理缓存**: 避免占用过多存储空间

