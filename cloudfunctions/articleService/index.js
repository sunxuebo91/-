const cloud = require("wx-server-sdk");

// 用于快速确认“云函数是否已重新部署/生效”
const VERSION = "2026-01-16-articleService-v2";

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

/**
 * 安全创建集合
 */
async function safeCreateCollection(name) {
  try {
    await db.createCollection(name);
  } catch (e) {
    // ignore: already exists / no permission
  }
}

/**
 * 确保必要的集合存在
 */
async function ensureCollections() {
  await Promise.all([
    safeCreateCollection("articles"),
  ]);
}

/**
 * 初始化文章阅读量
 * 如果文章没有 viewCount 字段，则设置一个随机初始值（1000-5000）
 */
async function initializeViewCount(articleId) {
  try {
    // 获取文章（文档不存在时，直接创建）
    let article;
    try {
      article = await db.collection("articles").doc(articleId).get();
    } catch (e) {
      // 生成随机初始值（1000-5000）
      const initialViewCount = Math.floor(Math.random() * 4001) + 1000;

      // 创建文档（使用 articleId 作为 docId）
      await db.collection("articles").doc(articleId).set({
        data: {
          viewCount: initialViewCount
        }
      });

      return initialViewCount;
    }

    if (!article || !article.data) {
      throw new Error("文章不存在");
    }

    // 如果已经有 viewCount，直接返回
    if (article.data.viewCount !== undefined && article.data.viewCount !== null) {
      return article.data.viewCount;
    }

    // 生成随机初始值（1000-5000）
    const initialViewCount = Math.floor(Math.random() * 4001) + 1000;

    // 更新文章
    await db.collection("articles").doc(articleId).update({
      data: {
        viewCount: initialViewCount
      }
    });

    return initialViewCount;
  } catch (e) {
    console.error("初始化阅读量失败:", e);
    throw e;
  }
}

/**
 * 增加文章阅读量
 * @param {string} articleId 文章ID
 * @returns {Promise<number>} 新的阅读量
 */
async function incrementViewCount(articleId) {
  try {
    if (!articleId) {
      throw new Error("文章ID不能为空");
    }

    // 先确保文章有初始阅读量
    await initializeViewCount(articleId);

    // 增加阅读量
    await db.collection("articles").doc(articleId).update({
      data: {
        viewCount: _.inc(1)
      }
    });

    // 获取更新后的阅读量
    const article = await db.collection("articles").doc(articleId).get();
    
    return article.data.viewCount || 0;
  } catch (e) {
    console.error("增加阅读量失败:", e);
    throw e;
  }
}

/**
 * 批量初始化所有文章的阅读量
 * 用于一次性给所有没有阅读量的文章设置初始值
 */
async function batchInitializeViewCounts() {
  try {
    // 获取所有 viewCount 不存在或为 0 的文章
    const articles = await db.collection("articles")
      .where(_.or([
        { viewCount: _.exists(false) },
        { viewCount: 0 }
      ]))
      .get();

    if (!articles.data || articles.data.length === 0) {
      return { initialized: 0, message: "没有需要初始化的文章" };
    }

    console.log(`找到 ${articles.data.length} 篇需要初始化的文章`);

    // 批量更新
    const promises = articles.data.map(article => {
      const initialViewCount = Math.floor(Math.random() * 4001) + 1000;
      console.log(`初始化文章 ${article._id} 阅读量: ${initialViewCount}`);
      return db.collection("articles").doc(article._id).update({
        data: {
          viewCount: initialViewCount
        }
      });
    });

    await Promise.all(promises);

    return {
      initialized: articles.data.length,
      message: `成功初始化 ${articles.data.length} 篇文章的阅读量`
    };
  } catch (e) {
    console.error("批量初始化阅读量失败:", e);
    throw e;
  }
}

/**
 * 批量获取文章阅读量
 * @param {Array<string>} articleIds 文章ID数组
 * @returns {Object} 阅读量映射 { articleId: viewCount }
 */
async function batchGetViewCounts(articleIds) {
  try {
    if (!articleIds || articleIds.length === 0) {
      return {};
    }

    // 标准化：过滤空值、去重、转字符串（避免传入 undefined 导致整批失败）
    const normalizedIds = Array.from(new Set(
      (articleIds || [])
        .filter(id => id !== undefined && id !== null && String(id).trim() !== "")
        .map(id => String(id))
    ));

    if (normalizedIds.length === 0) {
      return {};
    }

    // 查询所有文章的阅读量
    const result = await db.collection("articles")
      .where({
        _id: _.in(normalizedIds)
      })
      .field({
        _id: true,
        viewCount: true
      })
      .get();

    // 转换为映射对象
    const viewCountMap = {};
    const existingIds = new Set();

    if (result.data && result.data.length > 0) {
      result.data.forEach(article => {
        existingIds.add(article._id);
        viewCountMap[article._id] = article.viewCount || 0;
      });
    }

    // 对于没有记录的文章：创建文档并写入随机初始值（避免前端显示 0）
    const missingIds = normalizedIds.filter(id => !existingIds.has(id));
    if (missingIds.length > 0) {
      const createResults = await Promise.allSettled(
        missingIds.map(id => {
          const initialViewCount = Math.floor(Math.random() * 4001) + 1000;
          viewCountMap[id] = initialViewCount;
          return db.collection("articles").doc(id).set({
            data: {
              viewCount: initialViewCount
            }
          });
        })
      );

      // 如果创建失败，回退为 0
      createResults.forEach((r, idx) => {
        if (r.status !== 'fulfilled') {
          viewCountMap[missingIds[idx]] = 0;
        }
      });
    }

    // 确保所有 id 都有值（兜底）
    normalizedIds.forEach(id => {
      if (!(id in viewCountMap)) {
        viewCountMap[id] = 0;
      }
    });

    return viewCountMap;
  } catch (e) {
    console.error("批量获取阅读量失败:", e);
    throw e;
  }
}


/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  try {
    // 确保集合存在
    await ensureCollections();

    const action = event.action;

    // 轻量日志：便于在云开发控制台确认是否命中最新版本
    try {
      const ids = Array.isArray(event.articleIds) ? event.articleIds : [];
      console.log('[articleService]', VERSION, 'action=', action, 'articleId=', event.articleId, 'articleIdsLen=', ids.length, 'sample=', ids.slice(0, 3));
    } catch (e) {
      // ignore log errors
    }

    switch (action) {
      case "incrementViewCount": {
        const viewCount = await incrementViewCount(event.articleId);
        return { success: true, data: { viewCount }, meta: { version: VERSION } };
      }
      case "batchInitialize": {
        const result = await batchInitializeViewCounts();
        return { success: true, data: result, meta: { version: VERSION } };
      }
      case "batchGetViewCounts": {
        const viewCountMap = await batchGetViewCounts(event.articleIds);
        return { success: true, data: viewCountMap, meta: { version: VERSION } };
      }
      default:
        return { success: false, errMsg: "unknown action", meta: { version: VERSION } };
    }
  } catch (e) {
    return {
      success: false,
      errMsg: e && e.message ? e.message : String(e),
      meta: { version: VERSION }
    };
  }
};

