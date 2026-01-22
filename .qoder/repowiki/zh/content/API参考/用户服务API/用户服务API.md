# 用户服务API

<cite>
**本文引用的文件**
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js)
- [cloudfunctions/userService/config.json](file://cloudfunctions/userService/config.json)
- [cloudfunctions/userService/package.json](file://cloudfunctions/userService/package.json)
- [miniprogram/services/auth.js](file://miniprogram/services/auth.js)
- [miniprogram/utils/request.js](file://miniprogram/utils/request.js)
- [API完整文档.md](file://API完整文档.md)
- [PRD.md](file://PRD.md)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考虑](#性能考虑)
8. [故障排查指南](#故障排查指南)
9. [结论](#结论)
10. [附录](#附录)

## 简介
本文件面向安得褓贝小程序端用户服务API，聚焦云函数 userService 提供的五个核心 action：getOrCreateMe、updateMe、loginByPhone、accountRegister、accountLogin。内容涵盖调用方式（云函数调用）、请求参数、响应数据结构、错误码与使用场景，并结合实际代码说明微信上下文自动鉴权（OPENID）机制。特别说明：
- getOrCreateMe 会根据 staff 集合中的手机号白名单自动判定用户角色（staff 或 customer）。
- updateMe 支持更新昵称、头像和手机号等基本信息。
- loginByPhone 通过微信 openapi 获取手机号，随后更新用户信息并重新判定角色。
- 账号密码登录与注册 accountLogin/accountRegister 的实现逻辑与注意事项。

## 项目结构
用户服务API位于云函数 userService 中，前端通过 miniprogram/services/auth.js 与 miniprogram/utils/request.js 封装调用。整体结构如下：

```mermaid
graph TB
subgraph "小程序前端"
A["miniprogram/services/auth.js<br/>封装认证与用户信息调用"]
B["miniprogram/utils/request.js<br/>HTTP请求工具公开/认证"]
end
subgraph "云函数"
C["cloudfunctions/userService/index.js<br/>action分发与业务实现"]
D["cloudfunctions/userService/config.json<br/>openapi权限配置"]
E["cloudfunctions/userService/package.json<br/>依赖：wx-server-sdk"]
end
subgraph "云开发数据库"
F["users 集合<br/>用户档案含role/phone等"]
G["staff 集合<br/>员工白名单openid/phone"]
H["accounts 集合<br/>账号密码登录凭证username/password/openid"]
end
A --> B
B --> C
C --> F
C --> G
C --> H
```

图表来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L1-L289)
- [cloudfunctions/userService/config.json](file://cloudfunctions/userService/config.json#L1-L6)
- [cloudfunctions/userService/package.json](file://cloudfunctions/userService/package.json#L1-L12)
- [miniprogram/services/auth.js](file://miniprogram/services/auth.js#L1-L163)
- [miniprogram/utils/request.js](file://miniprogram/utils/request.js#L1-L125)

章节来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L1-L289)
- [cloudfunctions/userService/config.json](file://cloudfunctions/userService/config.json#L1-L6)
- [cloudfunctions/userService/package.json](file://cloudfunctions/userService/package.json#L1-L12)
- [miniprogram/services/auth.js](file://miniprogram/services/auth.js#L1-L163)
- [miniprogram/utils/request.js](file://miniprogram/utils/request.js#L1-L125)

## 核心组件
- 云函数入口与action分发：根据 event.action 调用对应方法，返回统一结构 { success, data|errMsg }。
- 用户档案集合 users：存储用户 OPENID、角色 role、昵称、头像、手机号等基础信息。
- 员工白名单集合 staff：用于判定 staff 角色（优先手机号，其次 openid）。
- 账号密码集合 accounts：存储 username/password/openid 等登录凭证。

章节来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L258-L289)
- [PRD.md](file://PRD.md#L220-L281)

## 架构总览
用户服务API的调用链路如下：

```mermaid
sequenceDiagram
participant MP as "小程序前端"
participant AUTH as "auth.js"
participant REQ as "request.js"
participant CF as "userService云函数"
participant DB as "云开发数据库"
MP->>AUTH : 调用封装方法如 getCurrentUser
AUTH->>REQ : authenticatedRequest/publicRequest
REQ->>CF : 云函数调用携带action与参数
CF->>DB : 读写users/staff/accounts
DB-->>CF : 返回查询/更新结果
CF-->>REQ : 返回 {success,data|errMsg}
REQ-->>AUTH : 解析响应
AUTH-->>MP : 返回用户信息或错误
```

图表来源
- [miniprogram/services/auth.js](file://miniprogram/services/auth.js#L1-L163)
- [miniprogram/utils/request.js](file://miniprogram/utils/request.js#L1-L125)
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L258-L289)

## 详细组件分析

### getOrCreateMe
- 功能：获取当前用户档案；若不存在则创建，并根据 staff 白名单自动判定角色（staff 或 customer）。
- 调用方式：云函数调用，action 为 "getOrCreateMe"。
- 请求参数：无显式参数（使用微信上下文 OPENID）。
- 响应数据结构：{ success: true, data: User }，其中 User 包含 OPENID、角色 role、昵称、头像、手机号、创建/更新时间等。
- 使用场景：小程序启动时初始化用户信息、刷新用户资料。
- 关键逻辑要点：
  - 若 users 中已有记录，会重新判定角色并同步更新。
  - 首次创建时，role 由 isStaff(openid, phone=null) 决定。
  - 角色判定优先使用手机号白名单，其次使用 openid。

```mermaid
flowchart TD
Start(["开始"]) --> QueryUsers["查询users集合<br/>按OPENID"]
QueryUsers --> Exists{"是否存在记录？"}
Exists -- 是 --> ReEvalRole["重新判定角色<br/>isStaff(OPENID, phone)"]
ReEvalRole --> RoleChanged{"角色是否变化？"}
RoleChanged -- 是 --> UpdateRole["更新users记录role字段"]
RoleChanged -- 否 --> ReturnUser["返回用户记录"]
Exists -- 否 --> CreateDoc["构造初始文档role=staff/customer"]
CreateDoc --> InsertUser["插入users记录"]
InsertUser --> QueryAgain["再次查询users记录"]
QueryAgain --> ReturnNew["返回新用户记录"]
```

图表来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L49-L84)

章节来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L49-L84)
- [PRD.md](file://PRD.md#L262-L281)

### updateMe
- 功能：更新用户昵称、头像、手机号等基本信息。
- 调用方式：云函数调用，action 为 "updateMe"，参数为 { data: { nickname?, avatarUrl?, phone? } }。
- 请求参数：data 对象中可选字段 nickname、avatarUrl、phone。
- 响应数据结构：{ success: true, data: User }，返回更新后的用户对象。
- 使用场景：用户在个人中心修改昵称、头像或绑定手机号。
- 关键逻辑要点：
  - 仅对传入的有效字符串字段进行更新。
  - 更新后会再次调用 getOrCreateMe，确保角色与最新信息同步。

```mermaid
flowchart TD
Start(["开始"]) --> BuildSafe["构建安全更新对象<br/>包含updatedAt"]
BuildSafe --> ValidateFields{"data中存在哪些字段？"}
ValidateFields --> |nickname| AddNick["加入nickname"]
ValidateFields --> |avatarUrl| AddAvatar["加入avatarUrl"]
ValidateFields --> |phone| AddPhone["加入phone"]
AddNick --> UpdateUsers["更新users集合"]
AddAvatar --> UpdateUsers
AddPhone --> UpdateUsers
UpdateUsers --> Refresh["调用getOrCreateMe刷新角色/信息"]
Refresh --> ReturnUser["返回用户对象"]
```

图表来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L86-L103)

章节来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L86-L103)

### loginByPhone
- 功能：通过微信 openapi 获取手机号，绑定到用户档案并更新昵称/头像（如有），随后重新判定角色。
- 调用方式：云函数调用，action 为 "loginByPhone"，参数为 { code, nickname?, avatarUrl? }。
- 请求参数：
  - code：微信登录临时code，用于换取手机号。
  - nickname/ avatarUrl：可选，首次授权时可同时保存昵称与头像。
- 响应数据结构：{ success: true, data: User }，返回更新后的用户对象。
- 使用场景：用户授权手机号登录，完善用户档案。
- 关键逻辑要点：
  - 调用微信 openapi.phonenumber.getPhoneNumber(code) 获取手机号。
  - 若获取失败，抛出异常。
  - 首次授权可能尚未创建 users 记录，会先确保用户存在。
  - 更新用户 phone/nickname/avatarUrl，并刷新角色。

```mermaid
sequenceDiagram
participant MP as "小程序前端"
participant CF as "userService.loginByPhone"
participant WX as "微信openapi"
participant DB as "云开发数据库"
MP->>CF : 调用action="loginByPhone"<br/>携带code,nickname,avatarUrl
CF->>WX : phonenumber.getPhoneNumber({code})
WX-->>CF : 返回phoneInfo.phoneNumber
CF->>DB : getOrCreateMe(确保用户存在)
CF->>DB : 更新users记录phone/nickname/avatarUrl
CF->>DB : getOrCreateMe(重新判定角色)
DB-->>CF : 返回用户对象
CF-->>MP : {success : true, data : user}
```

图表来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L105-L157)
- [cloudfunctions/userService/config.json](file://cloudfunctions/userService/config.json#L1-L6)

章节来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L105-L157)
- [cloudfunctions/userService/config.json](file://cloudfunctions/userService/config.json#L1-L6)

### accountRegister
- 功能：账号密码注册，校验用户名唯一性后写入 accounts 集合。
- 调用方式：云函数调用，action 为 "accountRegister"，参数为 { username, password, nickname }。
- 请求参数：username、password、nickname。
- 响应数据结构：{ success: true } 或 { success: false, errMsg }。
- 使用场景：用户使用账号密码注册。
- 关键逻辑要点：
  - 校验 username 是否已存在。
  - 直接写入 accounts，包含 username/password/openid/nickname/createdAt。
  - 注释提示：生产环境应使用密码加密（当前代码未加密）。

```mermaid
flowchart TD
Start(["开始"]) --> CheckExist["查询accounts是否存在相同username"]
CheckExist --> Exists{"已存在？"}
Exists -- 是 --> ReturnDup["返回{success:false, errMsg:'账号已存在'}"]
Exists -- 否 --> InsertAccount["插入accounts记录含openid"]
InsertAccount --> ReturnOK["返回{success:true}"]
```

图表来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L163-L196)

章节来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L163-L196)

### accountLogin
- 功能：账号密码登录，校验用户名与密码，绑定 openid，更新用户信息并重新判定角色。
- 调用方式：云函数调用，action 为 "accountLogin"，参数为 { username, password }。
- 请求参数：username、password。
- 响应数据结构：{ success: true, data: User } 或 { success: false, errMsg }。
- 使用场景：用户使用账号密码登录。
- 关键逻辑要点：
  - 查询 accounts，校验用户名存在且密码匹配。
  - 确保 users 记录存在，更新 nickname/accountUsername 等字段。
  - 更新 accounts 的 openid 与 lastLoginAt，支持多设备登录。
  - 重新获取用户信息，确保角色与最新信息同步。

```mermaid
sequenceDiagram
participant MP as "小程序前端"
participant CF as "userService.accountLogin"
participant DB as "云开发数据库"
MP->>CF : 调用action="accountLogin"<br/>携带username,password
CF->>DB : 查询accounts(username)
DB-->>CF : 返回账户记录或空
CF->>CF : 校验密码
CF->>DB : getOrCreateMe(确保users存在)
CF->>DB : 更新usersnickname/accountUsername
CF->>DB : 更新accountsopenid,lastLoginAt
CF->>DB : getOrCreateMe(重新判定角色)
DB-->>CF : 返回用户对象
CF-->>MP : {success : true, data : user}
```

图表来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L198-L256)

章节来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L198-L256)

## 依赖关系分析
- 云函数依赖：
  - wx-server-sdk：初始化云开发环境、获取微信上下文 OPENID、调用微信 openapi。
  - 数据库：users/staff/accounts 三个集合。
- 前端依赖：
  - request.js：封装公开请求与认证请求，自动注入 Authorization 头与 Token。
  - auth.js：封装登录、登出、Token 校验、用户信息获取等。

```mermaid
graph LR
CF["userService/index.js"] --> SDK["wx-server-sdk"]
CF --> USERS["users集合"]
CF --> STAFF["staff集合"]
CF --> ACCOUNTS["accounts集合"]
AUTH["auth.js"] --> REQ["request.js"]
REQ --> CF
```

图表来源
- [cloudfunctions/userService/package.json](file://cloudfunctions/userService/package.json#L1-L12)
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L1-L289)
- [miniprogram/services/auth.js](file://miniprogram/services/auth.js#L1-L163)
- [miniprogram/utils/request.js](file://miniprogram/utils/request.js#L1-L125)

章节来源
- [cloudfunctions/userService/package.json](file://cloudfunctions/userService/package.json#L1-L12)
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L1-L289)
- [miniprogram/services/auth.js](file://miniprogram/services/auth.js#L1-L163)
- [miniprogram/utils/request.js](file://miniprogram/utils/request.js#L1-L125)

## 性能考虑
- 集合初始化：首次运行自动创建 users/staff/accounts 集合，避免新环境直接报错。
- 查询与更新：getOrCreateMe/updateMe 使用按 OPENID 的精确查询，复杂度 O(1)；loginByPhone/accountLogin 会触发多次数据库读写，建议在前端做好节流与重试策略。
- 角色判定：isStaff 优先使用手机号白名单，减少 openid 查询成本。
- 建议：
  - 对频繁调用的接口（如 getOrCreateMe）可在前端做缓存策略。
  - 账号密码登录建议在云函数侧增加密码加密与更严格的校验。

[本节为通用建议，不直接分析具体文件]

## 故障排查指南
- 常见错误与定位：
  - loginByPhone 获取手机号失败：检查微信 code 是否有效、是否配置 phonenumber.openapi 权限。
  - accountRegister 返回“账号已存在”：确认 username 唯一性。
  - accountLogin 返回“账号不存在/密码错误”：核对用户名与密码。
  - 角色未更新：确认 staff 集合中是否存在对应 openid 或 phone。
- 前端验证：
  - 使用 auth.js 的 validateToken 方法检测 Token 有效性。
  - request.js 在 401 时会自动清理本地 Token 并跳转登录页。

章节来源
- [cloudfunctions/userService/config.json](file://cloudfunctions/userService/config.json#L1-L6)
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L105-L157)
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L163-L256)
- [miniprogram/services/auth.js](file://miniprogram/services/auth.js#L1-L163)
- [miniprogram/utils/request.js](file://miniprogram/utils/request.js#L1-L125)

## 结论
用户服务API通过云函数 userService 提供了完善的用户生命周期管理能力：从用户档案创建与更新，到手机号授权登录，再到账号密码登录与注册。系统采用微信上下文自动鉴权（OPENID），无需额外认证；角色判定基于 staff 白名单，支持手机号优先策略。建议在生产环境中对账号密码登录增加密码加密与更严格的安全校验，并在前端做好 Token 管理与错误处理。

[本节为总结性内容，不直接分析具体文件]

## 附录

### 前端服务层封装示例（miniprogram/services/auth.js）
- 登录：login(username, password) -> publicRequest('/auth/login')
- 获取当前用户：getCurrentUser() -> authenticatedRequest('/auth/me')
- Token 校验：validateToken() -> 调用 getCurrentUser 并解析响应
- 保存/读取本地认证数据：saveAuthData()/getLocalUserInfo()/getLocalToken()
- 登出：logout() -> 清除本地存储

章节来源
- [miniprogram/services/auth.js](file://miniprogram/services/auth.js#L1-L163)
- [miniprogram/utils/request.js](file://miniprogram/utils/request.js#L1-L125)

### 请求与响应示例（基于实际代码行为）
- getOrCreateMe 成功响应：{ success: true, data: User }
  - User 示例字段：_openid、role、nickname、avatarUrl、phone、createdAt、updatedAt
- updateMe 成功响应：{ success: true, data: User }
- loginByPhone 成功响应：{ success: true, data: User }
- accountRegister 成功响应：{ success: true } 或 { success: false, errMsg: "账号已存在" }
- accountLogin 成功响应：{ success: true, data: User } 或 { success: false, errMsg: "账号不存在/密码错误" }

章节来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L49-L256)

### 微信上下文与鉴权说明
- 云函数通过 cloud.getWXContext() 获取 OPENID，所有用户相关操作均基于 OPENID 进行读写。
- 前端通过 request.js 的 authenticatedRequest 自动注入 Authorization 头与 Token，用于其他模块的认证接口。

章节来源
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js#L258-L289)
- [miniprogram/utils/request.js](file://miniprogram/utils/request.js#L1-L125)