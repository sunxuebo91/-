# 🎨 炫酷自定义底部导航栏

## ✨ 特色功能

### 1. **中间突出大按钮**
- 渐变色圆形按钮（紫色渐变）
- 3D 立体效果（阴影 + 高光）
- 白色边框突出层次
- 持续旋转动画的图标

### 2. **呼吸光晕效果**
- 中间按钮周围有脉动光晕
- 2秒循环的缩放动画
- 半透明紫色渐变

### 3. **图标动画**
- 选中时图标放大 1.1 倍
- 平滑的过渡动画（0.3s）
- 图标下方有脉动小圆点指示器

### 4. **点击反馈**
- 点击时按钮缩小到 0.9 倍
- 使用贝塞尔曲线实现流畅动画
- 中间按钮有更明显的按压效果

### 5. **渐变背景**
- 底部导航栏使用白色到淡紫色的渐变
- 顶部有紫色渐变分割线
- 柔和的阴影效果

### 6. **Emoji 图标**
使用 Unicode Emoji，无需额外图片资源：
- 🏠 首页
- 📋 简历列表
- ➕ 中间大按钮（相册）
- ⚙️ 设置
- 👤 我的

## 🎯 使用方法

### 1. 已自动配置
在 `app.json` 中已启用自定义 tabBar：
```json
"tabBar": {
  "custom": true,
  ...
}
```

### 2. 页面自动同步
每个 tab 页面的 `onShow()` 中已添加代码来更新选中状态。

### 3. 自定义图标
如果想更换图标，编辑 `custom-tab-bar/index.js` 中的 `list` 数组：
```javascript
{
  iconText: "🏠",      // 未选中图标
  iconActive: "🏡"     // 选中图标（可选）
}
```

### 4. 自定义颜色
在 `custom-tab-bar/index.js` 中修改：
```javascript
selectedColor: "#8766f3",  // 选中颜色
color: "#999999"           // 未选中颜色
```

在 `custom-tab-bar/index.wxss` 中修改渐变色：
```css
background: linear-gradient(135deg, #8766f3 0%, #a78bfa 50%, #8766f3 100%);
```

## 🎨 动画效果说明

### 旋转动画
中间按钮的图标持续旋转（3秒一圈）：
```css
@keyframes rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

### 光晕脉动
```css
@keyframes glow {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.2); opacity: 0.8; }
}
```

### 指示器脉动
```css
@keyframes dotPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.7; }
}
```

## 📱 兼容性

- ✅ 支持 iPhone 刘海屏安全区域
- ✅ 支持深色/浅色主题
- ✅ 支持所有微信小程序版本

## 🔧 高级定制

### 更换为图片图标
如果想使用图片而不是 Emoji：

1. 在 `list` 中添加 `iconPath` 和 `selectedIconPath`
2. 修改 WXML 中的图标显示逻辑
3. 使用 `<image>` 标签替代 `<text>`

### 调整中间按钮大小
在 `index.wxss` 中修改：
```css
.center-button-inner {
  width: 56px;   /* 调整大小 */
  height: 56px;
}
```

### 禁用动画
如果需要更简洁的效果，可以删除或注释掉相关的 `animation` 属性。

## 🎉 效果预览

运行小程序后，你会看到：
- 底部有5个图标
- 中间的 ➕ 按钮突出显示，带有旋转动画
- 点击任意图标会有平滑的切换效果
- 选中的图标会放大并显示脉动小圆点

享受你的炫酷导航栏吧！✨

