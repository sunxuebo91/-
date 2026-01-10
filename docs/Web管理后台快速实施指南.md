  # Web 管理后台快速实施指南

> 目标：2-3个月内完成 Web 管理后台开发  
> 技术栈：Vue 3 + Element Plus + 云函数 HTTP API

---

## 第一阶段：准备工作（1周）

### 1.1 技术调研

- [ ] 阅读微信云开发 HTTP API 文档
- [ ] 搭建 Vue 3 + Vite 开发环境
- [ ] 选择 UI 组件库（推荐 Element Plus）
- [ ] 设计数据库表结构（accounts 增加 role 字段）

### 1.2 原型设计

- [ ] 绘制页面原型图（Figma / 墨刀）
- [ ] 确定页面路由结构
- [ ] 设计 API 接口规范

### 1.3 环境搭建

```bash
# 创建 Vue 3 项目
npm create vite@latest admin-web -- --template vue

cd admin-web
npm install

# 安装依赖
npm install element-plus
npm install axios
npm install vue-router@4
npm install pinia
npm install @element-plus/icons-vue
```

---

## 第二阶段：后端开发（2-3周）

### 2.1 创建云函数 HTTP API

```bash
# 在 cloudfunctions 目录下创建新云函数
cd cloudfunctions
mkdir adminApi
cd adminApi
npm init -y
npm install wx-server-sdk jsonwebtoken bcryptjs
```

### 2.2 实现核心接口

**文件结构：**
```
cloudfunctions/adminApi/
├── index.js          # 入口文件
├── routes/
│   ├── auth.js       # 登录认证
│   ├── resumes.js    # 简历管理
│   └── upload.js     # 文件上传
├── middleware/
│   ├── auth.js       # JWT 验证
│   └── permission.js # 权限检查
└── utils/
    ├── jwt.js        # JWT 工具
    └── response.js   # 统一响应格式
```

**核心代码示例：**

```javascript
// cloudfunctions/adminApi/index.js
const cloud = require('wx-server-sdk');
const jwt = require('jsonwebtoken');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const JWT_SECRET = 'your-secret-key-change-in-production';

// 统一响应格式
const success = (data) => ({
  statusCode: 200,
  body: JSON.stringify({ success: true, data })
});

const error = (message, code = 400) => ({
  statusCode: code,
  body: JSON.stringify({ success: false, error: message })
});

// JWT 验证中间件
const verifyToken = (token) => {
  try {
    return jwt.verify(token.replace('Bearer ', ''), JWT_SECRET);
  } catch (e) {
    return null;
  }
};

exports.main = async (event, context) => {
  const { httpMethod, path, body, headers } = event;
  
  // 登录接口（无需验证）
  if (path === '/api/login' && httpMethod === 'POST') {
    return await handleLogin(JSON.parse(body));
  }
  
  // 其他接口需要验证 Token
  const token = headers['authorization'] || headers['Authorization'];
  const user = verifyToken(token);
  
  if (!user) {
    return error('未授权', 401);
  }
  
  // 路由分发
  try {
    if (path === '/api/resumes' && httpMethod === 'GET') {
      return await getResumes(user);
    }
    if (path === '/api/resumes' && httpMethod === 'POST') {
      return await createResume(user, JSON.parse(body));
    }
    if (path.startsWith('/api/resumes/') && httpMethod === 'PUT') {
      const id = path.split('/')[3];
      return await updateResume(user, id, JSON.parse(body));
    }
    if (path.startsWith('/api/resumes/') && httpMethod === 'DELETE') {
      const id = path.split('/')[3];
      return await deleteResume(user, id);
    }
    
    return error('接口不存在', 404);
  } catch (e) {
    console.error('API Error:', e);
    return error(e.message, 500);
  }
};

// 登录处理
async function handleLogin(data) {
  const { username, password } = data;
  
  const res = await db.collection('accounts')
    .where({ username })
    .limit(1)
    .get();
  
  if (!res.data.length) {
    return error('账号不存在');
  }
  
  const account = res.data[0];
  
  // 实际项目中应该使用 bcrypt 比对加密密码
  if (account.password !== password) {
    return error('密码错误');
  }
  
  // 生成 JWT Token
  const token = jwt.sign(
    { 
      id: account._id, 
      username: account.username,
      role: account.role 
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  return success({
    token,
    user: {
      id: account._id,
      username: account.username,
      nickname: account.nickname,
      role: account.role
    }
  });
}

// 获取简历列表
async function getResumes(user) {
  let query = {};
  
  // 如果是阿姨，只能看自己的简历
  if (user.role === 'nanny') {
    // 需要通过 openid 关联
    const userRes = await db.collection('users')
      .where({ accountId: user.id })
      .limit(1)
      .get();
    
    if (userRes.data.length) {
      query.createdBy = userRes.data[0]._openid;
    }
  }
  
  const res = await db.collection('resumes')
    .where(query)
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get();
  
  return success(res.data);
}

// 创建简历
async function createResume(user, data) {
  // 权限检查
  if (user.role !== 'staff' && user.role !== 'nanny') {
    return error('无权限', 403);
  }
  
  const now = db.serverDate();
  const doc = {
    name: data.name,
    age: data.age,
    city: data.city,
    experienceYears: data.experienceYears,
    priceMonth: data.priceMonth,
    tags: data.tags || [],
    intro: data.intro || '',
    coverFileId: data.coverFileId || '',
    photos: data.photos || [],
    videoFileId: data.videoFileId || '',
    status: data.status || 'draft',
    createdAt: now,
    updatedAt: now,
    createdBy: user.id  // 记录创建者
  };
  
  const res = await db.collection('resumes').add({ data: doc });
  
  return success({ _id: res._id });
}

// 更新简历（省略，类似 createResume）
// 删除简历（省略，需要权限检查）
```

### 2.3 部署云函数

```bash
# 上传云函数
wx-cloud deploy --function adminApi

# 开启 HTTP 访问
# 在微信开发者工具 -> 云开发 -> 云函数 -> adminApi -> 设置 -> 开启 HTTP 访问
```

---

## 第三阶段：前端开发（3-4周）

### 3.1 项目结构

```
admin-web/
├── src/
│   ├── api/              # API 接口
│   │   ├── request.js    # axios 封装
│   │   ├── auth.js       # 登录接口
│   │   └── resume.js     # 简历接口
│   ├── views/            # 页面
│   │   ├── Login.vue     # 登录页
│   │   ├── Dashboard.vue # 首页
│   │   ├── ResumeList.vue    # 简历列表
│   │   ├── ResumeEdit.vue    # 简历编辑
│   │   └── ResumeDetail.vue  # 简历详情
│   ├── components/       # 组件
│   │   ├── Layout.vue    # 布局组件
│   │   └── UploadImage.vue  # 图片上传
│   ├── router/           # 路由
│   │   └── index.js
│   ├── stores/           # 状态管理
│   │   └── user.js
│   ├── utils/            # 工具函数
│   │   └── auth.js       # Token 管理
│   ├── App.vue
│   └── main.js
├── index.html
├── vite.config.js
└── package.json
```

### 3.2 核心代码示例

#### API 封装

```javascript
// src/api/request.js
import axios from 'axios';
import { ElMessage } from 'element-plus';
import { getToken, removeToken } from '@/utils/auth';
import router from '@/router';

const request = axios.create({
  baseURL: 'https://xxx.service.tcloudbase.com/adminApi',
  timeout: 10000
});

// 请求拦截器
request.interceptors.request.use(
  config => {
    const token = getToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// 响应拦截器
request.interceptors.response.use(
  response => {
    const res = response.data;
    if (res.success) {
      return res.data;
    } else {
      ElMessage.error(res.error || '请求失败');
      return Promise.reject(new Error(res.error || '请求失败'));
    }
  },
  error => {
    if (error.response?.status === 401) {
      ElMessage.error('登录已过期，请重新登录');
      removeToken();
      router.push('/login');
    } else {
      ElMessage.error(error.message || '网络错误');
    }
    return Promise.reject(error);
  }
);

export default request;
```

```javascript
// src/api/resume.js
import request from './request';

export const getResumes = () => {
  return request.get('/api/resumes');
};

export const getResumeDetail = (id) => {
  return request.get(`/api/resumes/${id}`);
};

export const createResume = (data) => {
  return request.post('/api/resumes', data);
};

export const updateResume = (id, data) => {
  return request.put(`/api/resumes/${id}`, data);
};

export const deleteResume = (id) => {
  return request.delete(`/api/resumes/${id}`);
};

export const uploadImage = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/api/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};
```

#### 简历列表页面

```vue
<!-- src/views/ResumeList.vue -->
<template>
  <div class="resume-list">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>简历管理</span>
          <el-button type="primary" @click="handleCreate">新增简历</el-button>
        </div>
      </template>

      <el-table :data="resumes" v-loading="loading">
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="city" label="城市" width="100" />
        <el-table-column prop="age" label="年龄" width="80" />
        <el-table-column prop="experienceYears" label="经验" width="80">
          <template #default="{ row }">
            {{ row.experienceYears }}年
          </template>
        </el-table-column>
        <el-table-column prop="priceMonth" label="月薪" width="120">
          <template #default="{ row }">
            {{ row.priceMonth ? `¥${row.priceMonth}` : '面议' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'published' ? 'success' : 'info'">
              {{ row.status === 'published' ? '已发布' : '草稿' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.updatedAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getResumes, deleteResume } from '@/api/resume';

const router = useRouter();
const resumes = ref([]);
const loading = ref(false);

const loadResumes = async () => {
  loading.value = true;
  try {
    resumes.value = await getResumes();
  } catch (error) {
    console.error('加载失败:', error);
  } finally {
    loading.value = false;
  }
};

const handleCreate = () => {
  router.push('/resumes/create');
};

const handleEdit = (row) => {
  router.push(`/resumes/${row._id}/edit`);
};

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除这条简历吗？', '提示', {
      type: 'warning'
    });

    await deleteResume(row._id);
    ElMessage.success('删除成功');
    loadResumes();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error);
    }
  }
};

const formatDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleString('zh-CN');
};

onMounted(() => {
  loadResumes();
});
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
```

---

## 第四阶段：测试与部署（1周）

### 4.1 本地测试

- [ ] 登录功能测试
- [ ] 简历增删改查测试
- [ ] 图片上传测试
- [ ] 权限控制测试
- [ ] 浏览器兼容性测试

### 4.2 部署上线

```bash
# 构建生产版本
npm run build

# 部署到云托管或静态网站托管
# 方式1：微信云开发静态网站托管
# 方式2：腾讯云 COS + CDN
# 方式3：Vercel / Netlify
```

### 4.3 配置域名和 HTTPS

- [ ] 购买域名
- [ ] 配置 DNS 解析
- [ ] 申请 SSL 证书
- [ ] 配置 HTTPS

---

## 第五阶段：优化与迭代（持续）

### 5.1 性能优化

- [ ] 图片懒加载
- [ ] 路由懒加载
- [ ] 打包体积优化
- [ ] CDN 加速

### 5.2 功能增强

- [ ] 批量操作（批量发布、批量删除）
- [ ] 数据导出（Excel）
- [ ] 数据统计（图表展示）
- [ ] 操作日志

### 5.3 用户体验

- [ ] 响应式设计（支持移动端）
- [ ] 暗黑模式
- [ ] 快捷键支持
- [ ] 离线提示

---

## 常见问题

### Q1: 云函数 HTTP API 如何调试？

**A:** 使用微信开发者工具的云函数调试功能，或者使用 Postman 测试。

### Q2: 如何处理图片上传？

**A:** 前端先上传到云存储获取 fileID，然后将 fileID 保存到数据库。

```javascript
// 云函数处理文件上传
async function handleUpload(event) {
  const { file } = event;

  // 上传到云存储
  const result = await cloud.uploadFile({
    cloudPath: `resumes/${Date.now()}-${file.name}`,
    fileContent: file.buffer
  });

  return success({ fileID: result.fileID });
}
```

### Q3: 如何实现权限控制？

**A:** 在云函数中验证 JWT Token，检查用户角色，根据角色返回不同数据。

### Q4: 如何保证数据安全？

**A:**
1. 使用 HTTPS 传输
2. 密码使用 bcrypt 加密存储
3. JWT Token 设置合理的过期时间
4. 后端强校验所有操作权限
5. 定期备份数据库

---

## 参考资源

- [微信云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)
- [Vue 3 官方文档](https://cn.vuejs.org/)
- [Element Plus 组件库](https://element-plus.org/)
- [Vite 构建工具](https://cn.vitejs.dev/)

---

## 总结

通过以上步骤，可以在 2-3 个月内完成一个功能完善的 Web 管理后台。关键点：

1. **后端优先**：先完成云函数 HTTP API，确保接口稳定
2. **渐进开发**：先实现核心功能，再逐步完善
3. **注重安全**：权限控制和数据安全是重中之重
4. **持续优化**：上线后根据用户反馈持续迭代

祝开发顺利！🚀

