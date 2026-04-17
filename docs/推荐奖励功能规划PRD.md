# PRD：推荐奖励功能（返费系统）

> 版本：v1.4
> 日期：2026-04-15
> 状态：✅ 后端全部完成 / ✅ CRM 前端全部完成 / ⏳ 小程序前端待开发
>
> 变更记录：
> - v1.1 新增「绑定员工」审核机制与管理员干预规则
> - v1.2 新增推荐人入职需管理员审批、扫码通知员工、员工离职归属管理员、24小时SLA自动流转、返费归属分割线规则
> - v1.3 后端实现完成（NestJS CRM 侧），新增后端实现状态标注
> - v1.4 CRM 前端完成（推荐管理模块），角色值更新为「推荐官」，新增完整 API 接口文档（归属安得褓贝小程序）

---

## 1. 背景与目标

### 1.1 业务背景

"安得褓贝"现有用户体系分为 `customer`（客户/访客）和 `staff`（员工）两种角色。当前员工分享海报的目的是触达更多家政阿姨资源，但缺乏激励机制。

本功能通过**推荐人制度**，让任何扫码注册的阿姨都可以成为"推荐人"，通过向公司推荐其他阿姨入职来获得**推荐返费**，形成低成本、高效率的 KOL 招募裂变链路。

### 1.2 产品目标

1. 建立完整的推荐 → 签单 → 结算的闭环流程。
2. 推荐人可在小程序内实时查看推荐记录状态与预计返费。
3. 后端具备推荐人角色管理和返费审核能力。
4. 通过手机号/身份证号对简历精准去重，防止重复录入。

### 1.3 角色扩充

| 角色 | 标识 | 权限说明 | 获取方式 |
|---|---|---|---|
| 客户/访客 | `customer` | 浏览已发布简历 | 默认角色 |
| 员工 | `staff` | 管理**自己名下**的推荐简历、审核/跟进、签单 | `staff` 集合白名单 |
| **管理员（新增）** | **`admin`** | **拥有全部员工权限 + 可查看所有员工的推荐记录 + 唯一可干预/重新分配绑定关系的角色** | **`staff` 集合中 `isAdmin: true` 字段标记** |
| **推荐官（新增）** | **`推荐官`** | **录入被推荐阿姨简历、查看自己的推荐记录和返费状态** | **扫海报二维码注册，管理员审批通过后写入 `referrers` 集合，`miniprogram_users.role = '推荐官'`** |

> **管理员实现说明**：不新建角色字段，在现有 `staff` 集合的记录上增加 `isAdmin: boolean` 字段。`checkStaffAndAdmin()` 同时返回 `isAdmin` 标志，前端据此区分普通员工与管理员。
>
> **推荐官角色说明（v1.4 更新）**：角色标识由旧值 `'referrer'` 更新为 `'推荐官'`。后端 `resolveUserRole()` 兼容旧值，数据库已完成存量迁移。

---

## 2. 核心业务流程

### 2.1 主流程

```
【员工A】生成含自身 staffId 的招募海报
        ↓
【待推荐人】扫二维码 → 填写注册信息（姓名/手机号/微信号）→ 提交申请
        ↓ ← ① 扫码即触发：通知员工A「有人通过您的海报申请注册推荐人，请管理员审批」
        ↓ ← ② 同时通知管理员「有新的推荐人注册待审批」
        ↓
【管理员】在「推荐人审批」模块审核注册申请
    ├── 拒绝 → 填写拒绝原因 → 申请人收到通知「很遗憾，您的推荐人申请未通过」
    └── 通过 → role 赋值为 referrer → 申请人收到通知「您已成为推荐人，可开始录入推荐」
        ↓
【推荐人（已审批通过的A阿姨）】录入【被推荐阿姨B】信息
        ↓（手机号/身份证去重通过后提交）
系统创建推荐记录，assignedStaffId = 员工A（继承自 referrer.sourceStaffId）
reviewDeadlineAt = 提交时间 + 24小时
        ↓ ← 通知员工A：「您有一条新的推荐简历待审核，请在24小时内处理」
        ↓
【员工A】在小程序「待审核简历」模块24小时内审核
    ├── 拒绝 → 填写拒绝原因 → 通知推荐人审核结果
    ├── 通过 → 状态变为「跟进中」→ 员工A负责后续全程跟进
    └── 超时未处理（24h） → 自动流转管理员 → 通知员工A和管理员
        ↓
【员工A 或 接管的管理员】联系阿姨B、推进合同（CRM系统）
        ↓
合同签署成功 → 推荐记录状态更新为「已签单」，rewardOwnerStaffId 快照确定
        ↓
合同签署日 + 30天（上户满30天）→ 系统生成「返费任务」
        ↓
【rewardOwnerStaffId对应员工 或 管理员】审核返费 → 通过 → 微信转账给推荐人
        ↓
标记「已打款」→ 推荐人端状态变为「返费已到账」
```

### 2.2 绑定关系规则（核心）

> ⚠️ 这是本功能最重要的业务约束，影响所有相关模块的权限设计。

**绑定链路**：`员工A` → `推荐人（sourceStaffId=A）` → `被推荐阿姨简历（assignedStaffId=A）` → `合同（rewardOwnerStaffId快照）` → `返费`

| 规则 | 说明 |
|---|---|
| **① 推荐人注册须管理员审批** | 扫码填写信息后进入 `pending_approval` 状态，管理员审批通过后才赋予 `referrer` 角色；被拒绝则保持 `customer`，告知原因 |
| **② 扫码实时通知员工** | 推荐人提交注册申请时，**立即推送小程序订阅消息**通知来源员工A：「有人通过您的海报申请注册推荐人」 |
| **③ 绑定建立时机** | 推荐人注册审批通过时确定 `sourceStaffId`，推荐记录创建时继承为 `assignedStaffId` |
| **④ 审核/跟进权唯一性** | 只有 `assignedStaffId` 对应员工才能审核、跟进该条简历，后端强校验 |
| **⑤ 24小时审核SLA** | 简历提交后记录 `reviewDeadlineAt = 提交时间+24h`；定时任务每30分钟扫描，超时自动将 `assignedStaffId` 流转给管理员（`reassignType=review_timeout`），并通知原员工和管理员 |
| **⑥ 员工离职归属管理员** | `staff` 记录标记 `isActive=false`、`leftAt=离职日期`；触发批量将该员工所有 `pending_review` / `following_up` 记录的 `assignedStaffId` 转为管理员（`reassignType=departure`），全部写入 `referral_binding_logs` |
| **⑦ 返费归属分割线 = 离职日** | `rewardOwnerStaffId` 在合同签署时快照：`contractSignedAt < leftAt` → 归原员工；`contractSignedAt >= leftAt` → 归现绑定员工（即管理员或重新分配的新员工） |
| **⑧ 可见性** | 普通员工只能看到 `assignedStaffId = 自己` 的记录；`rewardOwnerStaffId = 自己` 的返费任务 |
| **⑨ 不影响推荐人** | 员工绑定变化不影响推荐人端展示，推荐人只看到状态和通知 |

### 2.3 管理员干预流程（手动重新分配）

```
【管理员】全量推荐管理 → 筛选目标记录
        ↓
点击「重新分配」→ 选择新绑定员工 + 填写干预原因（必填）
        ↓
系统更新 assignedStaffId
写入 referral_binding_logs（reassignType=manual）
        ↓
通知原绑定员工：「您名下的推荐记录已被管理员重新分配给 XXX」
通知新绑定员工：「有一条推荐记录已分配给您，请尽快跟进」
```

### 2.4 自动流转流程（员工离职 / 24小时超时）

```
─── 场景A：员工离职 ────────────────────────────────
管理员在「员工管理」中标记员工A离职（isActive=false, leftAt=今天）
        ↓
系统批量查询 assignedStaffId=A 且 status IN(pending_review, following_up) 的所有记录
        ↓
批量将 assignedStaffId → 管理员 openid，写入 referral_binding_logs（reassignType=departure）
        ↓
通知管理员：「员工A离职，共X条推荐记录已转入您名下，请跟进」

─── 场景B：24小时超时未审核 ────────────────────────
定时触发器（每30分钟执行一次）扫描 reviewStatus=pending_review 且 reviewDeadlineAt < now
        ↓
对每条超时记录：assignedStaffId → 管理员 openid，写入 binding_logs（reassignType=review_timeout）
        ↓
通知原员工：「您有X条待审核简历已超24小时，已自动转给管理员」
通知管理员：「有X条简历因超时审核，已自动流转至您名下」
```

---

## 3. 页面设计（小程序端）

### 3.1 页面清单

| 页面 | 路径 | 可见角色 | 入口 |
|---|---|---|---|
| 推荐人注册/申请页 | `pages/referrerRegister/index` | customer | 扫海报二维码跳转 |
| **申请等待页（审批中）** | **`pages/referrerRegister/pending`** | **customer（申请中）** | **注册提交后自动跳转** |
| 录入被推荐阿姨 | `pages/referralSubmit/index` | referrer | 注册审批通过后 / 个人中心 |
| 我的推荐记录列表 | `pages/myReferrals/index` | referrer | 个人中心「我的推荐」入口 |
| 推荐记录详情（推荐人视角） | `pages/myReferrals/detail` | referrer | 列表点击进入 |
| 待审核简历列表（员工视角） | `pages/admin/referralReview/index` | staff / admin | 个人中心 → 员工功能 → 推荐简历审核 |
| 审核详情页（员工视角） | `pages/admin/referralReview/detail` | staff / admin | 待审核列表点击进入 |
| **推荐人注册审批（管理员）** | **`pages/admin/referrerApproval/index`** | **admin** | **个人中心 → 管理员功能 → 推荐人审批（有新申请时红点）** |
| 推荐记录全量管理（管理员） | `pages/admin/referralManage/index` | admin | 个人中心 → 管理员功能 → 全量推荐管理 |

### 3.2 推荐人注册页（`pages/referrerRegister/index`）

**触发方式**：员工分享的海报二维码，携带 scene 参数 `staffId=xxx`，小程序 `onLoad` 解析后存入本地，引导注册。

**表单字段**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| 姓名 | string | ✅ | 真实姓名 |
| 手机号 | string | ✅ | 用于身份唯一标识，需授权或手动填写 |
| 微信号 | string | ✅ | 用于接收返费转账 |
| 来源员工 | string | 自动 | 从 scene 参数读取 staffId，不展示给用户 |

**业务逻辑**：

| 场景 | 处理方式 |
|---|---|
| 当前用户已是 `referrer` | 跳过注册，直接进入录入页 |
| 当前用户有 `pending_approval` 的申请 | 跳转「申请等待页」，提示审批中 |
| 手机号已存在已通过的推荐人记录 | 提示「该手机号已注册为推荐人」 |
| 正常新申请 | 写入 `referrers` 集合（`approvalStatus=pending_approval`），`users.role` **暂时保持 `customer`** |

**提交后跳转**：`pages/referrerRegister/pending`（等待页），展示「申请已提交，等待管理员审核，结果将通过小程序通知您」。

**申请等待页**（`pages/referrerRegister/pending`）：
- 展示申请进度和提交信息（姓名、手机号、提交时间）
- 审批通过后通知用户 → 引导进入录入页
- 审批拒绝后通知用户 → 页面展示拒绝原因 + 「重新申请」按钮

### 3.3 录入被推荐阿姨信息页（`pages/referralSubmit/index`）

**权限**：仅 `referrer` 可访问。

**表单字段**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| 阿姨姓名 | string | ✅ | |
| 手机号 | string | 二选一 | 与身份证号至少填一个 |
| 身份证号 | string | 二选一 | 前端格式校验：18位 |
| 服务类型 | enum | ✅ | 月嫂/育婴嫂/保姆/护老/小时工 |
| 从业经验 | string | ❌ | 简要描述 |
| 备注 | string | ❌ | 推荐人的补充说明 |

**去重规则（重点）**：
- 提交前调用后端 `referralService/action=checkDuplicate`。
- 查询范围：`resumes` 集合 + `referral_submitted_resumes` 集合，跨两张表查询。
- 匹配字段：`phone`（手机号）或 `idCard`（身份证号）。
- **命中则前端弹窗明确提示**：

  > ⚠️ 该阿姨信息已存在系统中（匹配字段：手机号/身份证号），无法重复录入。如有疑问请联系客服。

- 未命中则创建推荐记录，状态为「已提交」。

**提交成功后**：跳转至「我的推荐记录」页面，展示刚创建的记录。

### 3.4 我的推荐记录页（`pages/myReferrals/index`）

**权限**：仅 `referrer` 可访问。

**列表展示**（每条卡片）：

| 展示项 | 说明 |
|---|---|
| 阿姨姓名 | 脱敏展示，如「张**」 |
| 服务类型 | 月嫂/育婴嫂等 |
| 当前状态 | 见状态机说明 |
| 提交时间 | |
| 预计返费 | 已签单后展示金额 |

**状态机**：

```
已提交 → 简历跟进中 → 已签单 → 上户满30天 → 返费审核中 → 已打款
                ↓
            未录用（销售标记无效）
```

**状态标签颜色建议**：
- 已提交：灰色
- 简历跟进中：蓝色
- 已签单：绿色
- 上户满30天：橙色
- 返费审核中：橙色加粗
- 已打款：深绿
- 未录用：红色

### 3.5 推荐记录详情页（`pages/myReferrals/detail`，推荐人视角）

展示字段（已签单及以后状态才显示财务相关字段）：

| 字段 | 说明 |
|---|---|
| 阿姨姓名（脱敏） | |
| 服务类型 | |
| 当前状态 | |
| 审核结果 / 拒绝原因 | 审核后显示（若被拒绝则展示原因） |
| 签单时间 | 已签单后显示 |
| 合同上户日期 | 已上户后显示 |
| 上户已满天数 | 倒计时/已满30天 |
| 客户服务费 | 合同中的服务费金额（已签单后显示） |
| 预计推荐返费 | 按规则计算（已签单后显示） |
| 预计到账日期 | 签单日 + 30天（已签单后显示） |
| 实际到账日期 | 已打款后显示 |
| 推荐人微信号 | 用于核对收款账号 |

### 3.6 推荐人注册审批页（`pages/admin/referrerApproval/index`，仅管理员）

**权限**：仅 `admin` 可访问。有新申请时，管理员个人中心角标红点提示。

**Tab分类**：
- 「待审批」：`approvalStatus = pending_approval`（角标数量）
- 「已通过」：`approvalStatus = approved`
- 「已拒绝」：`approvalStatus = rejected`

**申请卡片展示字段**：

| 字段 | 说明 |
|---|---|
| 申请人姓名 / 手机号 | |
| 微信号 | 打款核对用 |
| 来源员工 | 扫了哪位员工的海报（显示员工姓名） |
| 申请时间 | |

**操作**（仅 `pending_approval` 状态）：
- ✅ **通过**：`approvalStatus → approved`，`users.role → referrer`；通知申请人「您的推荐人申请已通过，可开始录入推荐」；通知来源员工「您海报带来的推荐人 XXX 已审批通过」
- ❌ **拒绝**：弹窗填写拒绝原因（必填）→ `approvalStatus → rejected`；通知申请人「很遗憾，您的推荐人申请未通过：[原因]」

### 3.8 待审核简历列表（`pages/admin/referralReview/index`，员工视角）

**权限**：`staff` 和 `admin` 可见，普通员工**只能看到 `assignedStaffId = 自己` 的记录**，管理员可看全量（含超时流转来的记录）。

**Tab分类**：
- 「待审核」：`reviewStatus = pending_review`（数量角标提示）
- 「已处理」：`reviewStatus = approved / rejected`

**列表卡片字段**：

| 字段 | 说明 |
|---|---|
| 阿姨姓名（脱敏，如「张**」） | |
| 服务类型 | |
| 推荐人姓名 + 手机号（脱敏） | |
| 提交时间 | |
| 状态角标 | 待审核（红点）/ 已通过 / 已拒绝 |

### 3.9 审核详情页（`pages/admin/referralReview/detail`，员工视角）

**展示全部被推荐阿姨信息**（员工侧不脱敏）：

| 字段 | 说明 |
|---|---|
| 阿姨姓名 / 手机号 / 身份证号 | 完整展示（仅员工可见） |
| 服务类型 / 从业经验 / 推荐人备注 | |
| 推荐人姓名 / 手机号 / 微信号 | |
| 来源渠道 | 来自哪位员工的海报（展示员工姓名） |
| 提交时间 | |

**操作按钮**（仅 `pending_review` 状态时可操作）：

- ✅ **通过审核**：一键确认 → 状态变为 `approved / following_up`，系统通知推荐人
- ❌ **拒绝**：弹出输入框填写拒绝原因（必填）→ 状态变为 `rejected`，系统通知推荐人

**已审核状态**：展示审核时间、审核人（当前员工姓名）、审核结论和原因，不可再次操作。

> 若该记录已被管理员重新分配，展示分配记录说明（"该记录已由管理员重新分配，原负责人：xxx"）。

### 3.10 全量推荐管理页（`pages/admin/referralManage/index`，仅管理员）

**功能**：
- 查看所有推荐记录（不限 assignedStaffId）
- 筛选：按状态、按绑定员工、按推荐人、按时间范围
- **重新分配绑定员工**：选择记录 → 选择新员工 → 填写干预原因（必填）→ 确认
- 查看绑定变更日志（referral_binding_logs）
- 返费审核与打款操作（全量）

---

## 4. 数据模型（云数据库集合）

### 4.1 `referrers`（推荐人档案）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档ID |
| `_openid` | string | 微信 openid |
| `name` | string | 真实姓名 |
| `phone` | string | 手机号（唯一索引） |
| `wechatId` | string | 微信号，用于接收返费 |
| `sourceStaffId` | string | 来源员工ID（扫哪位员工的海报） |
| **`approvalStatus`** | **enum** | **`pending_approval`（待审批）/ `approved`（已通过）/ `rejected`（已拒绝），默认 `pending_approval`** |
| **`approvedBy`** | **string** | **审批通过的管理员 openid** |
| **`approvedAt`** | **date** | **审批通过时间** |
| **`rejectedReason`** | **string** | **拒绝原因（拒绝时必填）** |
| `totalReferrals` | number | 累计推荐数，默认0 |
| `totalRewardAmount` | number | 累计已获返费金额（元），默认0 |
| `status` | 'active' \| 'disabled' | 推荐人状态，默认 active |
| `createdAt` | serverDate | 申请时间 |
| `updatedAt` | serverDate | |

> 注意：推荐人完成注册信息填写后，`approvalStatus` 为 `pending_approval`，此时 `users.role` 仍为 `customer`。管理员审批通过后，`approvalStatus → approved`，同步更新 `users.role → referrer`。

### 4.2 `referral_resumes`（推荐提交的阿姨简历）

> 注意：与 `resumes` 集合区分，本集合存放**推荐人提交的待跟进简历**，不直接对外展示，由绑定员工审核后进入跟进流程。

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档ID |
| `referrerId` | string | 推荐人 `referrers._id` |
| `referrerPhone` | string | 推荐人手机号（冗余） |
| `name` | string | 被推荐阿姨姓名 |
| `phone` | string | 被推荐阿姨手机号（去重用） |
| `idCard` | string | 被推荐阿姨身份证号（加密存储，去重用） |
| `serviceType` | string | 服务类型 |
| `experience` | string | 从业经验描述 |
| `remark` | string | 推荐人备注 |
| **`assignedStaffId`** | **string** | **当前绑定员工 openid（继承自 referrer.sourceStaffId），唯一有审核/跟进权的员工** |
| **`rewardOwnerStaffId`** | **string** | **返费归属员工 openid（合同签署时快照：签署时间 < 原员工离职日 → 原员工；否则 → 当前员工）** |
| **`reviewStatus`** | **enum** | **`pending_review` / `approved` / `rejected`** |
| **`reviewDeadlineAt`** | **date** | **审核截止时间（提交时间 + 24小时），用于定时任务扫描超时** |
| **`reviewedAt`** | **date** | **实际审核时间** |
| **`reviewedBy`** | **string** | **审核员工 openid（正常情况与 assignedStaffId 相同；超时流转后可能是管理员）** |
| **`reviewNote`** | **string** | **审核备注（拒绝时必填）** |
| `status` | enum | 见下方枚举（整体流程状态） |
| `contractId` | string | 关联合同ID（签单后由CRM回填） |
| `contractSignedAt` | date | 合同签署时间 |
| `onboardedAt` | date | 上户时间（CRM回填） |
| `serviceFee` | number | 合同服务费（元，CRM回填） |
| `rewardAmount` | number | 返费金额（元，系统计算） |
| `rewardExpectedAt` | date | 预计到账日期（签单日+30天） |
| `rewardPaidAt` | date | 实际打款日期 |
| `rewardStatus` | enum | `pending`/`reviewing`/`paid`/`rejected` |
| `createdAt` | serverDate | |
| `updatedAt` | serverDate | |

**status 枚举（整体流程状态）**：
```
pending_review    待审核（提交后默认状态，等待绑定员工审核）
rejected          已拒绝（绑定员工拒绝，附原因）
following_up      跟进中（审核通过后）
contracted        已签单
onboarded         已上户
reward_pending    返费待审核
reward_paid       返费已打款
invalid           未录用（跟进中标记为无效）
```

> 注意：`reviewStatus` 是审核环节的独立状态（pending_review / approved / rejected），`status` 是整体业务流程状态，两者配合使用。审核通过后 `reviewStatus=approved`，同时 `status` 自动推进为 `following_up`。

### 4.3 `referral_binding_logs`（绑定关系变更审计日志）

> 记录所有绑定变更（手动干预、员工离职、超时流转），**只可追加，不可删除**。

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | |
| `referralResumeId` | string | 关联的 `referral_resumes._id` |
| `fromStaffId` | string | 原绑定员工 openid |
| `toStaffId` | string | 新绑定员工 openid |
| **`reassignType`** | **enum** | **`manual`（管理员手动）/ `departure`（员工离职）/ `review_timeout`（24小时超时）** |
| **`staffDepartedAt`** | **date** | **（仅 departure 类型）员工离职日期，即返费归属分割线** |
| `operatedBy` | string | 操作人 openid（管理员 or 系统定时任务填 `system`） |
| `reason` | string | 干预原因（manual 类型必填；其余类型系统自动填写） |
| `operatedAt` | serverDate | 操作时间 |

### 4.4 `staff` 集合字段扩展（现有集合）

在现有 `staff` 集合中新增以下字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `isAdmin` | boolean | 是否为管理员，默认 `false` |
| **`isActive`** | **boolean** | **是否在职，默认 `true`；标记离职时设为 `false`** |
| **`leftAt`** | **date** | **离职日期（离职时由管理员填写），是返费归属的分割线** |

### 4.5 `referral_rewards`（返费打款记录）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | |
| `referralResumeId` | string | 关联 `referral_resumes._id` |
| `assignedStaffId` | string | 绑定员工 openid（冗余，便于按员工查询返费任务） |
| `referrerId` | string | 推荐人ID |
| `referrerPhone` | string | 推荐人手机号 |
| `referrerWechatId` | string | 推荐人微信号 |
| `amount` | number | 返费金额（元） |
| `status` | 'reviewing' \| 'paid' \| 'rejected' | |
| `reviewedBy` | string | 审核员工 openid |
| `paidAt` | date | 打款时间 |
| `paidBy` | string | 打款操作员 openid |
| `remark` | string | 审核备注 |
| `createdAt` | serverDate | |
| `updatedAt` | serverDate | 更新时间 |

---

## 5. 云函数 / 接口设计

### 5.1 新增云函数：`referralService`

**路径**：`cloudfunctions/referralService/index.js`

#### 推荐人侧（referrer 角色调用）

| action | 说明 | 入参 | 出参 |
|---|---|---|---|
| `registerReferrer` | 注册为推荐人 | `{ name, phone, wechatId, sourceStaffId }` | `{ success, data: Referrer }` |
| `checkDuplicate` | 去重查询 | `{ phone?, idCard? }` | `{ success, isDuplicate, matchField }` |
| `submitReferral` | 录入被推荐阿姨（自动赋 assignedStaffId） | `{ name, phone?, idCard?, serviceType, experience?, remark? }` | `{ success, data: ReferralResume }` |
| `getMyReferrals` | 获取我的推荐列表（仅自己） | `{ page?, pageSize? }` | `{ success, data: ReferralResume[] }` |
| `getReferralDetail` | 推荐记录详情（脱敏版） | `{ id }` | `{ success, data: ReferralResume }` |

#### 员工侧（staff 角色调用，仅可操作 assignedStaffId = 自己 的记录）

| action | 说明 | 入参 | 出参 |
|---|---|---|---|
| `getMyAssignedReferrals` | 获取分配给我的推荐简历列表 | `{ reviewStatus?, page?, pageSize? }` | `{ success, data[] }` |
| `reviewReferral` | **审核推荐简历（通过/拒绝）** | `{ id, result: 'approve'/'reject', note? }` | `{ success }` |
| `updateReferralStatus` | 更新跟进状态（跟进中/已上户/未录用等） | `{ id, status }` | `{ success }` |
| `processReward` | 返费审核/打款（仅限自己名下） | `{ referralResumeId, action: 'approve'/'reject'/'markPaid', remark? }` | `{ success }` |

> **后端校验**：`reviewReferral` 和 `updateReferralStatus` 必须验证 `record.assignedStaffId === callerOpenid`，否则返回 `permission denied`。

#### 管理员侧（admin 角色调用，无绑定限制）

| action | 说明 | 入参 | 出参 |
|---|---|---|---|
| **`listPendingReferrers`** | **待审批的推荐人申请列表** | `{ page?, pageSize? }` | `{ success, data: Referrer[] }` |
| **`approveReferrer`** | **通过推荐人注册申请** | `{ referrerId }` | `{ success }` |
| **`rejectReferrer`** | **拒绝推荐人注册申请** | `{ referrerId, reason }` | `{ success }` |
| `listAllReferrals` | 全量推荐记录（可按员工/状态筛选） | `{ assignedStaffId?, status?, page?, pageSize? }` | `{ success, data[] }` |
| `reassignBinding` | 重新分配绑定员工（手动干预） | `{ id, newStaffId, reason }` | `{ success }` |
| **`markStaffDeparted`** | **标记员工离职，触发批量自动流转** | `{ staffId, leftAt }` | `{ success, transferredCount }` |
| `getBindingLogs` | 查询某条记录的绑定变更日志 | `{ referralResumeId }` | `{ success, data: BindingLog[] }` |
| `adminProcessReward` | 全量返费审核/打款 | `{ referralResumeId, action, remark? }` | `{ success }` |

> **`approveReferrer` 执行逻辑**：
> 1. `referrers.approvalStatus → approved`，写入 `approvedBy`、`approvedAt`
> 2. `users.role → referrer`（查找对应 openid 的 users 文档更新）
> 3. 推送订阅消息通知申请人「审批通过」
> 4. 推送订阅消息通知来源员工「您海报带来的推荐人 XXX 已审批通过」

> **`markStaffDeparted` 执行逻辑**：
> 1. `staff.isActive → false`，`staff.leftAt → 离职日期`
> 2. 批量查询 `assignedStaffId=staffId` 且 `status IN(pending_review, following_up)` 的记录
> 3. 批量更新 `assignedStaffId → adminOpenid`
> 4. 批量写入 `referral_binding_logs`（`reassignType=departure`, `staffDepartedAt=leftAt`）
> 5. 通知管理员批量转入摘要

#### CRM 回调（`X-Service-Secret` 鉴权）

| action | 说明 | 入参 | 关键逻辑 |
|---|---|---|---|
| `crmCallback_contractSigned` | 合同签署回调 | `{ referralResumeId, contractId, contractSignedAt, serviceFee }` | **快照 `rewardOwnerStaffId`**：查询当前 `assignedStaffId` 对应员工的 `leftAt`，若 `contractSignedAt < leftAt` → 原员工，否则 → 当前 `assignedStaffId` |
| `crmCallback_onboarded` | 上户回调 | `{ referralResumeId, onboardedAt }` | 更新状态为 `onboarded` |

### 5.5 定时触发器：24小时审核超时自动流转

**云函数**：`referralService` 新增 `timer` 触发器（或单独的 `referralTimer` 云函数）

**触发频率**：每30分钟执行一次（Cron: `0 */30 * * * *`）

**执行逻辑**：
```
查询 referral_resumes 中：
  reviewStatus = 'pending_review' AND reviewDeadlineAt < now()

对每条超时记录：
1. assignedStaffId → 管理员 openid
2. 写入 referral_binding_logs（reassignType=review_timeout, operatedBy='system'）
3. 批量通知原员工（合并通知，避免频繁推送）
4. 通知管理员（汇总条数）
```

### 5.2 扩展 `resumeService`：去重接口

在现有 `resumeService` 增加内部查重方法，被 `referralService.checkDuplicate` 调用：

```js
// 查询 resumes 集合中 phone 或 idCard 是否已存在（非暴露接口）
async function checkExistsByPhoneOrIdCard(phone, idCard) { ... }
```

### 5.3 扩展 `userService`：角色判定与管理员支持

**角色优先级：admin > staff > referrer > customer**

扩展 `isStaff` 函数，同时返回 `isAdmin` 标志：

```js
async function isStaff(openid, phone) {
  // 查找 staff 集合记录，同时返回 isAdmin 字段
  // 若 staff 记录中 isAdmin === true，则该用户为管理员
  // 返回: { isStaff: bool, isAdmin: bool }
}
```

扩展 `getOrCreateMe`，`users` 文档中 `role` 新增 `'admin'` 枚举值：

```js
// 判定逻辑：
// 1. isStaff() 且 isAdmin → role = 'admin'
// 2. isStaff() 且 !isAdmin → role = 'staff'
// 3. referrers 集合存在对应记录 → role = 'referrer'
// 4. 其余 → role = 'customer'
```

新增 `action=getReferrerInfo`：返回当前用户的推荐人档案。

新增 `action=getStaffList`：返回员工列表（供管理员重新分配绑定时选择员工，仅 admin 可调用）。

### 5.4 CRM 后端新增接口（crm.andejiazheng.com）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/referral/submit` | 接收推荐简历，写入CRM待跟进池 |
| GET | `/api/referral/check-duplicate` | 查重（手机号/身份证） |
| POST | `/api/referral/contract-signed` | 合同签署后回调，更新推荐记录 |
| POST | `/api/referral/onboarded` | 上户后回调，记录上户时间 |
| GET | `/api/admin/referrals` | 管理员查看所有推荐记录 |
| POST | `/api/admin/referral/reward/pay` | 标记返费已打款 |

> CRM 回调到微信云开发：使用现有 `CRM_SERVICE_SECRET` + `X-Service-Secret` 请求头，调用云函数 `referralService/action=updateReferralStatus`。

---

## 6. 返费规则（业务规则）

### 6.1 返费金额计算（🔴 待业务确认）

> 以下为建议方案，需与运营/财务确认后写入代码。

**方案A（固定金额制）**：

| 服务类型 | 返费金额 |
|---|---|
| 月嫂 | 500元 |
| 育婴嫂 | 300元 |
| 保姆 | 300元 |
| 护老 | 200元 |
| 小时工 | 100元 |

**方案B（比例制）**：返费 = 客户服务费 × N%（建议5%~10%，需确认）

**方案C（混合制）**：基础返费（固定金额）+ 服务费超过阈值后额外奖励

### 6.2 结算时间规则

- **触发条件**：合同签署之日起满 **30个自然日**（含签署当天）且合同未提前终止。
- **打款方式**：人工审核 → 微信转账给推荐人微信号。
- **例外**：若合同在30天内提前终止（阿姨离职/客户退单），返费**不予发放**，系统标记「已退单」。

### 6.3 返费归属规则（员工离职场景）

> 分割线 = 员工离职日期（`staff.leftAt`）

| 场景 | 合同签署时间 | `rewardOwnerStaffId` | 说明 |
|---|---|---|---|
| 员工未离职（正常情况） | 任意时间 | = 当前 `assignedStaffId`（该员工） | 常规流程 |
| 员工已离职，合同在离职前签 | `contractSignedAt < leftAt` | = **原员工** openid | 离职前的成果归原员工 |
| 员工已离职，合同在离职后签 | `contractSignedAt >= leftAt` | = **当前 `assignedStaffId`**（管理员或新分配员工） | 离职后的跟进成果归现员工 |

**实现方式**：`crmCallback_contractSigned` 回调时，查询 `assignedStaffId` 对应员工的 `leftAt`：
- 若员工仍在职（`isActive=true`）→ `rewardOwnerStaffId = assignedStaffId`
- 若员工已离职（`isActive=false`）→ 比较 `contractSignedAt` 与 `leftAt`，按上表赋值

**返费任务可见性**：员工端「返费待处理」列表基于 `rewardOwnerStaffId = 自己` 来筛选，而非 `assignedStaffId`，确保返费归属准确。

### 6.3 去重规则

| 查重字段 | 查重范围 | 命中处理 |
|---|---|---|
| 手机号 | `resumes` + `referral_resumes` 两个集合 | 拒绝录入，提示"手机号已存在" |
| 身份证号 | `resumes` + `referral_resumes` 两个集合 | 拒绝录入，提示"身份证号已存在" |
| 两者均填 | 任意一个命中即拒绝 | 提示具体命中字段 |

**前端错误提示文案**：

> ⚠️ 录入失败：该阿姨[手机号/身份证号]已在系统中存在，无法重复录入。如您认为有误，请联系客服处理。

---

## 7. 海报分享改造（员工端）

现有海报（`pages/poster`）的二维码指向小程序首页。需新增**带推荐参数的招募专用海报**：

- 二维码 scene 参数携带 `staffId={当前员工ID}`。
- 用户扫码后 `onLoad` 解析 scene，存入 `wx.setStorage('referral_source_staff_id', staffId)`。
- 跳转路径：`pages/referrerRegister/index`（推荐人注册页）。
- 员工端入口：个人中心 → 员工功能区 → **生成招募海报**（新增按钮，staff 角色可见）。

> 复用现有 `quickstartFunctions` 的 `getHomeMiniCode` 能力，改造为支持 `scene` 动态传参的 `getReferralMiniCode(staffId)`。

---

## 8. 权限矩阵

| 能力 | customer | customer（申请中） | referrer | staff（普通员工） | admin（管理员） |
|---|:---:|:---:|:---:|:---:|:---:|
| 申请注册推荐人 | ✅ | — | — | — | — |
| **审批推荐人注册申请** | ❌ | ❌ | ❌ | ❌ | ✅（**唯一有权**） |
| 查看申请等待状态 | ❌ | ✅ | — | — | — |
| 录入被推荐阿姨简历 | ❌ | ❌ | ✅ | ✅ | ✅ |
| 去重查询 | ❌ | ❌ | ✅ | ✅ | ✅ |
| 查看自己的推荐记录 | ❌ | ❌ | ✅ | ✅（仅assignedStaffId=自己） | ✅（全量） |
| 审核推荐简历（通过/拒绝） | ❌ | ❌ | ❌ | ✅（**仅限assignedStaffId=自己**） | ✅（全量） |
| 更新跟进状态 | ❌ | ❌ | ❌ | ✅（仅自己名下） | ✅（全量） |
| 返费审核/打款 | ❌ | ❌ | ❌ | ✅（仅rewardOwnerStaffId=自己） | ✅（全量） |
| 查看全量推荐记录 | ❌ | ❌ | ❌ | ❌ | ✅ |
| 重新分配绑定员工（手动） | ❌ | ❌ | ❌ | ❌ | ✅（**唯一有权**） |
| **标记员工离职（触发自动流转）** | ❌ | ❌ | ❌ | ❌ | ✅（**唯一有权**） |
| 查看绑定变更日志 | ❌ | ❌ | ❌ | ❌ | ✅ |
| 浏览已发布简历（原有权限） | ✅ | ✅ | ✅ | ✅ | ✅ |

> **关键约束**：`staff` 角色在审核和状态更新时，后端云函数**必须强校验** `record.assignedStaffId === callerOpenid`，前端隐藏入口不足以保证安全。

---

## 9. 后台管理（小程序员工端 / 管理员端）

### 9.1 普通员工端——「我的推荐审核」

入口：个人中心 → 员工功能 → **推荐简历审核**（带角标，有待审核记录时显示红点）

**查看范围**：仅 `assignedStaffId = 自己` 的记录

| Tab | 内容 |
|---|---|
| 待审核 | reviewStatus = pending_review，需尽快处理 |
| 已通过 | reviewStatus = approved，可查看后续跟进进度 |
| 已拒绝 | reviewStatus = rejected，含拒绝原因 |

**操作权限**：审核（通过/拒绝）、更新跟进状态、发起返费打款

### 9.2 管理员端——「推荐人审批」

入口：个人中心 → 管理员功能 → **推荐人审批**（有新申请时红点提示）

| 功能 | 说明 |
|---|---|
| 待审批列表 | 展示姓名、手机号、微信号、来源员工、申请时间 |
| 通过 | 一键通过，自动赋予 referrer 角色，通知申请人和来源员工 |
| 拒绝 | 填写拒绝原因（必填），通知申请人原因 |
| 历史记录 | 已通过/已拒绝的推荐人审批记录，支持搜索 |

### 9.3 管理员端——「全量推荐管理」

入口：个人中心 → 管理员功能 → **推荐管理**（仅 admin 可见）

| 功能 | 说明 |
|---|---|
| 全量记录查看 | 所有员工名下的推荐简历，可按员工/状态/时间/`rewardOwnerStaffId` 筛选 |
| **重新分配绑定员工（手动）** | 选中记录 → 选新员工 → 填干预原因 → 确认，同时通知两位员工 |
| 超时流转记录查看 | 可筛选 `reassignType=review_timeout` 的记录，追溯超时情况 |
| 绑定变更日志 | 查看某条记录所有历史分配记录（不可删除） |
| 全量返费操作 | 基于 `rewardOwnerStaffId` 汇总返费任务，不受 assignedStaffId 限制 |

### 9.4 管理员端——「员工管理」（扩展现有功能）

在现有员工管理页新增：

| 功能 | 说明 |
|---|---|
| **标记离职** | 输入离职日期（`leftAt`）→ 确认 → 触发 `markStaffDeparted`，系统自动批量流转该员工名下待处理的推荐记录 |
| 离职员工查看 | 展示 `isActive=false` 的员工，及其名下历史推荐记录汇总 |
| 推荐记录分布 | 各员工名下待审核/跟进中/已签单数量统计 |

### 9.5 推荐人管理（管理员）

| 展示字段 | 说明 |
|---|---|
| 推荐人姓名、手机号、微信号 | |
| 审批状态 | pending_approval / approved / rejected |
| 来源员工 | 扫了哪位员工的海报，显示员工姓名 |
| 累计推荐数 / 有效推荐数 / 累计已打款金额 | |
| 注册时间、状态（启用/禁用） | |

---

## 10. 前后端工作分工

> **整体进度（v1.4）**
> - ✅ **后端（NestJS）**：全部完成，含推荐模块、简历库集成、可见性控制、CRM 回调、定时任务
> - ✅ **CRM 前端（React）**：全部完成，含推荐人列表、推荐简历审核、全量推荐管理、员工离职标记
> - ⏳ **小程序前端**：待开发（本章节为需求说明，API 文档见第 13 节）

---

### 🖥️ 前端工作（小程序端 `miniprogram/`）

前端负责：**所有页面 UI、交互逻辑、路由跳转、客户端表单校验、角色渲染差异、调用云函数**。
前端**不负责**：角色判断最终决策、权限校验、数据写入、推送通知、定时任务。

---

#### 10.1 新增页面（共 8 个）

| # | 页面路径 | 可见角色 | 核心前端工作 |
|---|---|---|---|
| 1 | `pages/referrerRegister/index` | customer | 解析 scene 参数提取 `staffId` 并存 storage；注册表单（姓名/手机/微信号）；4种场景跳转判断（已是推荐人/申请中/手机号重复/新申请） |
| 2 | `pages/referrerRegister/pending` | customer（申请中） | 展示申请信息和"等待审批"状态；轮询或订阅消息触发后刷新状态；审批通过跳录入页，拒绝展示原因+「重新申请」按钮 |
| 3 | `pages/referralSubmit/index` | referrer | 被推荐阿姨信息表单；手机号/身份证号格式校验（前端18位）；提交前调用去重接口，命中弹窗拦截；提交成功跳推荐列表 |
| 4 | `pages/myReferrals/index` | referrer | 推荐记录列表；状态标签颜色区分（7种颜色）；已签单后展示预计返费金额 |
| 5 | `pages/myReferrals/detail` | referrer | 按状态阶段性展示字段（签单前/签单后/打款后）；脱敏展示姓名手机；倒计时组件展示上户满30天进度；展示审核拒绝原因 |
| 6 | `pages/admin/referrerApproval/index` | admin | Tab：待审批/已通过/已拒绝；角标数量展示；通过操作一键确认；拒绝弹窗（必填原因）；展示来源员工姓名 |
| 7 | `pages/admin/referralReview/index` | staff / admin | Tab：待审核（角标）/已处理；员工只看自己名下记录（由接口控制，前端不做过滤）；卡片展示剩余审核时间倒计时（`reviewDeadlineAt - now`）；超时记录高亮提示 |
| 8 | `pages/admin/referralReview/detail` | staff / admin | 展示阿姨完整信息（不脱敏）；通过/拒绝操作按钮（仅 `pending_review` 可操作）；展示已被重新分配的提示说明；展示审核人姓名和时间 |
| 9 | `pages/admin/referralManage/index` | admin | 全量列表+多维筛选（员工/状态/时间）；重新分配弹窗（选员工+必填原因）；绑定变更日志 drawer；返费审核打款操作 |

---

#### 10.2 改造现有页面

**`pages/poster/index`（海报页）**
- 新增「招募专用海报」入口按钮（`staff` 角色可见）
- 调用 `getReferralMiniCode(staffId)` 生成带 `staffId` scene 参数的二维码
- 新海报样式与现有海报区分展示（样式待设计确认）

**个人中心页（`pages/my/index`）**
- 按角色差异渲染入口模块：

| 角色 | 新增入口 | 角标条件 |
|---|---|---|
| `referrer` | 「我的推荐」 | 有新打款时红点 |
| `staff` | 「推荐简历审核」 | `pending_review` 数量 > 0 时显示数字角标 |
| `admin` | 「推荐人审批」「全量推荐管理」 | 「推荐人审批」有 `pending_approval` 数量时显示角标 |

**`app.json`**
- 注册以上所有新页面路径

---

#### 10.3 通用前端工作

| 类别 | 具体工作 |
|---|---|
| **订阅消息授权** | 在关键操作前（注册提交、录入简历）弹出订阅消息授权，申请所需模板的通知权限 |
| **脱敏工具函数** | 封装姓名脱敏（`张**`）、手机号脱敏（`138****5678`）的通用函数 |
| **状态枚举映射** | 维护 `status` 枚举 → 中文标签、颜色 tag 的映射表 |
| **倒计时组件** | 上户满30天进度（详情页）、审核剩余24h（员工审核列表） |
| **scene 解析** | `onLoad` 中解析 `options.scene`（URLdecode），提取 `staffId` 写入 `wx.setStorageSync` |
| **权限守卫** | 各页面 `onLoad` 校验角色是否匹配，不匹配则提示并跳转首页 |

---

### ⚙️ 后端工作

后端负责：**所有数据读写、角色权限最终校验、业务规则执行、推送通知、定时任务、CRM 联动**。

---

#### 10.4 新增云函数：`referralService`

> ✅ **已实现（v1.3）**：NestJS 模块路径 `backend/src/modules/referral/`，接口前缀 `/referral`

**路径**：`cloudfunctions/referralService/`（小程序云函数侧）/ `backend/src/modules/referral/`（CRM NestJS 侧）

| 分组 | action | 核心逻辑要点 |
|---|---|---|
| **推荐人注册** | `registerReferrer` | 写入 `referrers`（`approvalStatus=pending_approval`）；`users.role` 保持不变；调用 subscribeMessage 通知来源员工 + 管理员 |
| **推荐人注册** | `checkReferrerStatus` | 查询当前 openid 对应的 `referrers.approvalStatus`，供等待页轮询 |
| **简历去重** | `checkDuplicate` | 跨 `resumes` + `referral_resumes` 两个集合查询 phone 或 idCard；返回 `{ isDuplicate, matchField }` |
| **提交推荐** | `submitReferral` | 校验 role=referrer；创建 `referral_resumes` 记录，`assignedStaffId=referrer.sourceStaffId`，`reviewDeadlineAt=now+24h`；通知绑定员工 |
| **推荐人视图** | `getMyReferrals` | 仅查询 `referrerId=自己` 的记录；脱敏后返回（手机号、身份证号不返回） |
| **推荐人视图** | `getReferralDetail` | 同上，单条详情；按状态控制返回字段（签单前不返回财务字段） |
| **员工审核** | `getMyAssignedReferrals` | **强校验**：只查 `assignedStaffId=callerOpenid` 的记录（admin 不限制）；附带 `reviewDeadlineAt` 供前端倒计时 |
| **员工审核** | `reviewReferral` | **强校验** `assignedStaffId===callerOpenid`（admin 可绕过）；更新 `reviewStatus` + `reviewedAt` + `reviewedBy` + `reviewNote`；通过时同步 `status→following_up`；通知推荐人结果 |
| **员工跟进** | `updateReferralStatus` | **强校验** `assignedStaffId===callerOpenid`；更新 `status` 字段；触发条件限制（如只能从 following_up 推进） |
| **员工返费** | `processReward` | **强校验** `rewardOwnerStaffId===callerOpenid`；更新返费状态；写 `referral_rewards` 记录 |
| **管理员审批** | `listPendingReferrers` | 查询 `approvalStatus=pending_approval` 的记录；Join 来源员工姓名 |
| **管理员审批** | `approveReferrer` | 校验 isAdmin；更新 `referrers.approvalStatus→approved` + `approvedBy` + `approvedAt`；**更新 `miniprogram_users.role→'推荐官'`**（使用 `mpUser.openid` 而非 `referrer.openid`）；通知申请人 + 来源员工 |
| **管理员审批** | `rejectReferrer` | 校验 isAdmin；更新 `approvalStatus→rejected` + `rejectedReason`；通知申请人原因 |
| **管理员全量** | `listAllReferrals` | 校验 isAdmin；全量查询，支持多维筛选；返回完整信息（不脱敏） |
| **管理员全量** | `reassignBinding` | 校验 isAdmin；更新 `assignedStaffId`；写 `referral_binding_logs`（`reassignType=manual`）；通知原员工 + 新员工 |
| **管理员离职** | `markStaffDeparted` | 校验 isAdmin；更新 `staff.isActive=false` + `leftAt`；**批量查询并转移**该员工 `pending_review`/`following_up` 的记录到管理员 openid；批量写 `referral_binding_logs`（`reassignType=departure`，带 `staffDepartedAt`）；通知管理员汇总 |
| **管理员** | `getBindingLogs` | 校验 isAdmin；查询指定记录的所有绑定变更日志 |
| **管理员** | `adminProcessReward` | 校验 isAdmin；无 `rewardOwnerStaffId` 限制的返费操作 |
| **CRM 回调** | `crmCallback_contractSigned` | 验证 `X-Service-Secret`；更新 `status→contracted`；**快照 `rewardOwnerStaffId`**（查员工 `leftAt` 与 `contractSignedAt` 比较）；计算 `rewardExpectedAt=contractSignedAt+30天` |
| **CRM 回调** | `crmCallback_onboarded` | 验证 `X-Service-Secret`；更新 `onboardedAt`，`status→onboarded` |

---

#### 10.5 新增定时触发器（24小时超时自动流转）

> ✅ **已实现（v1.3）**：`ReferralService.handleReviewTimeout()`，`@Cron('0 */30 * * * *')`

**触发方式**：NestJS `@nestjs/schedule` Cron，每 30 分钟执行一次

**执行逻辑**：
```
查询：reviewStatus = 'pending_review' AND reviewDeadlineAt < now()
批量处理每条超时记录：
  1. assignedStaffId → 管理员 ID
  2. 写入 referral_binding_logs（reassignType='review_timeout', operatedBy='system'）
合并通知原员工（按员工分组，每员工汇总一条）
通知管理员（汇总条数）
```

---

#### 10.6 改造现有云函数

> ✅ **已实现（v1.3）**

**`userService`（对应 NestJS `UsersService`）**

| 改造点 | 具体内容 | 实现状态 |
|---|---|---|
| `isStaff()` | 返回值扩展为 `{ isStaff: bool, isAdmin: bool }`，读取 `staff.isAdmin` 字段 | ✅ `checkStaffAndAdmin()` |
| `getOrCreateMe()` | 角色判定顺序：先判 `isAdmin` → 再判 `isStaff` → 再查 `referrers`（`approvalStatus=approved`）→ 默认 `customer` | ✅ `MiniProgramUserService.resolveUserRole()` |
| 新增 `getReferrerInfo` | 返回当前用户的 `referrers` 档案（含 `approvalStatus`，供等待页判断） | ✅ `ReferralService.checkReferrerStatus()` |
| 新增 `getStaffList` | 返回所有在职员工列表（`isActive=true`），供管理员重新分配时选择 | ✅ `UsersService.findActiveStaff()` |

**`resumeService`（对应 NestJS `ResumeService`）**

| 改造点 | 具体内容 | 实现状态 |
|---|---|---|
| 新增内部方法 `checkExistsByPhoneOrIdCard` | 被 `ReferralService.checkDuplicate` 调用，跨 `resumes` 集合查重，不对外暴露 | ✅ 已实现 |

---

#### 10.7 数据库变更

> ✅ **已实现（v1.3）**：所有集合通过 Mongoose Schema 自动创建，索引已定义

| 操作 | 集合 / 字段 | 说明 | 实现状态 |
|---|---|---|---|
| **新建集合** | `referrers` | 推荐人档案 | ✅ `referrer.model.ts` |
| **新建集合** | `referral_resumes` | 推荐提交的阿姨简历 | ✅ `referral-resume.model.ts` |
| **新建集合** | `referral_rewards` | 返费打款记录 | ✅ `referral-reward.model.ts` |
| **新建集合** | `referral_binding_logs` | 绑定关系变更审计日志（不可删除） | ✅ `referral-binding-log.model.ts` |
| **修改现有** | `staff`（CRM `users`）集合新增 3 个字段 | `isAdmin: bool`（默认false）、`isActive: bool`（默认true）、`leftAt: date`（可空） | ✅ `user.entity.ts` |
| **添加索引** | `referrers.phone` | 唯一索引，防重复注册 | ✅ |
| **添加索引** | `referral_resumes.assignedStaffId` | 员工查自己名下记录高频查询 | ✅ |
| **添加索引** | `referral_resumes.reviewDeadlineAt` | 定时任务扫描超时记录 | ✅ |
| **添加索引** | `referral_resumes.rewardOwnerStaffId` | 员工查自己的返费任务 | ✅ |
| **添加索引** | `referrers.approvalStatus` | 管理员查待审批列表 | ✅ |

---

#### 10.8 CRM 后端新增接口

> ✅ **已实现（v1.3）**：接口均在 `ReferralController` 中，路径前缀 `/referral`

| 方法 | 路径 | 说明 | 实现路径 |
|---|---|---|---|
| POST | `/referral/miniprogram/submit-referral` | 接收推荐简历 | ✅ `ReferralController` |
| GET | `/referral/miniprogram/check-duplicate` | 查重（手机号/身份证） | ✅ `ReferralController` |
| POST | `/referral/crm/contract-signed` | 合同签署回调（X-Service-Secret 鉴权） | ✅ `ReferralController` |
| POST | `/referral/crm/onboarded` | 上户回调（X-Service-Secret 鉴权） | ✅ `ReferralController` |
| GET | `/referral/admin/all-referrals` | 管理员查看所有推荐记录 | ✅ `ReferralController` |
| POST | `/referral/admin/process-reward` | 管理员全量返费审核/打款 | ✅ `ReferralController` |

---

#### 10.9 微信订阅消息模板申请（后端发送，前端需授权）

> 以下消息由 NestJS `MiniProgramNotificationService.createNotification()` 写入站内通知，当前复用已有通知类型（`CONTRACT_INVITE`/`CONTRACT_SIGNED`/`PAYMENT_DONE`）。
> ⚠️ **待前端对接**：正式上线前需申请对应的微信订阅消息模板ID，后端调用微信官方 `subscribeMessage.send` API 推送。

| # | 消息场景 | 接收方 | 触发时机 | 实现状态 |
|---|---|---|---|---|
| 1 | 有人通过您的海报申请成为推荐人 | 来源员工 | 推荐人提交注册申请时 | ✅ 站内通知已发送 |
| 2 | 推荐人申请结果通知（通过/拒绝） | 申请人 | 管理员完成审批时 | ✅ 站内通知已发送 |
| 3 | 您的推荐人已通过审批 | 来源员工 | 管理员通过审批时 | ✅ 站内通知已发送 |
| 4 | 您有新的推荐简历待审核（24小时内） | 绑定员工 | 推荐人提交简历时 | ✅ 站内通知已发送 |
| 5 | 您的推荐简历审核结果通知 | 推荐人 | 员工完成审核时 | ✅ 站内通知已发送 |
| 6 | 待审核简历已超时自动转给管理员 | 原绑定员工（汇总） | 定时任务触发 | ✅ 站内通知已发送 |
| 7 | 有新的推荐简历因超时转入您名下 | 管理员（汇总） | 定时任务触发 | ✅ 站内通知已发送 |
| 8 | 员工离职，推荐记录已转入您名下 | 管理员 | `markStaffDeparted` 执行时 | ✅ 站内通知已发送 |
| 9 | 您的推荐记录已被管理员重新分配 | 原绑定员工 | `reassignBinding` 执行时 | ✅ 站内通知已发送 |
| 10 | 您有一条推荐记录已分配给您 | 新绑定员工 | `reassignBinding` 执行时 | ✅ 站内通知已发送 |
| 11 | 推荐返费已到账 | 推荐人 | 标记打款完成时 | ✅ 站内通知已发送 |

---

## 11. 待确认事项（🔴 需业务决策）

| # | 问题 | 影响模块 | 状态 |
|---|---|---|---|
| 1 | 返费金额按固定金额制/比例制/混合制？具体数值？ | 返费计算逻辑 | 🔴 **待确认**，当前后端按方案A（固定金额）临时占位：月嫂500/育婴嫂300/保姆300/护老200/小时工100 |
| 2 | 合同提前终止（30天内离职/退单），返费全额取消还是按比例？ | 返费触发规则 | 🔴 待确认 |
| 3 | 推荐人每人是否有推荐数量上限？ | submitReferral 校验 | 🔴 待确认，当前无上限限制 |
| 4 | 身份证号是否需要加密存储（AES/SM4）？ | 数据安全 | 🔴 待确认，当前明文存储，正式上线前需评估 |
| 5 | 打款方式：人工微信转账 还是 接入企业付款API自动打款？ | 打款流程 | 🔴 待确认，当前实现为人工标记已打款 |
| 6 | 招募海报样式单独设计还是复用现有海报模板？ | 前端设计 | 🔴 待确认 |
| 7 | 员工引流来的推荐人，是否计入该员工的业绩数据？ | CRM统计 | 🔴 待确认 |
| 8 | 推荐人注册时是否强制绑定微信手机号（授权获取）？ | 注册页设计 | 🔴 待确认 |
| 9 | ~~员工离职后，其名下绑定的推荐记录如何处理？~~ | ✅ **已确认**：管理员标记离职后自动批量转归管理员 | ✅ 已实现 |
| 10 | ~~员工审核简历有没有时效要求？超时怎么办？~~ | ✅ **已确认**：24小时SLA，超时定时任务自动流转管理员 | ✅ 已实现 |
| 11 | ~~管理员重新分配绑定后，返费提成归原员工还是新员工？~~ | ✅ **已确认**：以离职日为分割线，前归原员工，后归现员工 | ✅ 已实现 |

---

## 12. 关键风险与注意事项

1. **推荐人审批及时性**：管理员需及时处理审批队列，建议设置管理员端每日提醒（如超过48小时未处理的申请自动标红），避免申请人等待过久流失。
2. **24小时SLA定时任务可靠性**：定时触发器存在极少数延迟执行风险（云开发冷启动），建议在员工审核页面也展示剩余审核时间倒计时，提示员工主动及时处理。
3. **返费归属快照的准确性**：`rewardOwnerStaffId` 必须在**合同签署回调时立即快照**，不能事后计算，否则后续员工离职日期更新会导致归属混乱。
4. **去重精确度**：手机号/身份证号可能被人为填错以规避去重，管理员审批推荐人时及员工审核简历时，均应作为二次核实机会。
5. **绑定安全**：`reviewReferral` / `updateReferralStatus` 等写操作必须在云函数后端强校验 `assignedStaffId === callerOpenid`，前端隐藏不足以保证安全。
6. **全链路通知设计**：扫码申请→审批通过/拒绝→简历审核结果→返费到账，共5个关键节点均需触发微信订阅消息；需提前申请对应的订阅消息模板ID，并在关键页面引导用户授权订阅。
7. **员工离职标记权限**：标记离职是高权限操作（会触发批量流转），必须仅限管理员执行，且需要二次确认弹窗，提示「将批量转移X条推荐记录，确认后不可撤销」。
8. **管理员审批留痕**：`referrers.approvalStatus` 变更历史和 `referral_binding_logs` 均需只追加不删除，完整保障审计可追溯性。
9. **CRM 联动时序**：签单/上户状态依赖 CRM 主动回调，需约定重试机制，防止状态漏更新导致返费延误。
10. **隐私合规**：被推荐阿姨的手机号、身份证号仅员工和管理员可见完整信息，推荐人只能看脱敏内容（如「张**」「138****5678」），需在隐私政策中声明收集目的。

---

---

## 13. API 接口文档（推荐返费系统）

> **归属产品**：安得褓贝小程序（及 CRM 内部管理端）
> **接口地址**：`https://crm.andejiazheng.com/api`
> **鉴权方式**：JWT Bearer Token（CRM 登录用户接口需携带；小程序侧 Public 接口通过 openid 做业务级鉴权）
> **Content-Type**：`application/json`
> **全局前缀**：所有路径均以 `/api` 开头

---

### 13.1 推荐人注册（小程序 → 推荐官身份申请）

> 适用角色：`customer`（未审批时）/ 任意登录用户
> 路径前缀：`/api/referral/miniprogram`

#### `POST /api/referral/miniprogram/register-referrer`

**申请注册成为推荐官**（提交后 `approvalStatus = pending_approval`）

请求体：
```json
{
  "openid": "ome1V1_xxxxxx",          // 必填，小程序用户 openid
  "name": "张三",                      // 必填，真实姓名
  "phone": "13800138000",             // 必填，手机号
  "wechatId": "wxid_abc123",          // 可选，微信号（用于接收返费转账）
  "sourceStaffId": "68b941d8xxxx"     // 必填，来源员工 ID（从海报 scene 参数解析）
}
```

响应：
```json
{
  "success": true,
  "data": { /* referrers 文档 */ },
  "message": "申请已提交，等待管理员审核"
}
```

| 场景 | HTTP 状态 | message |
|---|---|---|
| 已是推荐官（已通过） | 400 | `您已是推荐人，无需重复申请` |
| 申请审批中 | 400 | `您的申请正在审批中，请等待管理员审核` |
| 手机号已被他人注册 | 400 | `该手机号已注册为推荐人` |
| 成功提交（含重新申请） | 201 | `申请已提交，等待管理员审核` |

---

#### `GET /api/referral/miniprogram/referrer-status?openid=`

**查询推荐官申请状态**（供等待页轮询或页面初始化时调用）

查询参数：`openid`（必填）

响应：
```json
{
  "success": true,
  "data": {
    "status": "pending_approval",  // not_applied | pending_approval | approved | rejected
    "referrer": { /* referrers 文档，仅 status != not_applied 时存在 */ }
  }
}
```

| `status` 值 | 含义 | 前端处理建议 |
|---|---|---|
| `not_applied` | 未申请过 | 展示注册入口 |
| `pending_approval` | 审批中 | 展示等待页 |
| `approved` | 已通过 | 进入录入/查看页 |
| `rejected` | 已拒绝 | 展示拒绝原因 + 重新申请按钮 |

---

### 13.2 简历去重与录入（推荐官端）

> 适用角色：`推荐官`（`miniprogram_users.role = '推荐官'`）

#### `GET /api/referral/miniprogram/check-duplicate?phone=&idCard=`

**录入前去重查询**（`phone` 和 `idCard` 至少传一个）

查询参数：
- `phone`：手机号（可选，与 idCard 至少一个）
- `idCard`：身份证号（可选）

响应：
```json
{
  "success": true,
  "data": {
    "isDuplicate": false,
    "matchField": null           // null | "phone" | "idCard"
  }
}
```

> 查询范围：`resumes`（简历库） + `referral_resumes`（推荐待审核）两张表
> `isDuplicate=true` 时前端应弹窗拦截提交，提示：`该阿姨信息已存在（匹配：手机号/身份证号），无法重复录入`

---

#### `POST /api/referral/miniprogram/submit-referral`

**录入被推荐阿姨信息**

请求体：
```json
{
  "openid": "ome1V1_xxxxxx",     // 必填，推荐官 openid（后端校验 approvalStatus=approved）
  "name": "李四",                 // 必填，被推荐阿姨姓名
  "phone": "13900139000",        // 与 idCard 至少填一个
  "idCard": "110101199001011234",// 与 phone 至少填一个
  "serviceType": "月嫂",          // 必填，枚举：月嫂/育婴嫂/保姆/护老/小时工
  "experience": "5年月嫂经验",    // 可选，从业经验描述
  "remark": "我的邻居，手艺很好"  // 可选，推荐人备注
}
```

响应：
```json
{
  "success": true,
  "data": { /* referral_resumes 文档 */ },
  "message": "推荐信息提交成功"
}
```

| 场景 | HTTP 状态 | message |
|---|---|---|
| openid 对应用户非推荐官 | 403 | `您没有权限提交推荐，请先申请并通过推荐人审批` |
| phone 和 idCard 均未填 | 400 | `手机号和身份证号至少需要填写一项` |
| 去重命中 | 400 | `该阿姨[手机号/身份证号]已在系统中存在，无法重复录入` |
| 提交成功 | 201 | `推荐信息提交成功` |

---

### 13.3 推荐官的推荐记录查看

#### `GET /api/referral/miniprogram/my-referrals?openid=&page=&pageSize=`

**我的推荐记录列表**（姓名脱敏，手机/身份证不返回）

查询参数：
- `openid`：必填
- `page`：页码，默认 1
- `pageSize`：每页条数，默认 20

响应：
```json
{
  "success": true,
  "data": {
    "list": [
      {
        "_id": "xxx",
        "name": "李*",              // 姓名脱敏
        "serviceType": "月嫂",
        "status": "following_up",   // 整体状态（见状态枚举）
        "reviewStatus": "approved", // 审核状态
        "createdAt": "2026-04-01T08:00:00.000Z",
        "rewardAmount": 500,        // 仅 contracted 及以后状态返回
        "rewardExpectedAt": "2026-05-01T08:00:00.000Z"
      }
    ],
    "total": 5,
    "page": 1,
    "pageSize": 20
  }
}
```

**整体状态（`status`）枚举说明**：

| 值 | 中文 | 说明 |
|---|---|---|
| `pending_review` | 待审核 | 刚提交，等待员工审核（24h内） |
| `rejected` | 审核未通过 | 员工拒绝，含拒绝原因 |
| `following_up` | 跟进中 | 审核通过，员工正在跟进 |
| `contracted` | 已签单 | 合同已签署 |
| `onboarded` | 已上户 | 阿姨已正式上户 |
| `reward_pending` | 返费待审核 | 等待员工确认打款 |
| `reward_paid` | 返费已打款 | 完成，返费已到账 |
| `invalid` | 未录用 | 员工标记无效 |

---

#### `GET /api/referral/miniprogram/referral-detail/:id?openid=`

**推荐记录详情**（推荐官视角，签单前不返回财务字段）

路径参数：`id`（推荐记录 _id）
查询参数：`openid`（必填，用于校验归属）

响应（根据状态阶段性返回字段）：
```json
{
  "success": true,
  "data": {
    "_id": "xxx",
    "name": "李*",
    "serviceType": "月嫂",
    "status": "contracted",
    "reviewStatus": "approved",
    "reviewNote": null,
    "createdAt": "2026-04-01T08:00:00.000Z",
    // 以下字段仅 contracted / onboarded / reward_pending / reward_paid 状态返回
    "contractSignedAt": "2026-04-10T00:00:00.000Z",
    "serviceFee": 16800,
    "rewardAmount": 500,
    "rewardExpectedAt": "2026-05-10T00:00:00.000Z",
    "rewardPaidAt": null
  }
}
```

---

### 13.4 员工端——推荐简历审核与跟进

> 适用角色：`staff`、`admin`
> 路径前缀：`/api/referral/staff`
> 说明：`isAdmin=true` 时管理员可查看全量；`isAdmin=false` 时仅可操作 `assignedStaffId=自己` 的记录（**后端强校验**）

#### `GET /api/referral/staff/assigned-referrals`

**获取分配给我的推荐简历列表**

查询参数：
- `staffId`：必填，当前员工 ID
- `isAdmin`：`"true"` / `"false"`
- `reviewStatus`：可选，`pending_review`（待审核）/ `processed`（已处理，含通过+拒绝）
- `page`：默认 1
- `pageSize`：默认 20

响应：
```json
{
  "success": true,
  "data": {
    "list": [ /* referral_resumes 文档数组，含 reviewDeadlineAt 供倒计时 */ ],
    "total": 10,
    "page": 1,
    "pageSize": 20
  }
}
```

---

#### `POST /api/referral/staff/review-referral`

**审核推荐简历（通过 / 拒绝）**

请求体：
```json
{
  "staffId": "68b941d8xxxx",     // 必填
  "isAdmin": false,
  "id": "referral_resume_id",   // 必填
  "result": "approve",           // 必填：approve | reject
  "note": "拒绝原因"             // result=reject 时必填
}
```

响应：`{ "success": true, "message": "审核完成" }`

**副作用**：
- `approve`：`reviewStatus→approved`，`status→following_up`，推荐官收到通知
- `reject`：`reviewStatus→rejected`，`status→rejected`，推荐官收到通知（含原因）
- **审核通过时同步入库简历库**（`resumes` 集合，`isDraft=true`，`isHidden=true`，`referralAssignedStaffId=assignedStaffId`）

---

#### `POST /api/referral/staff/update-status`

**更新推荐记录跟进状态**

请求体：
```json
{
  "staffId": "68b941d8xxxx",
  "isAdmin": false,
  "id": "referral_resume_id",
  "status": "invalid"            // 允许的转换见下表
}
```

允许的状态流转（非管理员）：

| 当前状态 | 可转换为 |
|---|---|
| `following_up` | `invalid`（标记未录用） |
| `contracted` | `onboarded`（标记上户） |
| `onboarded` | `reward_pending`（发起返费审核） |

---

#### `POST /api/referral/staff/process-reward`

**返费审核 / 标记打款**（`rewardOwnerStaffId` 对应员工或管理员可操作）

请求体：
```json
{
  "staffId": "68b941d8xxxx",
  "isAdmin": false,
  "referralResumeId": "xxx",
  "action": "markPaid",          // approve | reject | markPaid
  "remark": "已转账给微信号 wxid_xxx"  // 可选
}
```

`markPaid` 副作用：写入 `referral_rewards` 打款记录，更新推荐官累计返费金额，推荐官收到「返费已到账」通知。

---

### 13.5 管理员端——推荐人管理

> 适用角色：`admin`
> 路径前缀：`/api/referral/admin`

#### `GET /api/referral/admin/referrers`

**推荐人列表（含统计信息）**

查询参数：
- `approvalStatus`：可选，`pending_approval` / `approved` / `rejected`
- `search`：可选，姓名/手机号模糊搜索
- `page`：默认 1
- `pageSize`：默认 20

响应（每条记录额外包含聚合字段）：
```json
{
  "success": true,
  "data": {
    "list": [
      {
        "_id": "xxx",
        "name": "孙学博",
        "phone": "18604592681",
        "wechatId": "wxid_abc",
        "idCard": "110101...",
        "bankCardNumber": "6222xxxx",
        "bankName": "中国工商银行北京朝阳支行",
        "approvalStatus": "approved",
        "totalReferrals": 3,
        "totalRewardAmount": 1000,
        "onboardedCount": 2,       // 聚合：成功上户量
        "lastLoginAt": "2026-04-15T03:00:00.000Z",  // 来自 miniprogram_users
        "createdAt": "2026-03-01T00:00:00.000Z"
      }
    ],
    "total": 5
  }
}
```

---

#### `POST /api/referral/admin/create-referrer`

**管理员直接创建推荐官**（跳过申请审批流程，直接 `approved`）

请求体：
```json
{
  "adminStaffId": "68b941d8xxxx",  // 必填
  "name": "王五",                   // 必填
  "phone": "13700137000",          // 必填
  "wechatId": "wx_wangwu",         // 可选
  "idCard": "110101...",           // 可选
  "bankCardNumber": "6222xxxx",    // 可选
  "bankName": "招商银行"            // 可选
}
```

副作用：若该手机号已有小程序账号，自动将 `miniprogram_users.role` 设为 `'推荐官'`。

---

#### `POST /api/referral/admin/update-referrer-info`

**更新推荐人收款信息**

请求体：
```json
{
  "referrerId": "xxx",
  "idCard": "110101...",
  "bankCardNumber": "6222xxxx",
  "bankName": "中国建设银行"
}
```

---

#### `GET /api/referral/admin/pending-referrers?page=&pageSize=`

**待审批推荐人列表**（`approvalStatus=pending_approval`）

---

#### `POST /api/referral/admin/approve-referrer`

**通过推荐官注册申请**

请求体：`{ "adminStaffId": "xxx", "referrerId": "xxx" }`

副作用：更新 `miniprogram_users.role = '推荐官'`，通知申请人和来源员工。

---

#### `POST /api/referral/admin/reject-referrer`

**拒绝推荐官注册申请**

请求体：`{ "referrerId": "xxx", "reason": "拒绝原因（必填）" }`

---

#### `GET /api/referral/admin/all-referrals`

**全量推荐记录查询**

查询参数：`assignedStaffId`（可选）、`status`（可选）、`page`、`pageSize`

---

#### `POST /api/referral/admin/reassign-binding`

**重新分配绑定员工（手动干预）**

请求体：
```json
{
  "adminStaffId": "xxx",
  "id": "referral_resume_id",
  "newStaffId": "new_staff_id",
  "reason": "干预原因（必填）"
}
```

副作用：写入 `referral_binding_logs`（`reassignType=manual`），通知原员工和新员工。

---

#### `POST /api/referral/admin/mark-staff-departed`

**标记员工离职，触发批量自动流转**

请求体：
```json
{
  "adminStaffId": "xxx",
  "staffId": "departed_staff_id",
  "leftAt": "2026-04-15"         // 离职日期，格式 YYYY-MM-DD
}
```

响应：`{ "success": true, "data": { "transferredCount": 3 }, "message": "离职处理完成，共流转 3 条记录" }`

副作用：
1. 员工 `isActive=false`，`leftAt=离职日期`
2. 批量将 `pending_review/following_up` 记录的 `assignedStaffId` 转为管理员
3. 写入 `referral_binding_logs`（`reassignType=departure`，带 `staffDepartedAt`）
4. 通知管理员汇总

---

#### `GET /api/referral/admin/binding-logs/:referralResumeId`

**查询某条推荐记录的绑定变更日志**

响应：
```json
{
  "success": true,
  "data": [
    {
      "_id": "xxx",
      "referralResumeId": "yyy",
      "fromStaffId": "staffA_id",
      "toStaffId": "admin_id",
      "reassignType": "departure",    // manual | departure | review_timeout
      "staffDepartedAt": "2026-04-10T00:00:00.000Z",
      "operatedBy": "admin_id",
      "reason": "员工离职（离职日期：2026-04-10），推荐记录自动转入管理员",
      "createdAt": "2026-04-10T08:30:00.000Z"
    }
  ]
}
```

---

#### `POST /api/referral/admin/process-reward`

**管理员全量返费操作**（无 `rewardOwnerStaffId` 限制）

请求体：
```json
{
  "adminStaffId": "xxx",
  "referralResumeId": "yyy",
  "action": "markPaid",     // approve | reject | markPaid
  "remark": "备注（可选）"
}
```

---

### 13.6 CRM 回调接口（CRM 主动推送）

> 调用方：CRM 系统（合同签署/上户时主动 webhook）
> 鉴权：Header `X-Service-Secret: <CRM_SERVICE_SECRET>`

#### `POST /api/referral/crm/contract-signed`

**合同签署回调**

请求体：
```json
{
  "referralResumeId": "xxx",
  "contractId": "contract_id",
  "contractSignedAt": "2026-04-15T10:00:00.000Z",
  "serviceFee": 16800
}
```

处理逻辑：
1. `status → contracted`
2. 快照 `rewardOwnerStaffId`（查员工 `leftAt` 与 `contractSignedAt` 比较确定归属）
3. `rewardAmount` = 按服务类型固定金额计算（待业务确认后调整）
4. `rewardExpectedAt` = `contractSignedAt + 30天`

---

#### `POST /api/referral/crm/onboarded`

**上户回调**

请求体：
```json
{
  "referralResumeId": "xxx",
  "onboardedAt": "2026-04-20T00:00:00.000Z"
}
```

处理逻辑：`status → onboarded`，写入 `onboardedAt`。

---

### 13.7 简历库可见性控制（扩展接口）

> 审核通过的推荐简历自动进入 `resumes` 集合，`isHidden=true`，仅 `referralAssignedStaffId` 对应员工和管理员可见

#### `PATCH /api/resumes/:id/toggle-hidden`

**切换推荐简历隐藏状态**

> 需要 `resume:edit` 权限
> 仅 `referralAssignedStaffId` 对应员工或管理员可操作

响应：
```json
{
  "success": true,
  "data": { "isHidden": false },
  "message": "已取消隐藏，全员可见"
}
```

---

### 13.8 定时任务（系统自动触发，无 HTTP 接口）

| 任务 | 触发频率 | 逻辑 |
|---|---|---|
| 24h 审核超时流转 | 每 30 分钟 | 扫描 `reviewStatus=pending_review` 且 `reviewDeadlineAt < now` 的记录，批量流转给管理员，写审计日志，合并通知 |

---

### 13.9 接口汇总表

| 分组 | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 推荐官注册 | POST | `/api/referral/miniprogram/register-referrer` | 任意 | 提交注册申请 |
| 推荐官注册 | GET | `/api/referral/miniprogram/referrer-status` | 任意 | 查询申请状态 |
| 简历录入 | GET | `/api/referral/miniprogram/check-duplicate` | 推荐官 | 去重查询 |
| 简历录入 | POST | `/api/referral/miniprogram/submit-referral` | 推荐官 | 录入被推荐简历 |
| 推荐记录 | GET | `/api/referral/miniprogram/my-referrals` | 推荐官 | 我的推荐列表 |
| 推荐记录 | GET | `/api/referral/miniprogram/referral-detail/:id` | 推荐官 | 推荐记录详情 |
| 员工审核 | GET | `/api/referral/staff/assigned-referrals` | staff/admin | 我的待审核列表 |
| 员工审核 | POST | `/api/referral/staff/review-referral` | staff/admin | 通过/拒绝简历 |
| 员工跟进 | POST | `/api/referral/staff/update-status` | staff/admin | 更新跟进状态 |
| 员工返费 | POST | `/api/referral/staff/process-reward` | staff/admin | 返费操作 |
| 推荐人管理 | GET | `/api/referral/admin/referrers` | admin | 推荐人列表+统计 |
| 推荐人管理 | POST | `/api/referral/admin/create-referrer` | admin | 直接创建推荐官 |
| 推荐人管理 | POST | `/api/referral/admin/update-referrer-info` | admin | 更新收款信息 |
| 推荐人审批 | GET | `/api/referral/admin/pending-referrers` | admin | 待审批列表 |
| 推荐人审批 | POST | `/api/referral/admin/approve-referrer` | admin | 通过申请 |
| 推荐人审批 | POST | `/api/referral/admin/reject-referrer` | admin | 拒绝申请 |
| 全量管理 | GET | `/api/referral/admin/all-referrals` | admin | 全量推荐记录 |
| 全量管理 | POST | `/api/referral/admin/reassign-binding` | admin | 重新分配员工 |
| 全量管理 | POST | `/api/referral/admin/mark-staff-departed` | admin | 标记离职+批量流转 |
| 全量管理 | GET | `/api/referral/admin/binding-logs/:id` | admin | 绑定变更日志 |
| 全量管理 | POST | `/api/referral/admin/process-reward` | admin | 全量返费操作 |
| CRM 回调 | POST | `/api/referral/crm/contract-signed` | 系统（Secret） | 合同签署回调 |
| CRM 回调 | POST | `/api/referral/crm/onboarded` | 系统（Secret） | 上户回调 |
| 简历库 | PATCH | `/api/resumes/:id/toggle-hidden` | staff/admin | 切换简历可见性 |

---

*文档持续更新中，待确认事项请在对应章节标注 🔴 后反馈。*

年费