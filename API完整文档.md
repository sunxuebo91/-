# 安得家政CRM系统 - API完整文档

> **文档版本**: v1.3  
> **最后更新**: 2026-01-05  
> **维护团队**: 安得家政技术团队

---

## 📋 目录

- [1. 概述](#1-概述)
- [2. 通用规范](#2-通用规范)
- [3. 认证授权](#3-认证授权)
- [4. 简历管理](#4-简历管理)
- [5. 客户管理](#5-客户管理)
- [6. 文件上传](#6-文件上传)
- [7. 视频面试](#7-视频面试)
- [8. 百度服务](#8-百度服务)
- [9. 数据字典](#9-数据字典)
- [10. 错误码说明](#10-错误码说明)
- [11. 最佳实践](#11-最佳实践)
- [12. 代码示例](#12-代码示例)

---

## 1. 概述

### 1.1 基础信息

- **生产环境**: `https://crm.andejiazheng.com/api`
- **开发环境**: `http://localhost:3000/api`
- **认证方式**: Bearer Token
- **请求头**: `Authorization: Bearer {token}`

### 1.2 接口统计

| 模块 | 接口数量 | 说明 |
|------|---------|------|
| 认证授权 | 4个 | 登录、获取用户信息、上传头像、登出 |
| 简历管理 | 13个 | CRUD、重复检查、公开/私有、小程序专用 |
| 客户管理 | 5个 | CRUD操作 |
| 文件上传 | 5个 | 上传、删除、小程序专用 |
| 视频面试 | 8个 | 房间管理、Token获取 |
| 百度服务 | 2个 | OCR、地图 |
| **总计** | **37个** | - |

---

## 2. 通用规范

### 2.1 响应格式

所有API响应遵循统一的格式：

```json
{
  "success": true|false,
  "data": {},
  "message": "操作成功/失败的消息",
  "error": {
    "code": "错误代码",
    "details": {}
  },
  "timestamp": 1626342025123
}
```

### 2.2 状态码说明

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 409 | 资源冲突 |
| 413 | 请求体过大 |
| 500 | 服务器内部错误 |

### 2.3 请求头

```http
Content-Type: application/json
Authorization: Bearer {token}
Idempotency-Key: {unique-key}  # 可选，防重复提交
api-version: {version}          # 可选，API版本
x-request-id: {request-id}      # 可选，请求ID
```

---

## 3. 认证授权

### 3.1 登录

#### CRM端登录

**接口**: `POST /api/auth/login`

**请求体**:
```json
{
  "username": "用户名",
  "password": "密码"
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "access_token": "JWT令牌",
    "user": {
      "id": "用户ID",
      "username": "用户名",
      "name": "真实姓名",
      "phone": "手机号码",
      "email": "邮箱地址",
      "avatar": "头像URL地址",
      "role": "用户角色",
      "department": "所属部门",
      "permissions": ["权限列表"]
    }
  },
  "timestamp": 1626342025123
}
```

#### 小程序登录

**接口**: `POST /api/auth/miniprogram/login`

**请求体**:
```json
{
  "code": "微信登录code"
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user_id",
      "openid": "openid"
    }
  }
}
```

### 3.2 获取当前用户信息

**接口**: `GET /api/auth/me`

**请求头**: `Authorization: Bearer [token]`

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "用户ID",
    "username": "登录用户名",
    "name": "真实姓名",
    "phone": "手机号码",
    "email": "邮箱地址",
    "avatar": "头像URL地址",
    "role": "用户角色",
    "department": "所属部门",
    "permissions": ["权限列表"]
  }
}
```

### 3.3 上传用户头像

**接口**: `POST /api/auth/avatar`

**请求头**: `Authorization: Bearer [token]`

**请求体**: `multipart/form-data`
- `avatar`: 头像文件（支持jpg、jpeg、png格式，最大5MB）

**成功响应**:
```json
{
  "success": true,
  "data": {
    "avatar": "头像URL地址"
  },
  "message": "头像上传成功"
}
```

### 3.4 登出

**接口**: `POST /api/auth/logout`

**请求头**: `Authorization: Bearer [token]`

**成功响应**:
```json
{
  "success": true,
  "message": "登出成功"
}
```

---

## 4. 简历管理

### 4.1 CRM端简历接口

#### 4.1.1 获取所有简历

**接口**: `GET /api/resumes`

**请求头**: `Authorization: Bearer [token]`

**查询参数**:
- `page`: 页码（默认1）
- `pageSize`: 每页数量（默认10）
- `keyword`: 搜索关键词
- `jobType`: 工种筛选
- `status`: 状态筛选

**成功响应**:
```json
{
  "success": true,
  "data": {
    "total": 100,
    "page": 1,
    "pageSize": 10,
    "list": [
      {
        "id": "简历ID",
        "name": "姓名",
        "phone": "手机号",
        "age": 30,
        "jobType": "yuexin",
        "education": "high"
      }
    ]
  }
}
```

#### 4.1.2 获取单个简历

**接口**: `GET /api/resumes/:id`

**请求头**: `Authorization: Bearer [token]`

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "简历ID",
    "name": "姓名",
    "phone": "手机号",
    "age": 30,
    "gender": "female",
    "jobType": "yuexin",
    "education": "high",
    "skills": ["chanhou", "yuying"],
    "photoUrls": ["https://..."],
    "certificateUrls": ["https://..."]
  }
}
```

#### 4.1.3 创建简历

**接口**: `POST /api/resumes`

**请求头**: `Authorization: Bearer [token]`

**请求体**: `multipart/form-data`

**文本字段**:
- `name`: 姓名（必填）
- `phone`: 手机号（必填）
- `age`: 年龄（必填）
- `gender`: 性别（必填）
- `jobType`: 工种（必填）
- `education`: 学历（必填）
- 其他可选字段...

**文件字段**:
- `idCardFront`: 身份证正面
- `idCardBack`: 身份证背面
- `photoFiles`: 个人照片（多个）
- `certificateFiles`: 技能证书（多个）
- `medicalReportFiles`: 体检报告（多个）
- `selfIntroductionVideo`: 自我介绍视频
- `confinementMealPhotos`: 月子餐照片（多个）
- `cookingPhotos`: 烹饪照片（多个）
- `complementaryFoodPhotos`: 辅食添加照片（多个）
- `positiveReviewPhotos`: 好评展示照片（多个）

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "新创建的简历ID",
    "name": "姓名",
    "phone": "手机号"
  },
  "message": "创建简历成功"
}
```

#### 4.1.4 更新简历

**接口**: `PUT /api/resumes/:id`

**请求头**: `Authorization: Bearer [token]`

**请求体**: `multipart/form-data`（同创建简历）

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "更新的简历ID",
    "name": "姓名",
    "phone": "手机号"
  },
  "message": "更新简历成功"
}
```

#### 4.1.5 删除简历

**接口**: `DELETE /api/resumes/:id`

**请求头**: `Authorization: Bearer [token]`

**成功响应**:
```json
{
  "success": true,
  "message": "简历删除成功"
}
```

#### 4.1.6 检查简历是否重复

**接口**: `GET /api/resumes/check-duplicate`

**请求头**: `Authorization: Bearer [token]`

**查询参数**:
- `phone`: 手机号（必填）
- `idNumber`: 身份证号（可选）

**成功响应**:
```json
{
  "success": true,
  "data": {
    "duplicate": true,
    "existingResume": {
      "id": "已存在的简历ID",
      "name": "姓名",
      "phone": "手机号"
    }
  }
}
```

### 4.2 小程序简历接口

#### 4.2.1 创建简历（小程序）

**接口**: `POST /api/resumes/miniprogram/create`

**功能特性**:
- ✅ 支持幂等性操作（防重复提交）
- ✅ 自动数据清理和格式化
- ✅ 手机号唯一性验证
- ✅ 详细的错误信息返回

**请求头**:
- `Authorization: Bearer [token]` (必需)
- `Idempotency-Key: [唯一键]` (可选，防重复提交)

**必填字段**:
- `name` (string): 姓名，2-20字符
- `phone` (string): 手机号码，11位数字
- `gender` (string): 性别，"female" 或 "male"
- `age` (number): 年龄，18-65岁
- `jobType` (string): 工种
- `education` (string): 学历

**请求体**: `application/json`
```json
{
  "name": "张三",
  "phone": "13800138000",
  "gender": "female",
  "age": 35,
  "jobType": "yuexin",
  "education": "high",
  "maternityNurseLevel": "gold",
  "experienceYears": 3,
  "expectedSalary": 8000,
  "skills": ["chanhou", "yuying"],
  "serviceArea": ["北京市朝阳区"],
  "selfIntroduction": "自我介绍",
  "workExperiences": [
    {
      "startDate": "2020-01-01",
      "endDate": "2023-12-31",
      "description": "工作描述"
    }
  ]
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "66e2f4af8b1234567890abcd",
    "createdAt": "2025-09-12T10:19:27.671Z",
    "action": "CREATED"
  },
  "message": "创建简历成功"
}
```

**错误响应**:

重复手机号 (409):
```json
{
  "success": false,
  "code": "DUPLICATE",
  "data": {
    "existingId": "66e2f4af8b1234567890abcd"
  },
  "message": "该手机号已被使用"
}
```

验证错误 (400):
```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "data": {
    "errors": ["姓名不能为空", "手机号码格式不正确"]
  },
  "message": "数据验证失败"
}
```

#### 4.2.2 获取简历详情（小程序）

**接口**: `GET /api/resumes/miniprogram/:id`

**请求头**: `Authorization: Bearer [token]`

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "简历ID",
    "name": "姓名",
    "phone": "手机号",
    "age": 35,
    "gender": "female",
    "jobType": "yuexin",
    "education": "high",
    "skills": ["chanhou", "yuying"],
    "photoUrls": ["https://..."],
    "certificateUrls": ["https://..."],
    "createdAt": "2025-09-12T10:19:27.671Z"
  },
  "message": "获取简历成功"
}
```

#### 4.2.3 更新简历（小程序）

**接口**: `PATCH /api/resumes/miniprogram/:id`

**请求头**: `Authorization: Bearer [token]`

**请求体**: `application/json`
```json
{
  "expectedSalary": 9000,
  "selfIntroduction": "更新后的自我介绍",
  "skills": ["muying", "cuiru", "yuezican"]
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "简历ID",
    "expectedSalary": 9000,
    "updatedAt": "2025-09-12T10:19:39.842Z"
  },
  "message": "更新简历成功"
}
```

#### 4.2.4 上传文件（小程序）

**接口**: `POST /api/resumes/miniprogram/:id/upload-file`

**请求头**: `Authorization: Bearer [token]`

**请求体**: `multipart/form-data`
- `file`: 文件
- `type`: 文件类型

**文件类型**:
- `idCardFront`: 身份证正面
- `idCardBack`: 身份证背面
- `personalPhoto`: 个人照片
- `certificate`: 技能证书
- `medicalReport`: 体检报告
- `selfIntroductionVideo`: 自我介绍视频
- `confinementMealPhoto`: 月子餐照片
- `cookingPhoto`: 烹饪照片
- `complementaryFoodPhoto`: 辅食添加照片
- `positiveReviewPhoto`: 好评展示照片

**成功响应**:
```json
{
  "success": true,
  "data": {
    "fileUrl": "https://example.com/file.jpg",
    "fileType": "personalPhoto",
    "fileName": "photo.jpg",
    "fileSize": 1024,
    "resumeId": "简历ID"
  },
  "message": "文件上传成功"
}
```

#### 4.2.5 删除文件（小程序）

**接口**: `DELETE /api/resumes/miniprogram/:id/delete-file`

**请求头**: `Authorization: Bearer [token]`

**请求体**: `application/json`
```json
{
  "fileUrl": "https://example.com/file.jpg",
  "fileType": "personalPhoto"
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "resumeId": "简历ID",
    "deletedFileUrl": "https://example.com/file.jpg",
    "fileType": "personalPhoto"
  },
  "message": "文件删除成功"
}
```

---

## 5. 视频面试管理

### 5.1 创建视频面试

**接口**: `POST /api/video-interviews`

**请求头**: `Authorization: Bearer [token]`

**请求体**: `application/json`
```json
{
  "resumeId": "简历ID",
  "scheduledTime": "2025-09-15T14:00:00.000Z",
  "interviewerName": "面试官姓名",
  "notes": "面试备注"
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "面试ID",
    "resumeId": "简历ID",
    "status": "scheduled",
    "scheduledTime": "2025-09-15T14:00:00.000Z",
    "roomId": "room_abc123",
    "createdAt": "2025-09-12T10:19:27.671Z"
  },
  "message": "创建视频面试成功"
}
```

### 5.2 获取视频面试列表

**接口**: `GET /api/video-interviews`

**请求头**: `Authorization: Bearer [token]`

**查询参数**:
- `page`: 页码（默认1）
- `pageSize`: 每页数量（默认10）
- `status`: 状态筛选（scheduled/in_progress/completed/cancelled）
- `resumeId`: 简历ID筛选

**成功响应**:
```json
{
  "success": true,
  "data": {
    "total": 50,
    "page": 1,
    "pageSize": 10,
    "list": [
      {
        "id": "面试ID",
        "resumeId": "简历ID",
        "resumeName": "应聘者姓名",
        "status": "scheduled",
        "scheduledTime": "2025-09-15T14:00:00.000Z",
        "roomId": "room_abc123",
        "createdAt": "2025-09-12T10:19:27.671Z"
      }
    ]
  }
}
```

### 5.3 获取单个视频面试

**接口**: `GET /api/video-interviews/:id`

**请求头**: `Authorization: Bearer [token]`

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "面试ID",
    "resumeId": "简历ID",
    "resumeName": "应聘者姓名",
    "resumePhone": "13800138000",
    "status": "scheduled",
    "scheduledTime": "2025-09-15T14:00:00.000Z",
    "roomId": "room_abc123",
    "interviewerName": "面试官姓名",
    "notes": "面试备注",
    "recordingUrl": "https://...",
    "duration": 1800,
    "createdAt": "2025-09-12T10:19:27.671Z"
  }
}
```

### 5.4 更新视频面试状态

**接口**: `PATCH /api/video-interviews/:id/status`

**请求头**: `Authorization: Bearer [token]`

**请求体**: `application/json`
```json
{
  "status": "completed",
  "notes": "面试完成备注",
  "recordingUrl": "https://...",
  "duration": 1800
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "面试ID",
    "status": "completed",
    "updatedAt": "2025-09-12T10:19:39.842Z"
  },
  "message": "更新面试状态成功"
}
```

### 5.5 取消视频面试

**接口**: `DELETE /api/video-interviews/:id`

**请求头**: `Authorization: Bearer [token]`

**成功响应**:
```json
{
  "success": true,
  "message": "取消面试成功"
}
```

### 5.6 获取面试房间Token

**接口**: `GET /api/video-interviews/:id/token`

**请求头**: `Authorization: Bearer [token]`

**成功响应**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "roomId": "room_abc123",
    "userId": "user_123",
    "expiresAt": "2025-09-15T15:00:00.000Z"
  }
}
```

---

## 6. 订单管理

### 6.1 创建订单

**接口**: `POST /api/orders`

**请求头**: `Authorization: Bearer [token]`

**请求体**: `application/json`
```json
{
  "resumeId": "简历ID",
  "customerName": "客户姓名",
  "customerPhone": "13800138000",
  "serviceType": "yuexin",
  "serviceStartDate": "2025-10-01",
  "serviceEndDate": "2025-10-26",
  "serviceDays": 26,
  "totalAmount": 20800,
  "depositAmount": 5000,
  "serviceAddress": "北京市朝阳区xxx小区",
  "notes": "订单备注"
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "订单ID",
    "orderNumber": "ORD20250912001",
    "status": "pending",
    "createdAt": "2025-09-12T10:19:27.671Z"
  },
  "message": "创建订单成功"
}
```

### 6.2 获取订单列表

**接口**: `GET /api/orders`

**请求头**: `Authorization: Bearer [token]`

**查询参数**:
- `page`: 页码（默认1）
- `pageSize`: 每页数量（默认10）
- `status`: 状态筛选
- `serviceType`: 服务类型筛选
- `keyword`: 搜索关键词

**成功响应**:
```json
{
  "success": true,
  "data": {
    "total": 100,
    "page": 1,
    "pageSize": 10,
    "list": [
      {
        "id": "订单ID",
        "orderNumber": "ORD20250912001",
        "customerName": "客户姓名",
        "serviceType": "yuexin",
        "status": "pending",
        "totalAmount": 20800,
        "createdAt": "2025-09-12T10:19:27.671Z"
      }
    ]
  }
}
```

### 6.3 获取单个订单

**接口**: `GET /api/orders/:id`

**请求头**: `Authorization: Bearer [token]`

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "订单ID",
    "orderNumber": "ORD20250912001",
    "resumeId": "简历ID",
    "resumeName": "阿姨姓名",
    "customerName": "客户姓名",
    "customerPhone": "13800138000",
    "serviceType": "yuexin",
    "serviceStartDate": "2025-10-01",
    "serviceEndDate": "2025-10-26",
    "serviceDays": 26,
    "totalAmount": 20800,
    "depositAmount": 5000,
    "paidAmount": 5000,
    "remainingAmount": 15800,
    "serviceAddress": "北京市朝阳区xxx小区",
    "status": "pending",
    "notes": "订单备注",
    "createdAt": "2025-09-12T10:19:27.671Z"
  }
}
```

### 6.4 更新订单

**接口**: `PUT /api/orders/:id`

**请求头**: `Authorization: Bearer [token]`

**请求体**: `application/json`
```json
{
  "customerName": "更新后的客户姓名",
  "serviceAddress": "更新后的服务地址",
  "notes": "更新后的备注"
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "订单ID",
    "updatedAt": "2025-09-12T10:19:39.842Z"
  },
  "message": "更新订单成功"
}
```

### 6.5 更新订单状态

**接口**: `PATCH /api/orders/:id/status`

**请求头**: `Authorization: Bearer [token]`

**请求体**: `application/json`
```json
{
  "status": "confirmed",
  "notes": "状态更新备注"
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "订单ID",
    "status": "confirmed",
    "updatedAt": "2025-09-12T10:19:39.842Z"
  },
  "message": "更新订单状态成功"
}
```

### 6.6 删除订单

**接口**: `DELETE /api/orders/:id`

**请求头**: `Authorization: Bearer [token]`

**成功响应**:
```json
{
  "success": true,
  "message": "订单删除成功"
}
```

---

## 7. 文件上传

### 7.1 通用文件上传

**接口**: `POST /api/upload`

**请求头**: `Authorization: Bearer [token]`

**请求体**: `multipart/form-data`
- `file`: 文件（必填）
- `type`: 文件类型（可选）

**文件限制**:
- 图片: jpg, jpeg, png, gif, webp (最大10MB)
- 视频: mp4, mov, avi (最大100MB)
- 文档: pdf, doc, docx (最大20MB)

**成功响应**:
```json
{
  "success": true,
  "data": {
    "url": "https://example.com/uploads/file.jpg",
    "fileName": "file.jpg",
    "fileSize": 1024,
    "mimeType": "image/jpeg",
    "uploadedAt": "2025-09-12T10:19:27.671Z"
  },
  "message": "文件上传成功"
}
```

### 7.2 批量文件上传

**接口**: `POST /api/upload/batch`

**请求头**: `Authorization: Bearer [token]`

**请求体**: `multipart/form-data`
- `files`: 多个文件

**成功响应**:
```json
{
  "success": true,
  "data": {
    "files": [
      {
        "url": "https://example.com/uploads/file1.jpg",
        "fileName": "file1.jpg",
        "fileSize": 1024
      },
      {
        "url": "https://example.com/uploads/file2.jpg",
        "fileName": "file2.jpg",
        "fileSize": 2048
      }
    ],
    "totalCount": 2,
    "successCount": 2,
    "failedCount": 0
  },
  "message": "批量上传成功"
}
```

### 7.3 删除文件

**接口**: `DELETE /api/upload`

**请求头**: `Authorization: Bearer [token]`

**请求体**: `application/json`
```json
{
  "url": "https://example.com/uploads/file.jpg"
}
```

**成功响应**:
```json
{
  "success": true,
  "message": "文件删除成功"
}
```

---

## 8. 数据字典

### 8.1 获取所有数据字典

**接口**: `GET /api/dictionaries`

**请求头**: `Authorization: Bearer [token]`

**成功响应**:
```json
{
  "success": true,
  "data": {
    "jobTypes": [
      { "value": "yuexin", "label": "月嫂", "description": "产后护理" }
    ],
    "educationLevels": [
      { "value": "primary", "label": "小学", "order": 1 }
    ],
    "skills": [
      { "value": "chanhou", "label": "产后护理", "category": "yuexin" }
    ]
  }
}
```

### 8.2 获取特定类型的数据字典

**接口**: `GET /api/dictionaries/:type`

**请求头**: `Authorization: Bearer [token]`

**路径参数**:
- `type`: 字典类型（jobTypes/educationLevels/skills等）

**成功响应**:
```json
{
  "success": true,
  "data": [
    { "value": "yuexin", "label": "月嫂", "description": "产后护理" }
  ]
}
```

---

## 9. 统计分析

### 9.1 获取仪表盘统计

**接口**: `GET /api/statistics/dashboard`

**请求头**: `Authorization: Bearer [token]`

**成功响应**:
```json
{
  "success": true,
  "data": {
    "totalResumes": 1000,
    "totalOrders": 500,
    "totalInterviews": 200,
    "activeOrders": 50,
    "pendingInterviews": 10,
    "monthlyRevenue": 500000,
    "monthlyNewResumes": 100,
    "monthlyNewOrders": 50
  }
}
```

### 9.2 获取简历统计

**接口**: `GET /api/statistics/resumes`

**请求头**: `Authorization: Bearer [token]`

**查询参数**:
- `startDate`: 开始日期
- `endDate`: 结束日期
- `groupBy`: 分组方式（day/week/month）

**成功响应**:
```json
{
  "success": true,
  "data": {
    "byJobType": [
      { "jobType": "yuexin", "count": 500 }
    ],
    "byEducation": [
      { "education": "high", "count": 300 }
    ],
    "byStatus": [
      { "status": "active", "count": 800 }
    ],
    "timeline": [
      { "date": "2025-09-01", "count": 10 }
    ]
  }
}
```

### 9.3 获取订单统计

**接口**: `GET /api/statistics/orders`

**请求头**: `Authorization: Bearer [token]`

**查询参数**:
- `startDate`: 开始日期
- `endDate`: 结束日期
- `groupBy`: 分组方式（day/week/month）

**成功响应**:
```json
{
  "success": true,
  "data": {
    "byStatus": [
      { "status": "pending", "count": 50, "amount": 100000 }
    ],
    "byServiceType": [
      { "serviceType": "yuexin", "count": 300, "amount": 600000 }
    ],
    "revenue": {
      "total": 1000000,
      "paid": 800000,
      "pending": 200000
    },
    "timeline": [
      { "date": "2025-09-01", "count": 5, "amount": 10000 }
    ]
  }
}
```

---

## 10. 错误码说明

### 10.1 HTTP状态码

| 状态码 | 说明 | 示例场景 |
|--------|------|----------|
| 200 | 成功 | 请求成功处理 |
| 201 | 创建成功 | 资源创建成功 |
| 400 | 请求错误 | 参数验证失败 |
| 401 | 未授权 | Token无效或过期 |
| 403 | 禁止访问 | 权限不足 |
| 404 | 资源不存在 | 请求的资源未找到 |
| 409 | 冲突 | 资源已存在（如重复手机号） |
| 422 | 无法处理的实体 | 数据格式正确但业务逻辑错误 |
| 500 | 服务器错误 | 服务器内部错误 |

### 10.2 业务错误码

| 错误码 | 说明 | HTTP状态码 |
|--------|------|------------|
| VALIDATION_ERROR | 数据验证失败 | 400 |
| UNAUTHORIZED | 未授权 | 401 |
| FORBIDDEN | 禁止访问 | 403 |
| NOT_FOUND | 资源不存在 | 404 |
| DUPLICATE | 资源重复 | 409 |
| INVALID_TOKEN | Token无效 | 401 |
| TOKEN_EXPIRED | Token过期 | 401 |
| INVALID_CREDENTIALS | 登录凭证无效 | 401 |
| PHONE_EXISTS | 手机号已存在 | 409 |
| FILE_TOO_LARGE | 文件过大 | 400 |
| INVALID_FILE_TYPE | 文件类型不支持 | 400 |
| UPLOAD_FAILED | 文件上传失败 | 500 |
| DATABASE_ERROR | 数据库错误 | 500 |
| INTERNAL_ERROR | 内部错误 | 500 |

### 10.3 错误响应格式

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "数据验证失败",
  "data": {
    "errors": ["姓名不能为空", "手机号码格式不正确"]
  }
}
```

---

## 11. 最佳实践

### 11.1 认证与授权

1. **Token管理**
   - 将Token存储在安全的地方（如localStorage或sessionStorage）
   - 每次请求都在请求头中携带Token
   - Token过期后及时刷新或重新登录

2. **权限控制**
   - 根据用户角色显示不同的功能
   - 在调用API前检查用户权限
   - 处理403错误，提示用户权限不足

### 11.2 错误处理

1. **统一错误处理**
```javascript
// 示例：Axios拦截器
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response) {
      switch (error.response.status) {
        case 401:
          // 跳转到登录页
          router.push('/login');
          break;
        case 403:
          // 提示权限不足
          message.error('权限不足');
          break;
        case 404:
          // 提示资源不存在
          message.error('资源不存在');
          break;
        default:
          // 其他错误
          message.error(error.response.data.message || '请求失败');
      }
    }
    return Promise.reject(error);
  }
);
```

2. **业务错误处理**
```javascript
try {
  const response = await api.createResume(data);
  if (response.success) {
    message.success('创建成功');
  }
} catch (error) {
  if (error.response?.data?.code === 'DUPLICATE') {
    message.error('该手机号已被使用');
  } else {
    message.error(error.response?.data?.message || '创建失败');
  }
}
```

### 11.3 文件上传

1. **文件大小限制**
   - 上传前检查文件大小
   - 显示上传进度
   - 处理上传失败的情况

2. **文件类型验证**
```javascript
const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
if (!allowedTypes.includes(file.type)) {
  message.error('不支持的文件类型');
  return false;
}
```

3. **批量上传**
```javascript
const uploadFiles = async (files) => {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file);
  });

  try {
    const response = await api.uploadBatch(formData);
    message.success(`成功上传${response.data.successCount}个文件`);
  } catch (error) {
    message.error('上传失败');
  }
};
```

### 11.4 分页查询

1. **分页参数**
```javascript
const fetchResumes = async (page = 1, pageSize = 10) => {
  const response = await api.getResumes({
    page,
    pageSize,
    keyword: searchKeyword,
    jobType: selectedJobType
  });
  return response.data;
};
```

2. **无限滚动**
```javascript
const loadMore = async () => {
  if (loading || !hasMore) return;

  setLoading(true);
  const nextPage = currentPage + 1;
  const response = await fetchResumes(nextPage);

  setResumes([...resumes, ...response.list]);
  setCurrentPage(nextPage);
  setHasMore(response.list.length === pageSize);
  setLoading(false);
};
```

### 11.5 数据缓存

1. **使用React Query**
```javascript
import { useQuery } from 'react-query';

const useResume = (id) => {
  return useQuery(['resume', id], () => api.getResume(id), {
    staleTime: 5 * 60 * 1000, // 5分钟
    cacheTime: 10 * 60 * 1000, // 10分钟
  });
};
```

2. **本地缓存**
```javascript
const getCachedData = (key) => {
  const cached = localStorage.getItem(key);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < 5 * 60 * 1000) {
      return data;
    }
  }
  return null;
};

const setCachedData = (key, data) => {
  localStorage.setItem(key, JSON.stringify({
    data,
    timestamp: Date.now()
  }));
};
```

### 11.6 防抖与节流

1. **搜索防抖**
```javascript
import { debounce } from 'lodash';

const handleSearch = debounce((keyword) => {
  fetchResumes(1, 10, keyword);
}, 500);
```

2. **滚动节流**
```javascript
import { throttle } from 'lodash';

const handleScroll = throttle(() => {
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
    loadMore();
  }
}, 200);
```

---

## 12. 附录

### 12.1 数据字典完整列表

#### 工种类型 (jobTypes)
```json
[
  { "value": "yuexin", "label": "月嫂", "description": "产后护理" },
  { "value": "yuesao", "label": "育儿嫂", "description": "婴幼儿护理" },
  { "value": "baomu", "label": "保姆", "description": "家庭服务" },
  { "value": "huli", "label": "护理", "description": "老人护理" },
  { "value": "zuofan", "label": "做饭", "description": "家庭烹饪" },
  { "value": "baojie", "label": "保洁", "description": "家庭清洁" }
]
```

#### 学历水平 (educationLevels)
```json
[
  { "value": "primary", "label": "小学", "order": 1 },
  { "value": "middle", "label": "初中", "order": 2 },
  { "value": "high", "label": "高中", "order": 3 },
  { "value": "technical", "label": "中专/技校", "order": 4 },
  { "value": "college", "label": "大专", "order": 5 },
  { "value": "bachelor", "label": "本科", "order": 6 },
  { "value": "master", "label": "硕士及以上", "order": 7 }
]
```

#### 技能列表 (skills)
```json
[
  { "value": "chanhou", "label": "产后护理", "category": "yuexin" },
  { "value": "yuying", "label": "育婴", "category": "yuexin" },
  { "value": "cuiru", "label": "催乳", "category": "yuexin" },
  { "value": "yuezican", "label": "月子餐", "category": "yuexin" },
  { "value": "muying", "label": "母婴护理", "category": "yuexin" },
  { "value": "zaojiao", "label": "早教", "category": "yuesao" },
  { "value": "fushi", "label": "辅食添加", "category": "yuesao" }
]
```

### 12.2 常见问题

**Q: Token过期后如何处理？**
A: 当收到401错误且错误码为TOKEN_EXPIRED时，应该清除本地Token并跳转到登录页面。

**Q: 如何实现文件上传进度显示？**
A: 使用Axios的onUploadProgress配置项监听上传进度。

**Q: 如何处理并发请求？**
A: 使用Promise.all()或axios.all()处理多个并发请求。

**Q: 如何实现请求重试？**
A: 使用axios-retry库或自定义拦截器实现请求重试逻辑。

---

## 13. 更新日志

### v1.0.0 (2025-09-12)
- ✅ 初始版本发布
- ✅ 完成用户认证模块
- ✅ 完成简历管理模块
- ✅ 完成视频面试模块
- ✅ 完成订单管理模块
- ✅ 完成文件上传模块
- ✅ 完成数据字典模块
- ✅ 完成统计分析模块

---

## 14. 联系方式

如有问题或建议，请联系：
- 技术支持邮箱: support@example.com
- 开发团队: dev@example.com

---

**文档版本**: v1.0.0
**最后更新**: 2025-09-12
**维护团队**: 安德家政CRM开发团队


