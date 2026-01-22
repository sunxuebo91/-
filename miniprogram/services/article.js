/**
 * 文章服务
 * 用于调用 CRM 后台文章相关 API
 */

const { publicRequest } = require('../utils/request.js');

/**
 * 获取文章列表（公开接口，无需登录）
 * @param {Object} params 查询参数
 * @param {number} params.page 页码（从 1 开始）
 * @param {number} params.pageSize 每页数量
 * @param {string} params.keyword 搜索关键词（可选）
 * @returns {Promise<Object>} 文章列表
 */
const getArticleList = (params = {}) => {
  console.log('📰 获取文章列表（公开接口）:', params);

  // 构建查询参数
  const queryParams = [];

  // 分页参数
  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  queryParams.push(`page=${page}`);
  queryParams.push(`pageSize=${pageSize}`);

  // 搜索关键词（可选）
  if (params.keyword && params.keyword.trim()) {
    queryParams.push(`keyword=${encodeURIComponent(params.keyword.trim())}`);
  }

  const queryString = queryParams.join('&');

  return publicRequest({
    url: `/articles/miniprogram/list?${queryString}`,
    method: 'GET'
  });
};

/**
 * 获取文章详情（公开接口，无需登录）
 * @param {string} id 文章ID
 * @returns {Promise<Object>} 文章详情
 */
const getArticleDetail = (id) => {
  console.log('📰 获取文章详情（公开接口）:', id);

  if (!id) {
    return Promise.reject(new Error('文章ID不能为空'));
  }

  return publicRequest({
    url: `/articles/miniprogram/${id}`,
    method: 'GET'
  });
};

/**
 * 增加文章阅读量（使用云函数）
 * @param {string} articleId 文章ID
 * @returns {Promise<number>} 新的阅读量
 */
const incrementViewCount = (articleId) => {
  console.log('📰 增加文章阅读量:', articleId);

  if (!articleId) {
    return Promise.reject(new Error('文章ID不能为空'));
  }

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'articleService',
      data: {
        action: 'incrementViewCount',
        articleId: articleId
      }
    }).then(res => {
      const metaVersion = res?.result?.meta?.version;
      console.log('📰 阅读量增加成功:', res, metaVersion ? `(cloudfn version: ${metaVersion})` : '');
      if (res.result && res.result.success) {
        resolve(res.result.data?.viewCount || 0);
      } else {
        reject(new Error(res.result?.errMsg || res?.errMsg || '增加阅读量失败'));
      }
    }).catch(err => {
      console.error('📰 增加阅读量失败:', err);
      reject(err);
    });
  });
};

/**
 * 批量初始化所有文章的阅读量
 * @returns {Promise<Object>} 初始化结果
 */
const batchInitializeViewCounts = () => {
  console.log('📰 批量初始化文章阅读量');

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'articleService',
      data: {
        action: 'batchInitialize'
      }
    }).then(res => {
      console.log('📰 批量初始化成功:', res);
      if (res.result && res.result.success) {
        resolve(res.result.data);
      } else {
        reject(new Error(res.result?.errMsg || '批量初始化失败'));
      }
    }).catch(err => {
      console.error('📰 批量初始化失败:', err);
      reject(err);
    });
  });
};

/**
 * 批量获取文章阅读量（从云数据库）
 * @param {Array<string>} articleIds 文章ID数组
 * @returns {Promise<Object>} 阅读量映射 { articleId: viewCount }
 */
const batchGetViewCounts = (articleIds) => {
  console.log('📰 批量获取阅读量:', articleIds);

  if (!articleIds || articleIds.length === 0) {
    return Promise.resolve({});
  }

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'articleService',
      data: {
        action: 'batchGetViewCounts',
        articleIds: articleIds
      }
    }).then(res => {
      const metaVersion = res?.result?.meta?.version;
      console.log('📰 批量获取阅读量成功:', res, metaVersion ? `(cloudfn version: ${metaVersion})` : '');
      if (res.result && res.result.success) {
        resolve(res.result.data || {});
      } else {
        reject(new Error(res.result?.errMsg || res?.errMsg || '获取阅读量失败'));
      }
    }).catch(err => {
      console.error('📰 批量获取阅读量失败:', err);
      reject(err);
    });
  });
};

module.exports = {
  getArticleList,
  getArticleDetail,
  incrementViewCount,
  batchInitializeViewCounts,
  batchGetViewCounts
};

