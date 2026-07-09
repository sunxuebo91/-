/**
 * 文章服务
 * 用于调用 CRM 后台文章相关 API
 */

const { publicRequest } = require('../utils/request.js');

/**
 * 为文章自动添加 AI 分类标签
 * @param {Object} article 文章对象
 * @returns {Promise<Array>} AI 分类的标签数组
 */
const autoClassifyArticle = async (article) => {
  try {
    // 如果文章已有有效标签，跳过分类
    const validTags = ['备孕好孕', '孕期呵护', '产后恢复', '新生儿养护', '婴幼护理', '亲子早教'];
    if (article.tags && Array.isArray(article.tags) && article.tags.length > 0) {
      const hasValidTag = article.tags.some(tag => validTags.includes(tag));
      if (hasValidTag) {
        return article.tags;
      }
    }

    // 调用云函数进行 AI 分类（静默：无日志）
    const res = await wx.cloud.callFunction({
      name: 'articleService',
      data: {
        action: 'classifyByAI',
        article: {
          title: article.title || '',
          summary: article.summary || article.description || '',
          content: article.content || ''
        }
      }
    });

    if (res.result && res.result.success) {
      return res.result.data.tags || [];
    }
    return [];
  } catch (error) {
    // 异常才打日志
    console.error('article autoClassify failed:', error.message);
    return [];
  }
};

/**
 * 获取文章列表（公开接口，无需登录）
 * 自动为没有标签的文章添加 AI 分类
 * @param {Object} params 查询参数
 * @param {number} params.page 页码（从 1 开始）
 * @param {number} params.pageSize 每页数量
 * @param {string} params.keyword 搜索关键词（可选）
 * @param {boolean} params.autoClassify 是否自动分类（默认 true）
 * @returns {Promise<Object>} 文章列表
 */
const getArticleList = async (params = {}) => {
  // 构建查询参数
  const queryParams = [];
  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  queryParams.push(`page=${page}`);
  queryParams.push(`pageSize=${pageSize}`);
  if (params.keyword && params.keyword.trim()) {
    queryParams.push(`keyword=${encodeURIComponent(params.keyword.trim())}`);
  }
  const queryString = queryParams.join('&');

  try {
    const result = await publicRequest({
      url: `/articles/miniprogram/list?${queryString}`,
      method: 'GET'
    });

    // 是否自动分类（默认开启）
    const autoClassify = params.autoClassify !== false;

    // 提取文章数组（兼容不同的返回格式）
    let articles = [];
    if (result.data) {
      if (Array.isArray(result.data)) {
        articles = result.data;
      } else if (result.data.items && Array.isArray(result.data.items)) {
        articles = result.data.items;
      } else if (result.data.list && Array.isArray(result.data.list)) {
        articles = result.data.list;
      }
    }

    if (autoClassify && articles.length > 0) {
      const classifyPromises = articles.map(async (article) => {
        const tags = await autoClassifyArticle(article);
        if (tags && tags.length > 0) {
          article.tags = tags;
          article.primaryTag = tags[0];
        }
        return article;
      });
      const classifiedArticles = await Promise.all(classifyPromises);
      if (Array.isArray(result.data)) {
        result.data = classifiedArticles;
      } else if (result.data.items) {
        result.data.items = classifiedArticles;
      } else if (result.data.list) {
        result.data.list = classifiedArticles;
      }
    }

    return result;
  } catch (error) {
    console.error('article list failed:', error.message);
    throw error;
  }
};

/**
 * 获取文章详情（公开接口，无需登录）
 * 自动为没有标签的文章添加 AI 分类
 * @param {string} id 文章ID
 * @param {boolean} autoClassify 是否自动分类（默认 true）
 * @returns {Promise<Object>} 文章详情
 */
const getArticleDetail = async (id, autoClassify = true) => {
  if (!id) {
    return Promise.reject(new Error('文章ID不能为空'));
  }

  try {
    const result = await publicRequest({
      url: `/articles/miniprogram/${id}`,
      method: 'GET'
    });

    if (autoClassify && result.data) {
      const tags = await autoClassifyArticle(result.data);
      if (tags && tags.length > 0) {
        result.data.tags = tags;
        result.data.primaryTag = tags[0];
      }
    }

    return result;
  } catch (error) {
    console.error('article detail failed:', error.message);
    throw error;
  }
};

/**
 * 增加文章阅读量（使用云函数）
 * @param {string} articleId 文章ID
 * @returns {Promise<number>} 新的阅读量
 */
const incrementViewCount = (articleId) => {
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
      if (res.result && res.result.success) {
        resolve(res.result.data?.viewCount || 0);
      } else {
        reject(new Error(res.result?.errMsg || res?.errMsg || '增加阅读量失败'));
      }
    }).catch(err => {
      console.error('incrementViewCount failed:', err.message);
      reject(err);
    });
  });
};

/**
 * 批量初始化所有文章的阅读量
 * @returns {Promise<Object>} 初始化结果
 */
const batchInitializeViewCounts = () => {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'articleService',
      data: {
        action: 'batchInitialize'
      }
    }).then(res => {
      if (res.result && res.result.success) {
        resolve(res.result.data);
      } else {
        reject(new Error(res.result?.errMsg || '批量初始化失败'));
      }
    }).catch(err => {
      console.error('batchInitialize failed:', err.message);
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
      if (res.result && res.result.success) {
        resolve(res.result.data || {});
      } else {
        reject(new Error(res.result?.errMsg || res?.errMsg || '获取阅读量失败'));
      }
    }).catch(err => {
      console.error('batchGetViewCounts failed:', err.message);
      reject(err);
    });
  });
};

module.exports = {
  getArticleList,
  getArticleDetail,
  incrementViewCount,
  batchInitializeViewCounts,
  batchGetViewCounts,
  autoClassifyArticle
};

