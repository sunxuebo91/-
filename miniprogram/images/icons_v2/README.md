# 安得褓贝 UI 图标 v2 (渐变填色)

**生成时间**: 2026-06-30
**风格**: 渐变填色 (Gradient) — 主色深紫 #6d28d9 → 浅紫 #a78bfa,辅以暖橙/暖粉/金黄点缀
**规格**: 1K PNG (1024×1024),纯白底,圆形安全区,小尺寸下仍清晰
**用途**: 替代 `images/icons/` 和 `images/tabbar/` 下的旧 SVG 图标

## 目录结构

```
icons_v2/
├── README.md           (本文件)
├── [32 个通用图标 .png]
└── tabbar/
    ├── [4 个 tabbar 图标 .png]   ← 注意,tabbar 图标全部在子目录
```

## 图标清单 (共 40 个)

### Tab Bar (4 个,位于 `tabbar/` 子目录)
| 文件名 | 用途 | 对应旧文件 |
|---|---|---|
| tabbar-home.png | 首页 | custom-tab-bar/index.js `home` (灰) / `homeActive` (紫) |
| tabbar-message.png | 消息 | custom-tab-bar `message` / `messageActive` |
| tabbar-orderHall.png | 接单大厅 | custom-tab-bar `orderHall` / `orderHallActive` |
| tabbar-profile.png | 我的 | custom-tab-bar `profile` / `profileActive` |

> **集成方式**: 把 `custom-tab-bar/index.js` 里的 `iconPath` / `selectedIconPath` 替换成新文件路径,active 状态用 `selectedColor #8b5cf6` 直接覆盖即可(渐变填色已经够醒目,不再需要单色版本)。

### 服务类型 (8 个)
| 文件名 | 用途 | 出现页面 |
|---|---|---|
| yuexin.png | 月嫂 | home/index, transparentService, profile |
| yuer.png | 育儿嫂 | home/index, transparentService, resumeDetail |
| baomu.png | 保姆 | home/index, transparentService |
| hulao.png | 护老 | home/index, transparentService |
| cuiru.png | 催乳师 | 新增(可挂 lactationCare 入口) |
| yuezican.png | 月子餐 | 新增(可挂 confinementMeals 入口) |
| zaojiao.png | 早教 | 新增(可挂 babyEducation 入口) |
| fushi.png | 辅食 | 新增(可挂 babyFood 入口) |

### 通用功能 (28 个)
| 文件名 | 用途 | 出现页面 |
|---|---|---|
| customer-service.png | 客服 | message |
| document.png | 合同/文档 | 所有 contractPreview 页 |
| info-circle.png | 信息 | resumeDetail, qaService |
| message-empty.png | 空消息状态 | message |
| poster.png | 海报 | profile, poster |
| qa-service.png | 问答服务 | home, qaService |
| share.png | 分享 | 所有 contractPreview, 各类定价页 |
| baobei-share.png | 褓贝分享(礼物盒) | home, qaService |
| star.png | 收藏 | resumeDetail |
| thumbs-up.png | 点赞 | resumeDetail |
| view.png | 查看/预览 | 所有 contractPreview |
| my-orders.png | 我的订单 | profile |
| referral.png | 推荐/邀请 | profile, myReferrals |
| work-experience.png | 工作经历 | resumeDetail |
| work-yuer.png | 育儿嫂工作 | resumeDetail |
| baby-diary.png | 育儿日记 | home, profile, babyDiary |
| transparent-service.png | 透明服务 | home, transparentService |
| avatar.png | 头像默认 | profile, settings |
| close.png | 关闭 | 各处弹窗 |
| search.png | 搜索 | (新增,待接入) |
| phone.png | 电话 | (新增,待接入) |
| calendar.png | 日历 | (新增,待接入) |
| clock.png | 时间 | (新增,待接入) |
| location.png | 地址/定位 | (新增,待接入) |
| wallet.png | 钱包 | (新增,待接入) |
| coupon.png | 优惠券 | (新增,待接入) |
| setting.png | 设置 | (新增,待接入) |
| scan.png | 扫码 | (新增,待接入) |

## 集成步骤

### 1. 备份旧图标(已完成自动备份? 否,需要手动)
原 `images/icons/` 里的旧 SVG 可以保留,新文件放在 `icons_v2/` 平行目录。

### 2. 替换用法
**示例**: 把 `profile/index.wxml` 第 40 行
```html
<image class="service-icon-img" src="/images/icons/my-orders.svg" mode="aspectFit"/>
```
改成
```html
<image class="service-icon-img" src="/images/icons_v2/my-orders.png" mode="aspectFit"/>
```

### 3. Tabbar 集成
打开 `custom-tab-bar/index.js`,把 `icons` 对象里的 8 个 base64 SVG 全部替换为新 PNG 路径:
```js
const icons = {
  home: "/images/icons_v2/tabbar-home.png",
  homeActive: "/images/icons_v2/tabbar-home.png",  // 渐变填色已醒目,active 用同图 + 颜色覆盖即可
  // ... 其他 3 个同理
};
```
然后在 `index.wxss` 给 `.icon-wrapper.active` 加 `filter: brightness(0) saturate(100%) invert(43%) sepia(96%) saturate(2476%) hue-rotate(241deg) brightness(101%) contrast(96%);` 把图标染成 #8b5cf6 紫色(或者直接保留原色,效果也很统一)。

### 4. 尺寸建议
- Tabbar: 24×24 (1K 图降采样足够锐利)
- 卡片图标: 48×48
- 头像/启动图标: 96×96

## 注意事项

1. **白底**: 当前图是纯白底 PNG,部分场景(深色背景)需要抠底。可以用 PS/在线工具去白底,或者重新生成时改 prompt 为 "transparent background"。
2. **active 态**: tabbar 双态没用两个文件,推荐 active 态用 CSS filter 染色,或者直接用同图(渐变色已和品牌色一致)。
3. **质量**: 渐变填色是 AI 生成,可能有少数几个图标风格不统一,需要微调的回头跟我说。
