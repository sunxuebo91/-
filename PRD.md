# PRD：安得褓贝（月嫂阿姨简历展示与管理）

> 版本：v0.1（基于现有代码反向梳理）  
> 更新时间：2025-12-25  
> 代码范围：`miniprogram/`、`cloudfunctions/`

---

## 1. 背景与目标

### 1.1 背景
“安得褓贝”是一个微信小程序，用于**展示月嫂/育婴师（以下简称“阿姨”）简历**，并提供**员工端简历管理**能力。

参考：
- 首页文案：`miniprogram/pages/home/index.wxml`
- README（云开发 quickstart 模板背景）：`README.md`

### 1.2 产品目标
- C 端用户可浏览已发布的阿姨简历（列表/详情/搜索）。
- 员工（staff）可在小程序内完成简历的增删改查与发布状态管理。
- 使用微信云开发能力（云函数/数据库/云存储）完成后端能力。

### 1.3 范围（In Scope / Out of Scope）
**In Scope**
- 简历列表（含关键词搜索、分页/加载更多）
- 简历详情（图片/视频/文字）
- 个人中心（授权头像昵称、角色展示、员工入口）
- 员工简历管理（管理列表、创建/编辑、删除、发布/草稿）

**Out of Scope（当前代码未体现）**
- 支付、下单、咨询/客服、预约流程
- 运营活动、收藏/分享、评论
- 多角色后台（除 staff/customer 外）

---

## 2. 角色与使用场景

### 2.1 角色定义
| 角色 | 标识 | 主要权限 | 获取方式（现有实现） |
|---|---|---|---|
| 客户/访客 | `customer` | 浏览已发布简历（list/detail） | 若不在 `staff` 集合中，则在 `users.role` 记录为 `customer` |
| 员工 | `staff` | 额外拥有简历管理权限（listForManage/upsert/remove/管理态detail） | 若在 `staff` 集合中存在 `openid` 记录，则判定为 `staff` |

参考实现：
- 角色判定：`cloudfunctions/userService/index.js`（`isStaff` 查询 `staff` 集合）
- 个人中心显示角色：`miniprogram/pages/profile/index.js` / `index.wxml`

### 2.2 关键场景（用户故事）
1) 访客：我想搜索并查看某位阿姨的简历详情，以评估是否合适。
2) 员工：我想新增一份阿姨简历，上传封面/图片/视频，并设置为发布状态，让客户可见。
3) 员工：我想编辑或下架（改为草稿）某份简历；或删除不再使用的简历。

---

## 3. 信息架构（IA）与页面清单

### 3.1 顶层导航（TabBar）
| Tab | 页面 | 路径 |
|---|---|---|
| 首页 | 首页 | `pages/home/index` |
| 简历列表 | 列表 | `pages/resumeList/index` |
| 个人中心 | 我的 | `pages/profile/index` |

参考：`miniprogram/app.json`

### 3.2 非 Tab 页面
| 页面 | 路径 | 入口 |
|---|---|---|
| 简历详情 | `pages/resumeDetail/index` | 列表点击进入（`navigateTo`） |
| 简历管理（员工） | `pages/admin/resumeManage/index` | 个人中心-员工功能入口 |
| 简历编辑（员工） | `pages/admin/resumeEdit/index` | 管理页“新增/编辑”进入 |

### 3.3 模板示例页面（与业务弱相关）
| 页面 | 路径 | 说明 |
|---|---|---|
| 云开发能力示例入口 | `pages/index/index` | quickstart 模板页面，展示云函数/数据库/存储/AI 示例 |
| 示例详情 | `pages/example/index` | quickstart 模板业务示例页 |

参考：`miniprogram/pages/index/*`、`miniprogram/pages/example/*`

---

## 4. 页面 PRD（交互/状态/接口）

> 本节以“当前实现”为准，补充必要的产品描述与验收口径。

### 4.1 首页（`pages/home/index`）
**目标**：提供产品定位说明与快捷入口。

**模块**
- Hero：标题“安得褓贝”、副标题“月嫂阿姨简历展示与管理”
- 快捷入口：
  - “简历列表” -> Tab 切换到列表
  - “个人中心” -> Tab 切换到个人中心

**路由**
- `switchTab('/pages/resumeList/index')`
- `switchTab('/pages/profile/index')`

参考：`miniprogram/pages/home/index.js`、`index.wxml`

### 4.2 简历列表（`pages/resumeList/index`）
**目标**：按关键词浏览已发布简历列表，并进入详情。

**功能点**
- 搜索：输入框 placeholder“按姓名/城市搜索”，点击“搜索”或回车触发刷新
- 列表展示：封面、姓名、月薪、城市/经验/年龄、标签
- 上拉加载更多：分页（page/pageSize），`hasMore` 由返回条数是否等于 `pageSize` 决定
- 下拉刷新：重置分页并重新加载
- 空态：无数据时显示“暂无简历”

**接口**
- 云函数：`resumeService` / `action=list`
- 入参：`{ page, pageSize, keyword }`
- 出参：`{ success, data: ResumePublic[] }`

参考：
- UI：`miniprogram/pages/resumeList/index.wxml`
- 逻辑：`miniprogram/pages/resumeList/index.js`

### 4.3 简历详情（`pages/resumeDetail/index`）
**目标**：展示单个简历的完整信息（图片/视频/文字介绍）。

**功能点**
- 进入参数：`id`（简历 `_id`）
- 内容：
  - 顶部封面图
  - 基本信息：姓名、月薪、城市/经验/年龄、标签
  - 图片：横向滚动预览
  - 视频：可选展示
  - 文字介绍：intro
- 状态：
  - 加载中：`loaded=false` 显示“加载中...”
  - 加载失败：toast“加载失败”，但 `loaded=true` 结束 loading

**接口**
- 云函数：`resumeService` / `action=detail`
- 入参：`{ id }`
- 出参：`{ success, data: ResumePublic }`

参考：`miniprogram/pages/resumeDetail/index.js`、`index.wxml`

### 4.4 个人中心（`pages/profile/index`）
**目标**：展示当前用户信息、完成授权更新头像昵称，并按角色展示员工入口。

**功能点**
- 进入/展示：每次 `onShow` 调用 `getOrCreateMe`
- 授权获取头像昵称：调用 `wx.getUserProfile`，成功后写回云端用户档案
- 员工入口：仅当 `me.role === 'staff'` 时展示“简历管理”按钮

**接口**
- 云函数：`userService` / `action=getOrCreateMe`
- 云函数：`userService` / `action=updateMe`，入参 `{ data: { nickname, avatarUrl } }`

参考：`miniprogram/pages/profile/index.js`、`index.wxml`

### 4.5 简历管理（员工）（`pages/admin/resumeManage/index`）
**目标**：员工查看全部简历（含草稿/已发布）并进行新增、编辑、删除。

**功能点**
- 列表：展示姓名、状态、更新时间
- 新增：进入编辑页（无 id）
- 编辑：进入编辑页（带 id）
- 删除：二次确认弹窗，确认后调用删除接口
- 无权限处理：加载失败时 toast “无权限或失败”

**接口**
- 云函数：`resumeService` / `action=listForManage`（仅 staff）
- 云函数：`resumeService` / `action=remove`（仅 staff）

参考：`miniprogram/pages/admin/resumeManage/index.js`、`index.wxml`

### 4.6 简历编辑（员工）（`pages/admin/resumeEdit/index`）
**目标**：员工新增/编辑简历，包含媒体上传与发布状态。

**字段**
- 姓名 name（必填）
- 年龄 age（number，可空）
- 城市 city
- 经验年数 experienceYears（number）
- 月薪 priceMonth（number，可空）
- 标签 tagsText（逗号分隔，保存为数组）
- 状态 status（`draft` / `published`）
- 封面 coverFileId（云存储 fileID）
- 图片 photos（fileID 数组，最多 6）
- 视频 videoFileId（fileID）
- 文字介绍 intro

**媒体上传规则**
- 使用 `wx.cloud.uploadFile`
- 云路径：`resume/{timestamp}-{random}.{ext}`

**接口**
- 读取（编辑态）：`resumeService` / `action=detail` + `forManage: true`
- 保存：`resumeService` / `action=upsert`，入参 `data` 含 `_id`（有则 update，无则 add）

参考：`miniprogram/pages/admin/resumeEdit/index.js`、`index.wxml`

---

## 5. 数据模型（云数据库集合）

> 以下为根据云函数代码推断的“事实数据模型”。

### 5.1 `users`（用户档案）
**用途**：存储用户基本信息与角色。

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 id |
| `_openid` | string | 微信 openid（云开发自动写入/可查询） |
| `role` | 'staff' \| 'customer' | 角色 |
| `nickname` | string | 昵称（授权后写入） |
| `avatarUrl` | string | 头像（授权后写入） |
| `phone` | string | 预留字段（代码支持写入，但前端暂无入口） |
| `createdAt` | serverDate | 创建时间 |
| `updatedAt` | serverDate | 更新时间 |

参考：`cloudfunctions/userService/index.js`

### 5.2 `staff`（员工白名单）
**用途**：员工权限判定依据。

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 id |
| `openid` | string | 员工 openid（用于权限判断） |

参考：`cloudfunctions/userService/index.js`、`cloudfunctions/resumeService/index.js`（`isStaff`）

### 5.3 `resumes`（简历）
**用途**：阿姨简历主体数据。

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 简历 id |
| `name` | string | 姓名 |
| `age` | number \| '' | 年龄（实现允许空） |
| `city` | string | 城市 |
| `experienceYears` | number | 经验年数 |
| `priceMonth` | number \| '' | 月薪（实现允许空） |
| `tags` | string[] | 标签 |
| `intro` | string | 文本介绍 |
| `coverFileId` | string | 封面 fileID |
| `photos` | string[] | 图片 fileID 数组 |
| `videoFileId` | string | 视频 fileID |
| `status` | 'draft' \| 'published' | 发布状态（仅 published 对 C 端可见） |
| `createdAt` | serverDate | 创建时间（新增时写入） |
| `updatedAt` | serverDate | 更新时间 |
| `createdBy` | string | 创建者 openid（新增时写入） |

参考：`cloudfunctions/resumeService/index.js`（`upsertResume`、`pickPublicFields`）

### 5.4 `sales`（示例集合，非业务核心）
quickstart 模板示例用。

参考：`cloudfunctions/quickstartFunctions/index.js`

---

## 6. 权限与鉴权策略

### 6.1 权限矩阵
| 能力 | customer | staff | 后端校验位置 |
|---|---:|---:|---|
| 浏览已发布简历列表（list） | ✅ | ✅ | `resumeService.list` 固定 `status='published'` |
| 浏览简历详情（detail） | ✅ | ✅ | `resumeService.detail` 默认无 staff 校验 |
| 管理态查看详情（detail + forManage） | ❌ | ✅ | `resumeService.getDetail`（`forManage` 时强校验 staff） |
| 管理列表（listForManage） | ❌ | ✅ | `resumeService.listForManage` 强校验 staff |
| 新增/编辑（upsert） | ❌ | ✅ | `resumeService.upsertResume` 强校验 staff |
| 删除（remove） | ❌ | ✅ | `resumeService.removeResume` 强校验 staff |
| 获取/更新用户信息 | ✅ | ✅ | `userService`（按 openid 读写 `users`） |

### 6.2 角色来源
- **后端判定**：若 `staff` 集合存在 `openid` 记录，则用户角色为 staff，否则 customer。
- **前端展示**：个人中心根据 `me.role` 显示员工入口。

注意：前端未做“路由守卫”，即使 customer 通过手动路径进入管理页，云函数会拒绝（toast“无权限或失败”）。

---

## 7. 云函数清单（接口定义）

### 7.1 `userService`
入口：`cloudfunctions/userService/index.js`

| action | 说明 | 入参 | 出参 |
|---|---|---|---|
| `getOrCreateMe` | 获取当前用户档案；不存在则创建（并写入 role） | `{ action: 'getOrCreateMe' }` | `{ success, data: User }` |
| `updateMe` | 更新用户档案（昵称/头像/电话等） | `{ action: 'updateMe', data: { nickname?, avatarUrl?, phone? } }` | `{ success, data: User }` |

依赖集合：`users`、`staff`

### 7.2 `resumeService`
入口：`cloudfunctions/resumeService/index.js`

| action | 说明 | 入参 | 出参 |
|---|---|---|---|
| `list` | C 端列表：仅返回 `published`，支持关键词与分页 | `{ action:'list', page?, pageSize?, keyword? }` | `{ success, data: ResumePublic[] }` |
| `detail` | 详情：默认任何用户可看；若 `forManage=true` 则仅 staff 可看 | `{ action:'detail', id, forManage? }` | `{ success, data: ResumePublic }` |
| `listForManage` | 管理列表：返回最多 100 条（含 draft/published） | `{ action:'listForManage' }` | `{ success, data: ResumePublic[] }` |
| `upsert` | 新增/更新简历 | `{ action:'upsert', data: ResumeUpsert }` | `{ success, data: { _id } }` |
| `remove` | 删除简历 | `{ action:'remove', id }` | `{ success }` |

依赖集合：`resumes`、`staff`

### 7.3 `quickstartFunctions`（模板示例）
入口：`cloudfunctions/quickstartFunctions/index.js`，按 `event.type` 分发（getOpenId/getMiniProgramCode/数据库 sales CRUD 等）。

---

## 8. 关键业务规则（验收口径）

1) **发布状态控制**：
- `status='published'` 的简历才会出现在 C 端列表（`resumeService.list` 固定条件）。

2) **搜索规则**：
- `keyword` 仅匹配姓名/城市（正则模糊匹配，大小写不敏感）。

3) **分页规则**：
- `pageSize` 最大 20；`page` 从 0 开始；返回条数小于 `pageSize` 视为无更多。

4) **媒体存储**：
- 封面/图片/视频均存 fileID（云存储），前端直接以 `src=fileID` 展示。

---

## 9. 已发现缺口/不一致（建议后续补齐）

1) **`coverUrl` 字段不一致**：
- 列表/详情 WXML 使用 `item.coverUrl || item.coverFileId`（或 `detail.coverUrl || detail.coverFileId`），但云函数 `pickPublicFields` 只返回 `coverFileId`，未生成 `coverUrl`。
- 现状不影响展示（有 `coverFileId` 即可），但字段命名建议统一。

2) **管理页入口仅靠前端显示控制**：
- `profile` 仅在 `me.role==='staff'` 时展示入口，但用户仍可手动访问管理页路径；后端会拒绝。
- 若要更强体验：可在管理页 onShow 先拉取 `me` 并做前端拦截（当前未实现）。

3) **员工白名单维护方式未定义**：
- `staff` 集合如何录入 openid（后台工具/控制台手工/运营流程）尚未在代码中体现。

4) **用户 phone 字段无前端入口**：
- 后端支持写入 `phone`，但前端未提供采集/更新流程。

---

## 10. 运行与环境要求（面向交付）

- 小程序需在 `miniprogram/app.js` 配置正确的云环境 `env`（否则会出现“云开发环境未找到”）。
- 云函数需部署：`resumeService`、`userService`（以及保留的 `quickstartFunctions` 如需示例能力）。

参考：`miniprogram/pages/profile/index.wxml` 提示文案、`miniprogram/pages/index/index.js` 的错误提示逻辑。
