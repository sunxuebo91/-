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
        console.log('📰 文章已有有效标签，跳过 AI 分类:', article.title, article.tags);
        return article.tags;
      }
    }

    console.log('🤖 开始 AI 分类:', article.title);

    // 调用云函数进行 AI 分类
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
      const tags = res.result.data.tags || [];
      console.log('✅ AI 分类成功:', article.title, '→', tags);
      return tags;
    } else {
      console.log('⚠️ AI 分类失败，返回空标签:', res.result?.errMsg);
      return [];
    }
  } catch (error) {
    console.error('❌ AI 分类出错:', error);
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

  try {
    // 获取文章列表
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
      console.log(`🤖 开始自动分类 ${articles.length} 篇文章...`);

      // 为每篇文章添加 AI 分类（并发处理，提高速度）
      const classifyPromises = articles.map(async (article) => {
        const tags = await autoClassifyArticle(article);
        if (tags && tags.length > 0) {
          article.tags = tags;
          article.primaryTag = tags[0];
        }
        return article;
      });

      // 等待所有分类完成
      const classifiedArticles = await Promise.all(classifyPromises);

      // 更新 result 中的文章数据
      if (Array.isArray(result.data)) {
        result.data = classifiedArticles;
      } else if (result.data.items) {
        result.data.items = classifiedArticles;
      } else if (result.data.list) {
        result.data.list = classifiedArticles;
      }

      console.log('✅ 文章自动分类完成');
    }

    return result;
  } catch (error) {
    console.error('❌ 获取文章列表失败:', error);
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
  console.log('📰 获取文章详情（公开接口）:', id);

  if (!id) {
    return Promise.reject(new Error('文章ID不能为空'));
  }

  try {
    // 获取文章详情
    const result = await publicRequest({
      url: `/articles/miniprogram/${id}`,
      method: 'GET'
    });

    // 自动分类
    if (autoClassify && result.data) {
      const tags = await autoClassifyArticle(result.data);
      if (tags && tags.length > 0) {
        result.data.tags = tags;
        result.data.primaryTag = tags[0];
      }
    }

    return result;
  } catch (error) {
    console.error('❌ 获取文章详情失败:', error);
    throw error;
  }
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
  batchGetViewCounts,
  autoClassifyArticle  // 导出供其他地方使用
};

