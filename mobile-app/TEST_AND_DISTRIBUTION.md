# 安得家政 CRM 移动端 · 多角色测试矩阵与分发/安装清单

> 本文对应任务「内部测试与分发」中**可提前准备**的交付物：可直接照做的测试与分发文档。
> 真机执行本身需实体设备，不在本文范围。
>
> **依据来源（均已核对当前工程真实配置，非臆造）：**
> - 角色与权限：`backend/src/modules/roles/role.constants.ts`（`DEFAULT_ROLE_DEFINITIONS`）、
>   `backend/src/modules/roles/permission-catalog.ts`（`PERMISSION_CATALOG`）
> - 移动端模块与权限点：[src/router/navConfig.tsx](src/router/navConfig.tsx)、
>   [src/pages/Workbench.tsx](src/pages/Workbench.tsx)、[src/pages/modules.tsx](src/pages/modules.tsx)
> - 权限判定逻辑：[src/utils/permission.ts](src/utils/permission.ts) `checkPermission`、
>   [src/router/ProtectedRoute.tsx](src/router/ProtectedRoute.tsx)
> - 出包/签名/版本检查：[BUILD_ANDROID.md](BUILD_ANDROID.md)（交叉引用，不重复正文）

---

## 0. 权限判定模型（矩阵推导规则）

移动端可见性/可操作性由两层决定：

1. **路由可见性** —— [ProtectedRoute](src/router/ProtectedRoute.tsx) 依据 `navConfig.tsx` 每个模块的 `permission` 字段判定：
   - 未登录 → 跳 `/login`；
   - 有 `permission` 但当前账号不满足 → 跳 `/403`；
   - `AppShell`/`Workbench` 同样按 `checkPermission` 动态显隐 TabBar / 工作台入口。
2. **通配规则**（[checkPermission](src/utils/permission.ts)）：命中任一即通过——
   - 持有 `*`（超管）；
   - 精确持有该权限点（如 `customer:view`）；
   - 持有资源级通配 `resource:all`（如 `customer:all` 覆盖 `customer:view/create/edit/delete`）。

**矩阵图例：**

| 记号 | 含义 |
| --- | --- |
| ✅ | **可见 + 可写**：入口可见，且移动端提供写操作、当前角色具备后端写权限 |
| 👁 | **仅可见只读**：入口可见，但移动端该模块只提供查看（或角色仅有 `:view`） |
| ➖ | **不可见**：入口不渲染 / 直达链接被 ProtectedRoute 拦截跳 `/403` |

> **移动端实现范围说明**（决定 ✅/👁）：移动端为「员工高频操作」优化，多数管理类模块为只读查看版。
> 当前**提供写操作**的模块仅：客户（新建/编辑）、简历（新建/编辑/原生拍照上传）、审批（通过/驳回）、
> 接单大厅（抢单审批）、培训线索（认领/释放）。
> 其余模块（合同、保险、背调、职培订单、开班、课程、表单、褓贝文章/Banner、电子签、支付、角色、用户、系统设置、推荐返费）
> 在移动端均为**只读/轻量查看**，故即使角色在后端持有写权限，移动端矩阵仍标 👁。

---

## 1. 多角色测试矩阵

角色取自后端 `ROLE_CODES = ['admin','manager','employee','operator','admissions','dispatch','trainer']`（共 **7 个角色**）。
模块取自 `navConfig.tsx` 实际落地条目（覆盖移动端全部核心模块）。

各模块对应的权限点（来自 navConfig）：

| 模块 | 权限点 | 模块 | 权限点 |
| --- | --- | --- | --- |
| 仪表板 | （登录即可） | 电子签 | `contract:view` |
| 客户 | `customer:view` | 支付/收款 | （登录即可） |
| 合同 | `contract:view` | 文章/Banner（褓贝） | `baobei:view` |
| 审批 | （登录即可） | 接单大厅 | （登录即可） |
| 简历 | `resume:view` | 推荐返费 | （登录即可） |
| 表单 | （登录即可） | 保险 | `insurance:view` |
| 背景调查 | `background-check:view` | 角色 | `admin:roles` |
| 培训线索 | `training-lead:view` | 用户 | `user:view` |
| 系统设置 | `admin:settings` | 职培订单（合同/开班/课程） | `training-order:view` |

### 1.A 业务核心

| 角色 | 仪表板 | 客户 | 合同 | 审批 | 简历 |
| --- | :--: | :--: | :--: | :--: | :--: |
| admin 系统管理员 | 👁 | ✅ | 👁 | ✅ | ✅ |
| manager 经理 | 👁 | ✅ | 👁 | ✅ | ✅ |
| employee 普通员工 | 👁 | ✅¹ | 👁 | ✅ | ✅¹ |
| operator 运营 | 👁 | ✅¹ | 👁 | ✅ | ✅¹ |
| admissions 招生老师 | 👁 | ➖ | ➖ | ✅ | ✅¹ |
| dispatch 派单老师 | 👁 | ✅¹ | 👁 | ✅ | ✅¹ |
| trainer 培训讲师 | 👁 | ➖ | ➖ | ✅ | ➖ |

### 1.B 保险 · 背调 · 职业培训

| 角色 | 保险 | 背景调查 | 培训线索 | 职培订单 |
| --- | :--: | :--: | :--: | :--: |
| admin | 👁 | 👁 | ✅ | 👁 |
| manager | 👁 | 👁 | ➖ | ➖ |
| employee | 👁 | 👁 | ➖ | ➖ |
| operator | 👁 | 👁 | ✅ | 👁 |
| admissions | ➖ | ➖ | ✅ | 👁 |
| dispatch | 👁 | 👁 | ➖ | ➖ |
| trainer | ➖ | ➖ | ➖ | 👁² |

### 1.C 运营协作 · 内容 · 收款

| 角色 | 接单大厅 | 推荐返费 | 表单 | 文章/Banner | 电子签 | 支付/收款 |
| --- | :--: | :--: | :--: | :--: | :--: | :--: |
| admin | ✅ | 👁 | 👁 | 👁 | 👁 | 👁 |
| manager | ✅ | 👁 | 👁 | ➖ | 👁 | 👁 |
| employee | ✅ | 👁 | 👁 | ➖ | 👁 | 👁 |
| operator | ✅ | 👁 | 👁 | ➖ | 👁 | 👁 |
| admissions | ✅ | 👁 | 👁 | ➖ | ➖ | 👁 |
| dispatch | ✅ | 👁 | 👁 | ➖ | 👁 | 👁 |
| trainer | ✅ | 👁 | 👁 | ➖ | ➖ | 👁 |

### 1.D 系统管理

| 角色 | 角色 | 用户 | 系统设置 |
| --- | :--: | :--: | :--: |
| admin | 👁 | 👁 | 👁 |
| manager | ➖ | 👁 | 👁 |
| employee | ➖ | ➖ | ➖ |
| operator | ➖ | 👁 | ➖ |
| admissions | ➖ | 👁 | ➖ |
| dispatch | ➖ | 👁 | ➖ |
| trainer | ➖ | ➖ | ➖ |

**脚注：**
- **¹ 客户/简历「编辑」**：编辑按钮已按后端权限码 `customer:edit`/`resume:edit` 修正（原误用 `:update`）。
  现对具备 `:edit` 或 `resource:all` 的角色生效：客户编辑 → admin/manager/employee/operator/dispatch；简历编辑 → 上述角色 + admissions。标 ✅ 表示具备新建及（多数角色）编辑能力。
- **² trainer 职培订单**：后端授予 `training-order:edit`（用于证书进度登记），但移动端职培订单页为只读列表 + 学员查看，未实现编辑，故标 👁。

### 1.E 如何验证（每个单元格通用流程）

1. **准备账号**：在 Web 后台为该角色建测试账号（或用现有账号），确认其 `role` 与权限位符合 `role.constants.ts` 预期。
2. **登录移动端**：输入账号密码登录。
3. **看 TabBar / 工作台**：底部固定 5 个 Tab（首页/客户/合同/工作台/我的）；其中「客户」「合同」需对应 `:view` 权限才显示。
   其余模块进入「工作台」页查看九宫格入口是否**按矩阵出现**（`Workbench` 过滤逻辑：`checkPermission(permissions, e.perm)`）。
4. **越权直达校验**：手动把地址改为受限模块（如非 admin 访问 `#/roles`、admissions 访问 `#/customers`）（HashRouter），
   - 标 ➖ 的应被 `ProtectedRoute` 拦截，跳转 `/403`；
   - 标 👁/✅ 的应正常进入（审批/接单大厅/推荐返费/表单/支付已改为登录即可见）。
5. **写操作校验**：对 ✅ 单元格，进入后确认写按钮（新建/编辑/通过/驳回/认领/抢单审批）可见并可提交；
   对 👁 单元格，确认无写按钮、仅查看。

> 快速核对账号权限：进入「我的 → 系统设置」，页面显示当前 `角色` 与 `权限`（admin 显示「全部（*）」）。见 [SettingsPage](src/pages/modules.tsx)。

---

## 2. 核心流程回归清单

> 每条：**操作步骤 → 预期结果 → 失败排查点**。建议至少用 admin + employee 两个角色各跑一遍。

### 2.1 登录 → 鉴权
- 步骤：输入正确账号密码登录。
- 预期：进入首页；底部 TabBar 与工作台入口按当前角色权限渲染。
- 排查：401 → 检查 `VITE_API_BASE`（我的→系统设置可见）与后端连通；输入错误 → 看 Toast 报错文案。

### 2.2 Token 持久化（杀进程重启仍登录）
- 步骤：登录成功后，从系统「最近任务」**划掉杀死 App**，再重新打开。
- 预期：无需重新登录，直接进入首页（token 已由 `@capacitor/preferences` 持久化）。
- 排查：若被踢回登录页 → 检查 [stores/auth.ts](src/stores/auth.ts) persist 的 `ande-mobile-auth` 是否落盘、`zustandStorage` 原生存储是否可用；确认 token 未过期。

### 2.3 客户 增/改/查
- 步骤：客户 Tab → 列表下拉刷新/上拉加载 → 新建客户填写提交 → 打开详情 → （admin/manager）编辑保存。
- 预期：列表分页正常；新建后回列表可见；编辑后详情更新。
- 排查：新建按钮不显示 → 缺 `customer:create`；编辑按钮不显示 → 见脚注¹（需 `customer:edit` 或 `customer:all`）；提交失败 → 看网络与后端校验错误 Toast。

### 2.4 合同 查（移动端只读）
- 步骤：合同 Tab → 列表 → 详情。
- 预期：可查看列表与详情；移动端不提供新建/编辑（[ContractList](src/pages/Contract/ContractList.tsx) 仅 `getContracts`/`getContractById`）。
- 排查：列表空 → 确认后端有数据且 `contract:view` 命中。

### 2.5 简历 增/改/查 + 原生拍照上传
- 步骤：工作台 → 简历 → 新建 → 证件/个人照片处点击 → 选择「拍照」或「相册」→ 拍摄/选择 → 上传 → 提交。
- 预期：首次调用弹系统相机/存储权限授权；照片成功追加并上传（[Resumes.tsx](src/pages/Resumes.tsx) 用 `takePhoto`/`pickFromGallery` + `appendFile`）。
- 排查：无相机弹窗/闪退 → 检查 AndroidManifest 相机与存储权限、[nativePermissions](src/utils/nativePermissions.ts) 授权流程；上传失败 → 看接口返回与文件大小（拍照已压缩到 `targetWidth:1080`）；编辑按钮不显示 → 见脚注¹。

### 2.6 审批 通过 / 驳回
- 步骤：（任意已登录角色）工作台 → 审批 → 打开待办 → 通过 / 填写意见后驳回。
- 预期：操作成功 Toast；列表状态更新为 已通过/已驳回（[Approvals.tsx](src/pages/Approvals.tsx) `approveApproval`/`rejectApproval`、合同删除审批 `approveContractDeletion`/`rejectContractDeletion`）。
- 排查：驳回未填意见被拦截（`!comment.trim()` 校验）；入口不可见 → 检查登录态（审批后端仅登录即可访问，无 permission 门控，见第 7 节）。

### 2.7 接单大厅 抢单审批
- 步骤：（任意已登录角色）工作台 → 接单大厅 → 打开订单详情 → 「查看抢单」列表 → 对 pending 抢单点「通过」/「驳回」。
- 预期：操作成功 Toast，抢单状态刷新，订单抢单数变化（[GrabsSection](src/pages/modules.tsx) `approveGrab`/`rejectGrab`）。
- 排查：抢单列表空 → 该订单暂无抢单；入口不可见 → 检查登录态（接单大厅后端仅登录即可访问，无 permission 门控，见第 7 节）。

### 2.8 培训线索 认领 / 释放
- 步骤：（admin/operator/admissions）工作台 → 培训线索 → 打开线索详情 → 「认领线索」或「释放到公海池」。
- 预期：认领后 `跟进人` 变为当前用户；释放后回公海（[LeadActions](src/pages/modules.tsx) `claim`/`release`，按钮受 `training-lead:edit` 控制）。
- 排查：无认领/释放按钮 → 角色缺 `training-lead:edit`；操作失败 → 看接口返回。

---

## 3. 性能与弱网清单

| 项 | 验证方法 | 预期 | 失败排查 |
| --- | --- | --- | --- |
| 首屏加载 | 冷启动到首页可交互计时 | 中端机 ≤ 2~3s；路由 `React.lazy` 懒加载，仅首页 chunk 阻塞 | 首屏过慢 → 看 bundle 体积、是否误同步加载大模块 |
| 列表滚动流畅度 | 客户/简历/各列表快速上拉滚动 | 分页加载（`InfiniteScroll`）不卡顿、无长白屏 | 掉帧 → 检查列表项渲染成本、图片是否过大 |
| react-query 缓存命中 | 进列表 → 进详情 → 返回列表 | 返回时命中缓存秒开，不重复全量请求 | 每次重拉 → 检查 queryKey 稳定性与 staleTime |
| 断网提示 | 开飞行模式后发起请求 | 有明确「网络不可用/加载失败」提示，可下拉重试（`@capacitor/network` 监听） | 无提示/白屏 → 检查 network 监听与错误边界（`ErrorBlock`）|
| 弱网表现 | 开发者选项限速（2G/3G）或弱信号 | 有 loading（`DotLoading`），不重复触发、不错乱 | 重复请求 → 检查防抖与 loading 态 |
| 网络切换恢复 | WiFi ↔ 4G 切换 / 断网后恢复 | 恢复后下拉刷新可正常拉取；写操作不丢失 | 恢复后仍失败 → 检查请求是否卡在旧连接、需重试逻辑 |

---

## 4. 兼容性矩阵

`variables.gradle`：`minSdkVersion = 24`（Android 7.0）、`compileSdkVersion = 36`、`targetSdkVersion = 36`。

| 维度 | 覆盖范围 | 测试要点 |
| --- | --- | --- |
| 系统版本 | Android 7.0 (API 24) 最低 → 最新 Android 15/16 | 各大版本各测 1 台：登录、拍照、断网提示 |
| 厂商 ROM | 华为/荣耀(HarmonyOS/EMUI)、小米(HyperOS/MIUI)、OPPO/vivo(ColorOS/OriginOS)、三星(OneUI)、原生/Pixel | 权限弹窗文案与授予路径差异见下 |
| 屏幕 | 小屏(≤5.5")、大屏、高刷、刘海/挖孔 | 布局不溢出、NavBar/TabBar 安全区适配 |
| 网络 | WiFi / 4G / 5G / 弱网 | 见第 3 节 |

**厂商 ROM 权限弹窗差异要点：**
- **小米 HyperOS/MIUI**：相机/麦克风首次授权后仍可能「仅本次允许」；后台弹窗受限，需在「设置→应用→权限」手动放开「相机」「麦克风」「存储/照片」。
- **华为 EMUI/HarmonyOS**：存储权限在高版本细分为「照片和视频」；首次拍照可能需二次确认。
- **OPPO/vivo (ColorOS/OriginOS)**：默认后台限制严格；自启动/后台权限可能影响推送。
- **三星 OneUI / 原生**：接近 AOSP 标准运行时权限流程，最贴近 [nativePermissions](src/utils/nativePermissions.ts) 预期。
- 通用：Android 13+（API 33）媒体权限拆分为 `READ_MEDIA_IMAGES` 等；相册选择建议走 Photo Picker，避免整库存储权限。

---

## 5. 分发与安装

### 5.1 获取 APK
- **CI 产物**：GitHub → Actions →「Android Release APK」run 页面底部 Artifacts 下载 `app-release-apk`；
  或对 `v*` tag 触发的构建在 Releases 页面下载 `app-release.apk`。详见 [BUILD_ANDROID.md](BUILD_ANDROID.md) 第 7 节「CI 出包」。
- **本地产物**：`android/app/build/outputs/apk/release/app-release.apk`，出包命令见 [BUILD_ANDROID.md](BUILD_ANDROID.md) 第 3 节。

### 5.2 内部分发渠道
- **内部分发落地页（推荐）**：仓库附带纯静态单文件页 [distribution/index.html](distribution/index.html)，内置下载按钮 + 分步安装引导。把 `distribution/index.html`、`app-release.apk`、`version.json`（照 [version.json.example](version.json.example) 填真实值）**三者放到同一内部目录**（示例 `https://crm.andejiazheng.com/app/`：页面为 `/app/`、APK 为 `/app/app-release.apk`、清单为 `/app/version.json`），发页面链接或二维码即可。详见 [BUILD_ANDROID.md](BUILD_ANDROID.md) §5「内部分发落地页」。
- **企业微信 / 钉钉**：通过工作群或「群文件/应用」下发 APK；提醒成员用系统浏览器或文件管理器打开安装（部分 IM 内置浏览器会拦截 APK 下载）。
- 建议同时给出 `versionName + versionCode` 与更新说明，便于测试者确认版本。
> ⚠️ 落地页 / APK / version.json 均为**独立托管的静态文件，不随 App 打包，也不属于现有 CRM 前后端**。

### 5.3 安卓「未知来源」安装步骤
1. 下载 `app-release.apk` 到手机。
2. 用文件管理器点击 APK 安装。
3. 系统提示「未知来源/外部来源应用」被禁止 → 进入设置为「当前来源应用（如浏览器/文件管理器/企业微信）」开启「允许安装未知应用」。
4. 返回继续安装 → 完成 → 打开。
> 若此前装过**不同签名**的同包名版本，需先卸载旧版再装（签名不一致无法覆盖安装）。

### 5.4 首启权限授予引导
- 首次拍照/选相册 → 授予**相机**、**照片/存储**。
- （如启用推送）→ 授予**通知**权限（Android 13+ 需运行时授权）。
- 若误点「拒绝」，引导到「设置→应用→安得家政CRM→权限」手动开启。授权流程封装见 [nativePermissions](src/utils/nativePermissions.ts)。

### 5.5 应用内版本检查与发版
- 机制：`VITE_UPDATE_MANIFEST_URL` 指向静态 `version.json`，App 启动比对 `versionCode` 提示更新。
- **配置项、`version.json` 格式与完整发版流程见 [BUILD_ANDROID.md](BUILD_ANDROID.md) 第 5 节**（此处不重复）。
- 分发新版时：先提升 `versionCode/versionName` 出包 → 上传新 APK → 更新 `version.json` → 旧版启动即收到更新提示。

---

## 6. 签署确认区

### 6.1 测试执行登记

| 轮次 | 测试角色 | 设备(厂商/型号/系统) | APK 版本(versionName+Code) | 结论(通过/不通过) | 测试人 | 日期 |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |

### 6.2 遗留问题登记

| 编号 | 所属模块 | 问题描述 | 严重级(高/中/低) | 复现步骤 | 处理状态 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |

### 6.3 结论签署

| 角色 | 姓名 | 结论意见 | 签字 | 日期 |
| --- | --- | --- | --- | --- |
| 测试负责人 |  |  |  |  |
| 开发负责人 |  |  |  |  |
| 项目负责人 |  |  |  |  |

---

## 7. 权限点对齐修正记录（已在任务 ID=13 修复）

以下**移动端权限门与后端 catalog 不一致**的缺陷已修正，矩阵已按修正后现状给出：

1. **catalog 中不存在的权限点已去除门控**：navConfig/Workbench/Dashboard 原用的
   `approval:read`、`order-hall:view`、`referral:view`、`forms:view`、`payment:view`
   **均未登记在** `permission-catalog.ts`，对应后端端点实为仅登录（JwtAuthGuard）访问。
   → 已改为**无 permission = 登录即可见**，即审批、接单大厅、推荐返费、表单、支付对**所有已登录角色**开放。

2. **编辑权限码命名已对齐后端**：[Customers.tsx](src/pages/Customers.tsx) 改为 `customer:edit`、[Resumes.tsx](src/pages/Resumes.tsx) 改为 `resume:edit`（原误用 `:update`）。
   → 现编辑按钮对具备 `:edit` 或 `resource:all` 的角色正常生效（见脚注¹）。

3. **`baobei:view`**：catalog 中真实存在，保持门控不变 → 默认仅 admin（`*`）可见「文章/Banner」，如需开放由后端配置角色权限。

> 修正后：移动端不再出现「因门控在不存在的权限点上导致仅 admin 可见」的缺陷；各角色可按后端权威语义正常访问对应模块。
