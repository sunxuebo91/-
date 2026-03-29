# 主Tab页面

<cite>
**本文档引用文件**  
- [app.json](file://miniprogram/app.json)
- [index.js](file://miniprogram/pages/index/index.js)
- [index.wxml](file://miniprogram/pages/index/index.wxml)
- [home/index.js](file://miniprogram/pages/home/index.js)
- [home/index.wxml](file://miniprogram/pages/home/index.wxml)
- [profile/index.js](file://miniprogram/pages/profile/index.js)
- [profile/index.wxml](file://miniprogram/pages/profile/index.wxml)
- [resumeList/index.js](file://miniprogram/pages/resumeList/index.js)
- [resumeList/index.wxml](file://miniprogram/pages/resumeList/index.wxml)
- [custom-tab-bar/index.js](file://miniprogram/custom-tab-bar/index.js)
- [services/resume.js](file://miniprogram/services/resume.js)
- [services/auth.js](file://miniprogram/services/auth.js)
- [services/userService.js](file://miniprogram/services/userService.js)
- [utils/request.js](file://miniprogram/utils/request.js)
- [cloudfunctions/resumeService/index.js](file://cloudfunctions/resumeService/index.js)
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js)
</cite>

## 更新摘要
**变更内容**   
- 更新首页认证机制：移除了requireLogin()检查，允许访客浏览服务和价格信息
- 更新个人中心页认证逻辑：保留requireLogin()检查，确保敏感功能的安全性
- 更新用户体验分析：强调访客友好性和功能可用性的平衡

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概览](#架构概览)
5. [详细组件分析](#详细组件分析)
6. [依赖分析](#依赖分析)
7. [性能考虑](#性能考虑)
8. [故障排除指南](#故障排除指南)
9. [结论](#结论)

## 简介
本文档详细描述了安得褓贝小程序的主Tab页面，涵盖首页、家政列表和个人中心三个核心导航页面。文档说明了TabBar在`app.json`中的配置方式及其在用户导航中的作用，详细阐述了各页面的布局结构、功能入口、数据展示逻辑、分页加载机制、搜索过滤实现、用户信息管理及交互流程。同时，文档结合UI设计，说明响应式布局与用户体验优化策略，并分析页面与云函数的数据交互模式。

**更新** 本次更新反映了首页认证要求的简化，移除了requireLogin()检查，允许访客浏览服务和价格信息，提升了用户体验。

## 项目结构

```mermaid
graph TD
subgraph "小程序根目录"
app_js[app.js]
app_json[app.json]
app_wxss[app.wxss]
end
subgraph "页面目录"
pages[pages/]
home[home/index]
index[index/index]
profile[profile/index]
resumeList[resumeList/index]
end
subgraph "自定义TabBar"
custom_tab_bar[custom-tab-bar/]
tab_js[index.js]
tab_wxml[index.wxml]
end
subgraph "服务与工具"
services[services/]
resume_service[resume.js]
auth_service[auth.js]
user_service[userService.js]
utils[utils/]
request[request.js]
end
subgraph "云函数"
cloudfunctions[cloudfunctions/]
resumeService[resumeService/index.js]
userService[userService/index.js]
end
app_json --> pages
app_json --> custom_tab_bar
pages --> home
pages --> index
pages --> profile
pages --> resumeList
custom_tab_bar --> tab_js
custom_tab_bar --> tab_wxml
services --> resume_service
services --> auth_service
services --> user_service
utils --> request
cloudfunctions --> resumeService
cloudfunctions --> userService
```

**图示来源**  
- [app.json](file://miniprogram/app.json)
- [custom-tab-bar/index.js](file://miniprogram/custom-tab-bar/index.js)
- [pages/](file://miniprogram/pages/)

**本节来源**  
- [app.json](file://miniprogram/app.json)
- [miniprogram/pages/](file://miniprogram/pages/)

## 核心组件

本文档的核心组件包括：
- **首页（index）**：提供服务入口和导航跳转，现允许访客浏览
- **家政列表页（home）**：简历数据展示、分页加载、搜索过滤
- **个人中心页（profile）**：用户信息展示、登录状态管理、设置跳转
- **自定义TabBar**：主导航栏，支持页面切换
- **简历服务（resumeService）**：云函数，提供简历数据接口
- **用户服务（userService）**：云函数，处理用户认证和信息获取

**本节来源**  
- [app.json](file://miniprogram/app.json)
- [pages/index/index.js](file://miniprogram/pages/index/index.js)
- [pages/home/index.js](file://miniprogram/pages/home/index.js)
- [pages/profile/index.js](file://miniprogram/pages/profile/index.js)
- [cloudfunctions/resumeService/index.js](file://cloudfunctions/resumeService/index.js)
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js)

## 架构概览

```mermaid
graph TD
Client[小程序客户端] --> |HTTP请求| Server[云函数]
Server --> |数据库操作| Database[(云数据库)]
subgraph "客户端"
TabBar[自定义TabBar]
HomePage[首页]
HomeList[家政列表页]
ProfilePage[个人中心页]
end
subgraph "云函数"
ResumeService[resumeService]
UserService[userService]
end
TabBar --> HomePage
TabBar --> HomeList
TabBar --> ProfilePage
HomePage --> HomeList
ProfilePage --> |调用| UserService
HomeList --> |调用| ResumeService
ResumeService --> Database
UserService --> Database
style Client fill:#f9f,stroke:#333
style Server fill:#bbf,stroke:#333
style Database fill:#f96,stroke:#333
```

**图示来源**  
- [app.json](file://miniprogram/app.json)
- [custom-tab-bar/index.js](file://miniprogram/custom-tab-bar/index.js)
- [cloudfunctions/resumeService/index.js](file://cloudfunctions/resumeService/index.js)
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js)

## 详细组件分析

### 首页分析

首页是小程序的入口页面，提供服务分类和导航功能。**更新** 现在允许访客浏览，移除了requireLogin()检查。

```mermaid
flowchart TD
Start([页面加载]) --> LoadData["加载页面数据"]
LoadData --> ShowUI["渲染UI界面"]
ShowUI --> WaitUser["等待用户交互"]
WaitUser --> ClickService["点击服务分类"]
ClickService --> ShowToast["显示'功能开发中'提示"]
WaitUser --> ClickResume["点击专业服务卡片"]
ClickResume --> Navigate["跳转到简历列表页"]
Navigate --> ResumeList["简历列表页"]
```

**图示来源**  
- [pages/index/index.js](file://miniprogram/pages/index/index.js)
- [pages/index/index.wxml](file://miniprogram/pages/index/index.wxml)

**本节来源**  
- [pages/index/index.js](file://miniprogram/pages/index/index.js)
- [pages/index/index.wxml](file://miniprogram/pages/index/index.wxml)

### 家政列表页分析

家政列表页是核心功能页面，负责简历数据的展示、分页加载和搜索过滤。

#### 数据展示与分页机制

```mermaid
classDiagram
class ResumeListPage {
+string keyword
+array resumes
+number page
+number pageSize
+boolean hasMore
+boolean loading
+string selectedLevel
+string selectedType
+loadMore() void
+reload() void
+onReachBottom() void
+onPullDownRefresh() void
}
class ResumeService {
+getResumeList(params) Promise
+getResumeDetail(id) Promise
}
class VideoPreloader {
+preload(videoUrl, resumeId) Promise
+batchPreload(videos) Promise
+getCached(videoUrl) string
}
ResumeListPage --> ResumeService : "调用"
ResumeListPage --> VideoPreloader : "使用"
ResumeListPage --> "云数据库" : "通过云函数访问"
```

**图示来源**  
- [pages/resumeList/index.js](file://miniprogram/pages/resumeList/index.js)
- [services/resume.js](file://miniprogram/services/resume.js)
- [cloudfunctions/resumeService/index.js](file://cloudfunctions/resumeService/index.js)

#### 搜索过滤实现

```mermaid
flowchart TD
Start([用户操作]) --> FilterAction["选择筛选条件"]
FilterAction --> LevelFilter["选择服务等级"]
LevelFilter --> UpdateState["更新筛选状态"]
UpdateState --> ReloadData["重新加载数据"]
FilterAction --> TypeFilter["选择工种类型"]
TypeFilter --> UpdateState
FilterAction --> KeywordSearch["输入搜索关键词"]
KeywordSearch --> UpdateState
ReloadData --> APIRequest["调用API获取数据"]
APIRequest --> FilterData["前端二次过滤"]
FilterData --> UpdateUI["更新UI显示"]
```

**图示来源**  
- [pages/resumeList/index.js](file://miniprogram/pages/resumeList/index.js)
- [pages/resumeList/index.wxml](file://miniprogram/pages/resumeList/index.wxml)

**本节来源**  
- [pages/resumeList/index.js](file://miniprogram/pages/resumeList/index.js)
- [pages/resumeList/index.wxml](file://miniprogram/pages/resumeList/index.wxml)
- [services/resume.js](file://miniprogram/services/resume.js)

### 个人中心页分析

个人中心页负责用户信息展示、登录状态管理和设置跳转。**更新** 保留了requireLogin()检查，确保敏感功能的安全性。

```mermaid
sequenceDiagram
participant Profile as 个人中心页
participant UserService as 用户服务
participant Cloud as 云函数
participant DB as 云数据库
Profile->>Profile : onShow()
Profile->>Profile : requireLogin() 检查
Profile->>Profile : 更新TabBar选中状态
Profile->>UserService : loadMe()
UserService->>Cloud : 调用userService云函数
Cloud->>DB : 查询用户信息
DB-->>Cloud : 返回用户数据
Cloud-->>UserService : 返回结果
UserService-->>Profile : 设置用户信息
Profile->>Profile : 渲染用户界面
Profile->>Profile : 用户点击设置
Profile->>Profile : 跳转到设置页面
```

**图示来源**  
- [pages/profile/index.js](file://miniprogram/pages/profile/index.js)
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js)

**本节来源**  
- [pages/profile/index.js](file://miniprogram/pages/profile/index.js)
- [pages/profile/index.wxml](file://miniprogram/pages/profile/index.wxml)
- [cloudfunctions/userService/index.js](file://cloudfunctions/userService/index.js)

### 自定义TabBar分析

自定义TabBar是小程序的主导航组件，负责页面切换和状态管理。

```mermaid
classDiagram
class CustomTabBar {
+number selected
+array list
+switchTab(e) void
}
class HomePage {
+onShow() void
}
class HomeListPage {
+onShow() void
}
class ProfilePage {
+onShow() void
}
CustomTabBar <|-- HomePage : "通过getTabBar访问"
CustomTabBar <|-- HomeListPage : "通过getTabBar访问"
CustomTabBar <|-- ProfilePage : "通过getTabBar访问"
HomePage --> CustomTabBar : "设置选中状态为1"
HomeListPage --> CustomTabBar : "设置选中状态为0"
ProfilePage --> CustomTabBar : "设置选中状态为2"
```

**图示来源**  
- [app.json](file://miniprogram/app.json)
- [custom-tab-bar/index.js](file://miniprogram/custom-tab-bar/index.js)
- [pages/home/index.js](file://miniprogram/pages/home/index.js)
- [pages/index/index.js](file://miniprogram/pages/index/index.js)
- [pages/profile/index.js](file://miniprogram/pages/profile/index.js)

**本节来源**  
- [app.json](file://miniprogram/app.json)
- [custom-tab-bar/index.js](file://miniprogram/custom-tab-bar/index.js)

## 依赖分析

```mermaid
graph TD
app_json[app.json] --> custom_tab_bar[custom-tab-bar]
app_json --> pages[pages/]
pages --> index[index/index]
pages --> home[home/index]
pages --> profile[profile/index]
pages --> resumeList[resumeList/index]
index --> services[services/]
home --> services
profile --> services
resumeList --> services
services --> resume_service[resume.js]
services --> auth_service[auth.js]
services --> user_service[userService.js]
resume_service --> request[utils/request.js]
auth_service --> request
user_service --> request
resumeList --> video_preloader[视频预加载器]
cloudfunctions --> resumeService[resumeService]
cloudfunctions --> userService[userService]
resumeService --> database[云数据库]
userService --> database
style app_json fill:#ff9,stroke:#333
style services fill:#9ff,stroke:#333
style cloudfunctions fill:#f9f,stroke:#333
style database fill:#f96,stroke:#333
```

**图示来源**  
- [app.json](file://miniprogram/app.json)
- [miniprogram/services/](file://miniprogram/services/)
- [cloudfunctions/](file://cloudfunctions/)

**本节来源**  
- [app.json](file://miniprogram/app.json)
- [miniprogram/services/](file://miniprogram/services/)
- [cloudfunctions/](file://cloudfunctions/)

## 性能考虑

家政列表页实现了多项性能优化策略：
- **视频预加载**：使用`VideoPreloader`类实现视频预加载，提升用户体验
- **分批加载**：分批预加载视频，避免网络拥堵
- **缓存管理**：实现视频缓存，限制最大缓存数量，清理旧缓存
- **智能限流**：控制并发下载数量，避免过载
- **延迟加载**：每批之间添加延迟，避免系统过载

这些优化策略确保了在大量数据和多媒体内容下的流畅用户体验。

**本节来源**  
- [pages/resumeList/index.js](file://miniprogram/pages/resumeList/index.js)

## 故障排除指南

### 常见问题及解决方案

| 问题现象 | 可能原因 | 解决方案 |
|---------|--------|--------|
| TabBar不显示 | 未正确配置`app.json` | 检查`app.json`中`tabBar.custom`是否为`true` |
| 页面无法跳转 | URL路径错误 | 检查`wx.switchTab`和`wx.navigateTo`中的路径是否正确 |
| 数据加载失败 | 网络请求错误 | 检查云函数是否正常运行，网络连接是否正常 |
| 用户信息不显示 | 登录状态问题 | 检查用户是否已登录，Token是否有效 |
| 视频无法播放 | 视频URL问题 | 检查视频URL是否有效，是否需要转换云存储URL |

### 错误处理机制

```mermaid
flowchart TD
Start([API请求]) --> Success{"请求成功?"}
Success --> |是| ReturnData["返回数据"]
Success --> |否| CheckStatus["检查状态码"]
CheckStatus --> Status401["状态码401?"]
Status401 --> |是| Handle401["处理Token过期"]
Handle401 --> ClearToken["清除本地Token"]
ClearToken --> ShowToast["显示登录过期提示"]
ShowToast --> RedirectLogin["跳转到登录页"]
CheckStatus --> StatusOther["其他错误"]
StatusOther --> ShowError["显示错误提示"]
ShowError --> End
ReturnData --> End
```

**本节来源**  
- [utils/request.js](file://miniprogram/utils/request.js)
- [services/auth.js](file://miniprogram/services/auth.js)

## 结论

安得褓贝小程序的主Tab页面设计合理，功能完整，实现了首页、家政列表和个人中心三个核心导航页面。通过自定义TabBar实现了灵活的导航控制，各页面之间通过规范的API调用和数据绑定实现交互。

**更新** 本次更新反映了用户体验优化的重要改进：首页移除了requireLogin()检查，允许访客浏览服务和价格信息，提升了用户友好性。同时，个人中心页仍保留认证检查，确保敏感功能的安全性。这种差异化的设计平衡了用户体验和安全需求。

家政列表页实现了复杂的数据展示、分页加载和搜索过滤功能，个人中心页实现了用户信息管理和状态控制。整体架构清晰，依赖关系明确，性能优化到位，为用户提供了良好的使用体验。