/**
 * 简历服务
 * 从"安得家政"复制，用于调用 CRM 后台简历相关 API
 */

const { request, publicRequest, authenticatedRequest } = require('../utils/request.js');

/**
 * 获取简历列表（公开接口，无需登录）
 * @param {Object} params 查询参数
 * @param {number} params.page 页码（从 1 开始）
 * @param {number} params.pageSize 每页数量
 * @param {string} params.keyword 搜索关键词
 * @returns {Promise<Object>} 简历列表
 */
const getResumeList = (params = {}) => {
  console.log('📋 获取简历列表（公开接口）:', params);

  // 构建查询参数，只包含有值的参数
  const queryData = {
    page: params.page || 1,
    pageSize: params.pageSize || 20
  };

  // 只有当 keyword 有值时才添加
  if (params.keyword && params.keyword.trim()) {
    queryData.keyword = params.keyword.trim();
  }

  // 月嫂等级筛选（服务等级）
  if (params.maternityNurseLevel) {
    queryData.maternityNurseLevel = params.maternityNurseLevel;
  }

  // 职位类型筛选
  if (params.jobType) {
    queryData.jobType = params.jobType;
  }

  return publicRequest({
    url: '/resumes/public/list',
    method: 'GET',
    data: queryData
  });
};

/**
 * 获取简历列表（小程序专用）
 * @param {Object} params 查询参数
 * @param {number} params.page 页码（从 1 开始）
 * @param {number} params.pageSize 每页数量
 * @param {string} params.keyword 搜索关键词
 * @param {string} params.jobType 工种类型
 * @param {string} params.orderStatus 接单状态
 * @returns {Promise<Object>} 简历列表
 */
const getResumeListMiniprogram = (params = {}) => {
  console.log('📋 获取简历列表（小程序）:', params);

  return authenticatedRequest({
    url: '/resumes/miniprogram',
    method: 'GET',
    data: {
      page: params.page || 1,
      pageSize: params.pageSize || 10,
      keyword: params.keyword || '',
      jobType: params.jobType || '',
      orderStatus: params.orderStatus || ''
    }
  });
};

/**
 * 获取简历详情（公开接口，无需登录）
 * @param {string} id 简历 ID
 * @returns {Promise<Object>} 简历详情
 */
const getResumeDetail = (id) => {
  console.log('📄 获取简历详情（公开接口）:', id);

  return publicRequest({
    url: '/resumes/public/' + id,
    method: 'GET'
  });
};

/**
 * 获取简历详情（小程序专用，公开接口）
 * @param {string} id 简历 ID
 * @returns {Promise<Object>} 简历详情
 */
const getResumeDetailMiniprogram = (id) => {
  console.log('📄 获取简历详情（小程序，公开接口）:', id);

  return publicRequest({
    url: '/resumes/public/' + id,
    method: 'GET'
  });
};

/**
 * 获取简历详情（公开访问，无需登录）
 * 注意：这个方法已废弃，请使用 getResumeDetail
 * @param {string} id 简历 ID
 * @returns {Promise<Object>} 简历详情
 */
const getResumeDetailPublic = (id) => {
  console.log('📄 获取简历详情（公开，已废弃）:', id);
  // 直接调用新的公开接口
  return getResumeDetail(id);
};

/**
 * 创建简历
 * @param {Object} data 简历数据
 * @returns {Promise<Object>} 创建结果
 */
const createResume = (data) => {
  console.log('✏️ 创建简历:', data);

  // 幂等性与请求ID
  const idempotencyKey = 'resume_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

  return authenticatedRequest({
    url: '/resumes',
    method: 'POST',
    data: data,
    header: {
      'Idempotency-Key': idempotencyKey,
      'X-Request-Id': requestId,
      'Api-Version': 'v2'
    }
  });
};

/**
 * 更新简历
 * @param {string} id 简历 ID
 * @param {Object} data 更新数据
 * @returns {Promise<Object>} 更新结果
 */
const updateResume = (id, data) => {
  console.log('📝 更新简历:', id, data);

  return authenticatedRequest({
    url: '/resumes/miniprogram/' + id,
    method: 'PATCH',
    data: data
  });
};

/**
 * 删除简历
 * @param {string} id 简历 ID
 * @returns {Promise<Object>} 删除结果
 */
const deleteResume = (id) => {
  console.log('🗑️ 删除简历:', id);

  return authenticatedRequest({
    url: '/resumes/' + id,
    method: 'DELETE'
  });
};

/**
 * 生成分享链接
 * @param {string} id 简历 ID
 * @param {number} expiresInHours 过期时间（小时）
 * @returns {Promise<Object>} 分享链接
 */
const createShare = (id, expiresInHours = 72) => {
  console.log('🔗 生成分享链接:', id, expiresInHours);

  return authenticatedRequest({
    url: '/resumes/' + id + '/share',
    method: 'POST',
    data: { expiresInHours }
  });
};

/**
 * 上传文件
 * @param {string} id 简历 ID
 * @param {string} filePath 文件路径
 * @param {string} type 文件类型
 * @returns {Promise<Object>} 上传结果
 */
const uploadFile = (id, filePath, type) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('access_token') || wx.getStorageSync('token');
    
    if (!token) {
      reject(new Error('请先登录'));
      return;
    }
    
    console.log('📤 上传文件:', { id, filePath, type });
    
    wx.uploadFile({
      url: 'https://crm.andejiazheng.com/api/resumes/miniprogram/' + id + '/upload-file',
      filePath: filePath,
      name: 'file',
      formData: { type },
      header: {
        'Authorization': 'Bearer ' + token
      },
      success: (res) => {
        console.log('📤 文件上传响应:', res);
        try {
          const data = JSON.parse(res.data);
          resolve(data);
        } catch (error) {
          reject(new Error('响应数据解析失败'));
        }
      },
      fail: (error) => {
        console.error('❌ 文件上传失败:', error);
        reject(error);
      }
    });
  });
};

module.exports = {
  getResumeList,
  getResumeListMiniprogram,
  getResumeDetail,
  getResumeDetailMiniprogram,
  getResumeDetailPublic,
  createResume,
  updateResume,
  deleteResume,
  createShare,
  uploadFile
};

