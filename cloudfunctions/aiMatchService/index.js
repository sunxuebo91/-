const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 用于快速确认"云函数是否已重新部署/生效"
const VERSION = '2026-07-22-aiMatchService-v1';

const VALID_JOB_TYPES = ['yuesao', 'yuer', 'baomu', 'zhujia-hulao'];
const VALID_LEVELS = ['junior', 'silver', 'gold', 'platinum', 'diamond', 'crown'];

/**
 * 使用 AI（deepseek-v3）把客户的自然语言需求解析成结构化 JSON
 * @param {string} text 客户输入的文字（或语音识别转文字）
 */
async function parseNeedsByAI(text) {
  const prompt = `你是母婴家政行业的智能客服。请把客户的招聘需求，解析成如下 JSON 结构（只输出 JSON，不要任何解释文字、不要 markdown 代码块）：

{
  "jobType": "yuesao|yuer|baomu|zhujia-hulao|null",
  "city": "城市或省份关键词，没有则 null",
  "level": "junior|silver|gold|platinum|diamond|crown|null（服务等级，没提到则 null）",
  "priceMax": "预算上限数字，没提到则 null",
  "ageMin": "年龄下限数字，没提到则 null",
  "ageMax": "年龄上限数字，没提到则 null",
  "skills": ["技能关键词数组，如 早教、做饭、中餐、催乳、辅食 等，没有则空数组"],
  "keywords": ["其他可用于文本匹配的关键词，如籍贯、性格、饮食偏好等"],
  "summary": "一句话总结客户需求，用于界面展示"
}

字段说明：
- jobType：yuesao=月嫂，yuer=育儿嫂，baomu=保姆，zhujia-hulao=住家护老
- 只有明确提到相应工种才填，模糊或未提及填 null

客户需求原文：
${text}`;

  const result = await cloud.openapi.ai.chat({
    model: 'deepseek-v3',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    maxTokens: 500,
  });

  const raw = (result.choices[0] && result.choices[0].message && result.choices[0].message.content) || '';
  console.log('[aiMatchService] AI 原始返回:', raw);

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI_NO_JSON');

  const parsed = JSON.parse(jsonMatch[0]);
  return normalizeNeeds(parsed);
}

/** 兜底：关键词规则解析（AI 调用失败时使用） */
function fallbackParseNeeds(text) {
  const t = String(text || '');
  const needs = { jobType: null, city: null, level: null, priceMax: null, ageMin: null, ageMax: null, skills: [], keywords: [], summary: t.slice(0, 60) };

  if (/月嫂/.test(t)) needs.jobType = 'yuesao';
  else if (/育儿嫂|带娃|看孩子/.test(t)) needs.jobType = 'yuer';
  else if (/保姆|做饭阿姨|家政/.test(t)) needs.jobType = 'baomu';
  else if (/护老|养老|照顾老人/.test(t)) needs.jobType = 'zhujia-hulao';

  const levelMap = { 初级: 'junior', 银牌: 'silver', 金牌: 'gold', 铂金: 'platinum', 钻石: 'diamond', 皇冠: 'crown' };
  Object.keys(levelMap).forEach((k) => { if (t.includes(k)) needs.level = levelMap[k]; });

  const priceMatch = t.match(/(\d{3,6})\s*(元|块)/);
  if (priceMatch) needs.priceMax = Number(priceMatch[1]);

  const ageMatch = t.match(/(\d{2})\s*[-~到至]\s*(\d{2})\s*岁/);
  if (ageMatch) {
    needs.ageMin = Number(ageMatch[1]);
    needs.ageMax = Number(ageMatch[2]);
  }

  const skillWords = ['早教', '做饭', '中餐', '西餐', '面食', '催乳', '辅食', '营养', '收纳', '按摩', '开车', '驾驶', '外语', '双胎'];
  needs.skills = skillWords.filter((w) => t.includes(w));

  const provinces = ['北京', '上海', '天津', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆'];
  const hitProvince = provinces.find((p) => t.includes(p));
  if (hitProvince) needs.city = hitProvince;

  return needs;
}

function normalizeNeeds(raw) {
  const jobType = VALID_JOB_TYPES.includes(raw.jobType) ? raw.jobType : null;
  const level = VALID_LEVELS.includes(raw.level) ? raw.level : null;
  const toNum = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
  return {
    jobType,
    city: raw.city && raw.city !== 'null' ? String(raw.city).trim() : null,
    level,
    priceMax: toNum(raw.priceMax),
    ageMin: toNum(raw.ageMin),
    ageMax: toNum(raw.ageMax),
    skills: Array.isArray(raw.skills) ? raw.skills.filter(Boolean).map(String) : [],
    keywords: Array.isArray(raw.keywords) ? raw.keywords.filter(Boolean).map(String) : [],
    summary: raw.summary ? String(raw.summary).slice(0, 100) : '',
  };
}

exports.main = async (event = {}) => {
  const action = event.action || '';
  try {
    if (action === 'parseNeeds') {
      const text = (event.text || '').trim();
      if (!text) return { success: false, errMsg: 'MISSING_TEXT' };

      try {
        const needs = await parseNeedsByAI(text);
        return { success: true, data: needs, meta: { version: VERSION, source: 'ai' } };
      } catch (e) {
        console.warn('[aiMatchService] AI 解析失败，走兜底方案:', e && e.message);
        const needs = fallbackParseNeeds(text);
        return { success: true, data: needs, meta: { version: VERSION, source: 'fallback' } };
      }
    }
    if (action === 'version') return { success: true, VERSION };
    return { success: false, errMsg: 'unknown action', meta: { version: VERSION } };
  } catch (e) {
    return { success: false, errMsg: (e && e.message) || String(e), meta: { version: VERSION } };
  }
};
