const cloud = require("wx-server-sdk");

// 用于快速确认“云函数是否已重新部署/生效”
const VERSION = "2026-01-27-articleService-v3-ai-classify";

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
 * 使用 AI 为文章智能分类
 * @param {Object} article - 文章对象 { title, summary, content }
 * @returns {Promise<Array<string>>} - 标签数组，如 ['孕期呵护', '备孕好孕']
 */
async function classifyArticleByAI(article) {
  const { title, summary, content } = article;

  // 添加调试日志
  console.log('📝 文章数据:', {
    title,
    summaryLength: summary?.length || 0,
    contentLength: content?.length || 0,
    summaryPreview: summary?.substring(0, 100),
    contentPreview: content?.substring(0, 100)
  });

  // 构建 prompt
  const prompt = `你是一个母婴育儿内容分类专家。请根据文章内容，从以下6个分类中选择最合适的1个标签：

【分类说明——请仔细区分】
1. 备孕好孕 - 备孕准备、孕前检查、叶酸补充、排卵受孕、高龄备孕
2. 孕期呵护 - 孕期保健、产检、胎动、孕期饮食、孕吐、孕期不适、分娩准备
3. 产后恢复 - 月子护理、产后修复、哺乳催乳、产后抑郁、恶露、盆底肌、侧切
4. 新生儿养护 - 0-3个月宝宝的日常护理、喂养、黄疸、脐带护理、拍嗝、睡眠
5. 婴幼护理 - 4个月以上宝宝的喂养照护、辅食添加、断奶、常见疾病（腹泻/感冒/湿疹/积食）、体重身高监测。核心是"照护身体、处理疾病"
6. 亲子早教 - 科学育儿方法、亲子关系、行为习惯培养、专注力/语言/运动发育、早教启蒙、绘本、孩子性格与心理。核心是"教育引导、能力培养"

【重要区分规则】
- 文章讲"怎么喂、怎么护理、生病了怎么办" → 婴幼护理
- 文章讲"怎么教、怎么培养、科学育儿理念、孩子行为/性格/能力" → 亲子早教
- "科学育儿""养孩子方法论""自律""反宠""大脑发育""习惯" → 亲子早教
- 新生儿（0-3个月）相关 → 新生儿养护，不要归入婴幼护理

【分类示例】
- "新生儿常见11种状况" → 新生儿养护
- "四个月宝宝如何添加辅食" → 婴幼护理
- "耶鲁大学证实：养出自律孩子，关键在反宠" → 亲子早教
- "手是第二大脑：科学育儿新方法" → 亲子早教
- "宝宝湿疹怎么办" → 婴幼护理
- "如何培养孩子的专注力" → 亲子早教

【文章信息】
标题：${title}
摘要：${summary || '无'}
内容：${content ? content.substring(0, 500) : '无'}

【输出要求】
1. 只输出1个标签名称，不要输出逗号或多个标签
2. 必须从上述6个分类中选择
3. 如果实在无法判断，输出：未分类
4. 不要输出任何解释说明`;

  try {
    console.log('🤖 调用 AI 分类:', title);

    // 调用微信云开发 AI 接口
    const result = await cloud.openapi.ai.chat({
      model: 'deepseek-v3',
      messages: [{
        role: 'user',
        content: prompt
      }],
      temperature: 0.3,  // 降低随机性，提高一致性
      maxTokens: 50
    });

    const response = result.choices[0]?.message?.content || '';
    console.log('🤖 AI 返回:', response);

    // 解析返回的标签（允许"未分类"，不强制硬猜）
    const validTags = ['备孕好孕', '孕期呵护', '产后恢复', '新生儿养护', '婴幼护理', '亲子早教'];
    const raw = response.trim();

    // 直接命中有效标签
    if (validTags.includes(raw)) {
      console.log('✅ AI 分类成功:', raw);
      return [raw];
    }

    // 尝试从多标签返回中取第一个有效的
    const parsed = raw.split(/[,，、\s]+/).map(t => t.trim()).filter(t => validTags.includes(t));
    if (parsed.length > 0) {
      console.log('✅ AI 分类成功(多标签取首):', parsed[0]);
      return [parsed[0]];
    }

    // 明确返回未分类，不走降级瞎猜
    if (raw.includes('未分类')) {
      console.log('ℹ️ AI 判断为未分类');
      return ['未分类'];
    }

    console.log('⚠️ AI 返回无效标签，使用降级方案');
    return fallbackClassify(article);

  } catch (error) {
    console.error('❌ AI 分类失败:', error);
    console.log('⚠️ 使用降级方案');
    return fallbackClassify(article);
  }
}

/**
 * 降级方案：简单关键词匹配
 * 当 AI 调用失败时使用
 * @param {Object} article - 文章对象
 * @returns {Array<string>} - 标签数组
 */
function fallbackClassify(article) {
  const text = `${article.title || ''} ${article.summary || ''}`.toLowerCase();

  console.log('🔍 降级分类，文本内容:', text.substring(0, 200));

  const rules = [
    {
      // 先判断亲子早教，避免被宽泛词覆盖
      keywords: ['早教', '启蒙', '绘本', '专注力', '语言发育', '大运动', '精细动作',
                 '好习惯', '行为习惯', '自律', '反宠', '科学育儿', '教育方法', '育儿理念',
                 '性格培养', '情绪管理', '亲子关系', '大脑发育', '感统', '认知发展'],
      tag: '亲子早教'
    },
    {
      keywords: ['备孕', '孕前', '叶酸', '排卵', '受孕', '好孕', '验孕', '怀孕准备', '高龄备孕', '备孕检查'],
      tag: '备孕好孕'
    },
    {
      keywords: ['孕期', '孕妇', '产检', '胎动', '唐筛', '四维', 'b超', '妊娠', '孕吐', '胎教', '怀孕', '孕期饮食'],
      tag: '孕期呵护'
    },
    {
      keywords: ['产后', '月子', '坐月子', '哺乳', '母乳', '催乳', '开奶', '追奶', '产褥', '侧切', '撕裂', '恶露', '盆底肌', '腹直肌'],
      tag: '产后恢复'
    },
    {
      keywords: ['新生儿', '满月', '百天', '黄疸', '脐带', '0-3个月', '拍嗝', '新生宝宝', '脐带护理', '肠胀气'],
      tag: '新生儿养护'
    },
    {
      // 婴幼护理：明确的照护/疾病词才归入，不再用"宝宝""婴儿"这种宽泛词
      keywords: ['辅食', '断奶', '湿疹', '积食', '腹泻', '感冒发烧', '过敏', '口腔护理',
                 '4个月', '6个月', '8个月', '10个月', '添加辅食', '米粉', '果泥', '如厕训练',
                 '生长曲线', '身高体重', '体重不达标'],
      tag: '婴幼护理'
    }
  ];

  const matchedTags = [];
  for (const rule of rules) {
    const matched = rule.keywords.filter(kw => text.includes(kw));
    if (matched.length > 0) {
      console.log(`✅ 匹配到关键词 [${matched.join(', ')}] → ${rule.tag}`);
      matchedTags.push(rule.tag);
      if (matchedTags.length >= 2) break;  // 最多2个标签
    }
  }

  if (matchedTags.length === 0) {
    console.log('⚠️ 未匹配到任何关键词，返回默认标签');
    // 根据标题长度和内容猜测一个默认分类
    if (text.includes('痛经') || text.includes('月经')) {
      return ['孕期呵护'];  // 痛经相关归到孕期呵护
    }
    return ['婴幼护理'];  // 默认归到婴幼护理
  }

  console.log('✅ 降级分类结果:', matchedTags);
  return matchedTags;
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
      case "classifyByAI": {
        const tags = await classifyArticleByAI(event.article);
        return { success: true, data: { tags }, meta: { version: VERSION } };
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

