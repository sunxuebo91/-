const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 用于快速确认"云函数是否已重新部署/生效"
const VERSION = '2026-07-24-aiMatchService-v6';

// ── 需求解析 LLM 双通道配置 ─────────────────────────────────────
// 通道① DashScope 直连（首选）：云函数环境变量配 DASHSCOPE_API_KEY 即启用
//   （值 = CRM 服务器 .env 里的 QWEN_API_KEY，阿里百炼平台，用户已拍板 qwen3.5-plus）
//   微信云 AI 官方模型列表不含 qwen，直连百炼兼容模式端点调用。
// 通道② 微信云 AI（降级）：无 key 或通道①失败时回退，
//   模型限定微信云官方列表内（deepseek/混元/glm/kimi/minimax）。
// 换模型不用改代码：环境变量 AIMATCH_PARSE_MODEL / AIMATCH_WX_PARSE_MODEL 覆盖默认值。
const PARSE_MODEL = process.env.AIMATCH_PARSE_MODEL || 'qwen3.5-plus';
const WX_PARSE_MODEL = process.env.AIMATCH_WX_PARSE_MODEL || 'deepseek-v4-pro';

// ── 工种枚举：与生产库真实值对齐（旧 yuer/baomu 不存在，库里 0 条）──
// 生产库条数（2026-07 统计）：
//   zhujia-baomu 住家保姆 1985 | xiaoshi 小时工 1459 | zhujia-yuer 住家育儿嫂 785
//   baiban-baomu 白班保姆 643 | baiban-yuer 白班育儿嫂 212 | yuesao 月嫂 160
//   zhujia-hulao 住家护老 122 | peiban 陪诊/陪护 25 | jiajiao 家教 13 | hugong 护工 6
const VALID_JOB_TYPES = [
  'zhujia-baomu',
  'xiaoshi',
  'zhujia-yuer',
  'baiban-baomu',
  'baiban-yuer',
  'yuesao',
  'zhujia-hulao',
  'peiban',
  'jiajiao',
  'hugong',
];
const VALID_LEVELS = ['junior', 'silver', 'gold', 'platinum', 'diamond', 'crown'];

// trackEvent 允许的事件类型（转发给 CRM /api/resumes/match/event）
const VALID_TRACK_EVENTS = ['impression', 'like', 'nope', 'detail', 'interview'];

// parseNeeds 服务端防护
const PARSE_TEXT_MAX_LEN = 300;   // 超长直接截断，不报错
const PARSE_QUOTA_PER_HOUR = 20;  // 每个 openid 每小时最多 20 次

// CRM 内部接口令牌（48 位 hex），与 notificationService 保持一致
// ⚠️ 必须与 CRM ecosystem.config.js 的 MINIPROGRAM_INTERNAL_TOKEN 保持一致
const CRM_INTERNAL_TOKEN = process.env.CRM_INTERNAL_TOKEN || '455dc3b0cf6d45d0e30345d03a2fb04f826606a1588fc3ce';
const CRM_HOSTNAME = 'crm.andejiazheng.com';

/**
 * 用 LLM 把客户的自然语言需求解析成结构化 JSON（双通道，详见文件头部配置注释）
 * 通道① DashScope 直连（PARSE_MODEL，首选）→ 通道② 微信云 AI（WX_PARSE_MODEL，降级）
 * @param {string} text 客户输入的文字（已在入口处截断 300 字）
 * @returns {Promise<{needs: Object, channel: 'dashscope'|'wxcloud', model: string}>}
 */
async function parseNeedsByAI(text) {
  const prompt = `你是母婴家政行业的智能客服。请把客户的招聘需求，解析成如下 JSON 结构（只输出 JSON，不要任何解释文字、不要 markdown 代码块）：

{
  "jobType": "工种枚举值（见下方说明），没有则 null",
  "city": "客户要求的工作城市/省份关键词，没有则 null",
  "nativePlace": "阿姨籍贯（出生地）的省级关键词，如 黑龙江，只留省级词、去掉 省/市/自治区 后缀，没提到籍贯则 null",
  "level": "junior|silver|gold|platinum|diamond|crown|null（服务等级，没提到则 null）",
  "priceMax": "预算上限数字（如\"7000的\"\"预算八千\"→7000/8000），没提到则 null",
  "ageMin": "年龄下限数字，没提到则 null",
  "ageMax": "年龄上限数字，没提到则 null",
  "skills": ["技能关键词数组，如 早教、做饭、中餐、催乳、辅食 等，没有则空数组"],
  "keywords": ["其他可用于文本匹配的关键词，如性格、饮食偏好等（含这些关键词的同义表达）"],
  "summary": "一句话总结客户需求，用于界面展示"
}

字段辨析：
- city 是客户要求的工作地点（"在杭州找"→city=杭州）；nativePlace 是阿姨的籍贯/老家（"黑龙江人""东北籍贯的阿姨"→nativePlace=黑龙江/东北）。两者不要混填。
- 以上 10 个字段是后端唯一认可的字段名，禁止输出 budget/region/province/salary 等其他字段名。

【同义词扩展（重要）】skills 数组的每个技能词，都要附上 2-3 个阿姨简历里可能出现的同义/近义表达，
全部平铺在数组里（原词放最前）。简历用词和客户口语往往不同词，扩展后才能匹配上。示例：
- 客户说"辅食" → ["辅食", "营养配餐", "宝宝餐"]
- 客户说"早教" → ["早教", "智力开发", "启蒙"]
- 客户说"催乳" → ["催乳", "通乳", "开奶"]
- 客户说"收纳" → ["收纳", "整理收纳", "家务整理"]
keywords 同理：籍贯、性格、饮食偏好等关键词也带上同义表达（如"江浙菜"→["江浙菜","杭帮菜"]）。

jobType 只能取以下 10 个枚举值之一或 null（中文对照）：
- zhujia-baomu：住家保姆
- baiban-baomu：白班保姆
- xiaoshi：小时工/钟点工
- zhujia-yuer：住家育儿嫂
- baiban-yuer：白班育儿嫂
- yuesao：月嫂
- zhujia-hulao：住家护老
- hugong：护工（医院/病床照护）
- peiban：陪诊/陪护
- jiajiao：家教

工种映射规则：
- "育儿嫂"未说明住家/白班时，优先 zhujia-yuer
- "保姆"未说明住家/白班时，优先 zhujia-baomu
- "做饭/接送/钟点/保洁"等按次计时的零散需求 → xiaoshi
- "照顾老人/护老"未说明场景时，优先 zhujia-hulao；明确提到医院/病床照护 → hugong
- "陪诊/陪老人看病" → peiban
- "辅导作业/家教" → jiajiao
- 只有明确提到相应工种才填，模糊或未提及填 null

客户需求原文：
${text}`;

  // ── 通道①：DashScope 直连（配了 DASHSCOPE_API_KEY 才走）──
  const dsKey = process.env.DASHSCOPE_API_KEY;
  if (dsKey) {
    try {
      const raw = await callDashScope(prompt, dsKey);
      console.log('[aiMatchService] DashScope 原始返回:', raw);
      return { needs: extractNeeds(raw), channel: 'dashscope', model: PARSE_MODEL };
    } catch (e) {
      // 失败降级微信云通道，不直接抛错（正则兜底是最后一道）
      console.warn('[aiMatchService] DashScope 调用失败，降级微信云通道:', e && e.message);
    }
  } else {
    console.log('[aiMatchService] 未配置 DASHSCOPE_API_KEY，直接走微信云通道');
  }

  // ── 通道②：微信云 AI（官方模型列表内）──
  const result = await cloud.openapi.ai.chat({
    model: WX_PARSE_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    maxTokens: 500,
  });

  const raw = (result.choices[0] && result.choices[0].message && result.choices[0].message.content) || '';
  console.log('[aiMatchService] 微信云 AI 原始返回:', raw);
  return { needs: extractNeeds(raw), channel: 'wxcloud', model: WX_PARSE_MODEL };
}

// 从 LLM 原始文本提取 JSON 并归一化（两通道共用；提取失败抛 AI_NO_JSON 由上层走正则兜底）
function extractNeeds(raw) {
  const jsonMatch = String(raw || '').match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI_NO_JSON');
  const parsed = JSON.parse(jsonMatch[0]);
  return normalizeNeeds(parsed);
}

/**
 * DashScope 直连：阿里百炼兼容模式端点（OpenAI 兼容协议）
 * qwen3.5-plus 是混合思考模型：enable_thinking=false 关闭思考，保证低延迟 + JSON 直出；
 * response_format json_object 尽量约束 JSON 输出（百炼兼容模式对 qwen 系列支持，
 * 万一不支持会报错 → 上层降级微信云，prompt 约束 + extractNeeds 正则提取仍是兜底）。
 */
function callDashScope(prompt, apiKey) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify({
      model: PARSE_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 500,
      enable_thinking: false,
      response_format: { type: 'json_object' },
    });
    const req = https.request({
      hostname: 'dashscope.aliyuncs.com',
      path: '/compatible-mode/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
            if (!content) return reject(new Error('DashScope 返回无 content'));
            resolve(content);
          } else {
            reject(new Error((parsed.error && parsed.error.message) || parsed.message || `HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error('DashScope 响应解析失败'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(new Error('DashScope 请求超时')); });
    req.write(bodyStr);
    req.end();
  });
}

/** 兜底：关键词规则解析（AI 调用失败时使用），工种输出与生产库枚举对齐 */
function fallbackParseNeeds(text) {
  const t = String(text || '');
  const needs = { jobType: null, city: null, nativePlace: null, level: null, priceMax: null, ageMin: null, ageMax: null, skills: [], keywords: [], summary: t.slice(0, 60) };

  // 注意匹配顺序：更具体的场景优先，白班/住家变体先于泛化词
  if (/月嫂/.test(t)) needs.jobType = 'yuesao';
  else if (/护工|医院|病床|住院/.test(t)) needs.jobType = 'hugong';
  else if (/陪诊|陪.*看病|陪护/.test(t)) needs.jobType = 'peiban';
  else if (/家教|辅导作业|辅导功课|补课/.test(t)) needs.jobType = 'jiajiao';
  else if (/白班育儿嫂|白班.{0,4}育儿|不住家.{0,4}育儿/.test(t)) needs.jobType = 'baiban-yuer';
  else if (/白班保姆|白班.{0,4}保姆|不住家.{0,4}保姆/.test(t)) needs.jobType = 'baiban-baomu';
  else if (/小时工|钟点|保洁|接送|做饭/.test(t)) needs.jobType = 'xiaoshi';
  else if (/育儿嫂|育儿|带娃|看孩子/.test(t)) needs.jobType = 'zhujia-yuer';
  else if (/护老|养老|照顾老人/.test(t)) needs.jobType = 'zhujia-hulao';
  else if (/保姆|家政/.test(t)) needs.jobType = 'zhujia-baomu';

  const levelMap = { 初级: 'junior', 银牌: 'silver', 金牌: 'gold', 铂金: 'platinum', 钻石: 'diamond', 皇冠: 'crown' };
  Object.keys(levelMap).forEach((k) => { if (t.includes(k)) needs.level = levelMap[k]; });

  // 预算：优先"7000元/块"；其次"7000的"（口语："找个7000的育儿嫂"）
  let priceMatch = t.match(/(\d{3,6})\s*(元|块)/);
  if (!priceMatch) priceMatch = t.match(/(\d{4,6})\s*(?=的)/);
  if (priceMatch) needs.priceMax = Number(priceMatch[1]);

  const ageMatch = t.match(/(\d{2})\s*[-~到至]\s*(\d{2})\s*岁/);
  if (ageMatch) {
    needs.ageMin = Number(ageMatch[1]);
    needs.ageMax = Number(ageMatch[2]);
  }

  const skillWords = ['早教', '做饭', '中餐', '西餐', '面食', '催乳', '辅食', '营养', '收纳', '按摩', '开车', '驾驶', '外语', '双胎'];
  needs.skills = skillWords.filter((w) => t.includes(w));

  // 静态同义词扩展：命中技能词时追加简历里常见的同义/近义表达（与 prompt 里的 AI 扩展指令对应）
  const SKILL_SYNONYMS = {
    辅食: ['营养配餐', '宝宝餐'],
    早教: ['智力开发', '启蒙'],
    催乳: ['通乳', '开奶'],
    收纳: ['整理收纳', '家务整理'],
    做饭: ['家常菜', '烹饪'],
    按摩: ['推拿', '产后修复'],
  };
  needs.skills.forEach((w) => {
    (SKILL_SYNONYMS[w] || []).forEach((syn) => {
      if (!needs.skills.includes(syn)) needs.skills.push(syn);
    });
  });

  const provinces = ['北京', '上海', '天津', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆'];
  const hitProvince = provinces.find((p) => t.includes(p));
  if (hitProvince) {
    // 区分 籍贯（nativePlace）与 工作城市（city）：
    // 带"籍贯/老家"或"XX人"表述 → 籍贯；
    // 否则按省份纠正规则同样落 nativePlace（业务上阿姨都在本地北京服务，
    // 客户说省份 99% 是籍贯诉求；直辖市才不会走到这里，集合内只有省/自治区）
    const isNative = t.includes('籍贯') || t.includes('老家') || t.includes(`${hitProvince}人`);
    if (isNative) needs.nativePlace = hitProvince;
    else if (PROVINCE_SHORT_NAMES.includes(hitProvince)) needs.nativePlace = hitProvince;
    else needs.city = hitProvince; // 仅直辖市（北京/上海/天津/重庆）落 city
  }

  return needs;
}

// 需求解析输出契约：与后端 MatchNeedsDto 白名单严格对齐，只输出这 10 个字段
// （后端白名单校验：多余字段 400、缺失字段静默丢条件，禁止 budget/region/province 等漂移字段名）
const NEEDS_OUTPUT_FIELDS = ['jobType', 'city', 'nativePlace', 'level', 'priceMax', 'ageMin', 'ageMax', 'skills', 'keywords', 'summary'];

// 23 省 + 5 自治区短名（不含 4 直辖市；与小程序端 needs-sanitize.js 保持一致）
const PROVINCE_SHORT_NAMES = [
  '黑龙江', '吉林', '辽宁', '河北', '山西', '陕西', '甘肃', '青海',
  '山东', '河南', '湖北', '湖南', '江苏', '浙江', '安徽', '江西',
  '福建', '广东', '海南', '四川', '贵州', '云南', '台湾',
  '内蒙古', '广西', '西藏', '宁夏', '新疆',
];

// 省级关键词归一：去掉 省/市/自治区 等后缀（"黑龙江省"→"黑龙江"）
function normalizeProvinceKeyword(v) {
  if (!v) return null;
  let s = String(v).trim();
  if (!s || s === 'null') return null;
  s = s.replace(/(壮族自治区|回族自治区|维吾尔自治区|自治区|省|市|特别行政区)$/, '');
  return s ? s.slice(0, 10) : null;
}

function normalizeNeeds(raw) {
  const jobType = VALID_JOB_TYPES.includes(raw.jobType) ? raw.jobType : null;
  const level = VALID_LEVELS.includes(raw.level) ? raw.level : null;
  const toNum = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
  // 别名归一：即使 LLM 偶发字段名漂移，也在服务端兜底归一到契约字段
  const priceRaw = [raw.priceMax, raw.budget, raw.price, raw.salary, raw.maxPrice]
    .find((v) => v !== null && v !== undefined && v !== '');
  const nativeRaw = [raw.nativePlace, raw.region, raw.province, raw.birthplace, raw.origin]
    .find((v) => v !== null && v !== undefined && v !== '');
  const out = {
    jobType,
    city: raw.city && raw.city !== 'null' ? String(raw.city).trim() : null,
    nativePlace: normalizeProvinceKeyword(nativeRaw),
    level,
    priceMax: toNum(priceRaw),
    ageMin: toNum(raw.ageMin),
    ageMax: toNum(raw.ageMax),
    skills: Array.isArray(raw.skills) ? raw.skills.filter(Boolean).map(String) : [],
    keywords: Array.isArray(raw.keywords) ? raw.keywords.filter(Boolean).map(String) : [],
    summary: raw.summary ? String(raw.summary).slice(0, 100) : '',
  };

  // 省份纠正（双保险，与小程序端 needs-sanitize.js 同一条规则）：
  // LLM 偶发把"黑龙江的育儿嫂"的省份塞进 city（籍贯错塞工作城市，后端无法触发籍贯封顶）。
  // 业务上阿姨都在本地（北京）服务，客户说省份 99% 是籍贯诉求 →
  // nativePlace 为空且 city 去后缀后命中省级短名时，移正到 nativePlace。
  // 直辖市（北京/上海/天津/重庆）不在集合内，保持 city；地级市（杭州/成都）同理不动。
  if (!out.nativePlace && out.city) {
    const cityShort = normalizeProvinceKeyword(out.city);
    if (cityShort && PROVINCE_SHORT_NAMES.includes(cityShort)) {
      console.log(`[aiMatchService] city ${out.city} 纠正为 nativePlace（省份=籍贯诉求，非工作城市）`);
      out.nativePlace = cityShort;
      out.city = null;
    }
  }
  // 最终按契约白名单 pick，保证输出永远只含后端认可的 10 个字段
  const needs = {};
  NEEDS_OUTPUT_FIELDS.forEach((k) => { needs[k] = out[k] !== undefined ? out[k] : null; });
  needs.skills = out.skills;
  needs.keywords = out.keywords;
  return needs;
}

/**
 * parseNeeds 轻量频控：collection 'ai_parse_quota'，按 openid + 小时桶计数
 * 每小时最多 PARSE_QUOTA_PER_HOUR 次；集合不存在时首次 add 自动创建。
 * 实现原则：宁可放过不可误杀——存储异常时一律放行，不影响主流程。
 * @returns {Promise<{allowed: boolean, count?: number}>}
 */
async function hitParseQuota(openid) {
  if (!openid) return { allowed: true };
  const bucket = new Date().toISOString().slice(0, 13); // 小时桶，如 2026-07-22T08
  const docId = `${openid}_${bucket}`;
  const col = db.collection('ai_parse_quota');
  try {
    const r = await col.where({ _id: docId }).limit(1).get();
    const rec = r.data && r.data[0];
    if (!rec) {
      await col.add({ data: { _id: docId, openid, hour: bucket, count: 1, updatedAt: new Date() } });
      return { allowed: true, count: 1 };
    }
    if ((rec.count || 0) >= PARSE_QUOTA_PER_HOUR) {
      console.warn('[aiMatchService] 频控拦截, openid:', openid, 'bucket:', bucket, 'count:', rec.count);
      return { allowed: false, count: rec.count };
    }
    await col.doc(docId).update({ data: { count: db.command.inc(1), updatedAt: new Date() } });
    return { allowed: true, count: (rec.count || 0) + 1 };
  } catch (e) {
    // 集合不存在（首次调用）等异常：尝试直接建档，失败则放行
    console.warn('[aiMatchService] 频控存储异常（放行）:', e.message);
    try {
      await col.add({ data: { _id: docId, openid, hour: bucket, count: 1, updatedAt: new Date() } });
      return { allowed: true, count: 1 };
    } catch (e2) {
      return { allowed: true };
    }
  }
}

/** 通用 CRM POST（固定 crm.andejiazheng.com，带内部令牌） */
function crmPost(path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname: CRM_HOSTNAME,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // /api/resumes/match/event 是公开接口，不带令牌也可；多带无害
        'x-internal-token': CRM_INTERNAL_TOKEN,
      },
    };
    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
        } catch (e) {
          reject(new Error('响应解析失败'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(new Error('CRM 请求超时')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * 2.7 事件转发：小程序 AI 匹配页行为埋点 → CRM /api/resumes/match/event
 * 失败不抛错，返回 success:false（前端静默处理）
 */
async function trackEvent(event) {
  const { customerPhone, resumeId, event: evt, needsSummary } = event;

  if (!resumeId) return { success: false, errMsg: '缺少 resumeId' };
  if (!VALID_TRACK_EVENTS.includes(evt)) {
    return { success: false, errMsg: `非法 event: ${evt}，允许值: ${VALID_TRACK_EVENTS.join('/')}` };
  }

  const body = { resumeId: String(resumeId), event: evt };
  if (customerPhone) body.customerPhone = String(customerPhone);
  if (needsSummary) body.needsSummary = String(needsSummary).slice(0, 200);

  try {
    const res = await crmPost('/api/resumes/match/event', body);
    return { success: !!(res && res.success) };
  } catch (e) {
    console.warn('[aiMatchService] trackEvent 转发失败（静默）:', e.message);
    return { success: false, errMsg: e.message };
  }
}

exports.main = async (event = {}) => {
  const action = event.action || '';
  try {
    if (action === 'parseNeeds') {
      // L13 防护：服务端截断 300 字（超长直接截断，不报错）
      const text = String(event.text || '').trim().slice(0, PARSE_TEXT_MAX_LEN);
      if (!text) return { success: false, errMsg: 'MISSING_TEXT' };

      // L13 防护：按 openid 每小时 20 次轻量频控
      const { OPENID } = cloud.getWXContext();
      const quota = await hitParseQuota(OPENID);
      if (!quota.allowed) {
        return { success: false, errMsg: '操作太频繁，请稍后再试', meta: { version: VERSION } };
      }

      try {
        const { needs, channel, model } = await parseNeedsByAI(text);
        return { success: true, data: needs, meta: { version: VERSION, source: 'ai', channel, model } };
      } catch (e) {
        console.warn('[aiMatchService] AI 解析失败，走兜底方案:', e && e.message);
        const needs = fallbackParseNeeds(text);
        return { success: true, data: needs, meta: { version: VERSION, source: 'fallback', channel: 'fallback' } };
      }
    }
    if (action === 'trackEvent') {
      // 事件转发不需要频控
      return await trackEvent(event);
    }
    if (action === 'version') {
      return {
        success: true,
        VERSION,
        parseModel: PARSE_MODEL,
        wxFallbackModel: WX_PARSE_MODEL,
        dashscopeKeyConfigured: !!process.env.DASHSCOPE_API_KEY,
      };
    }
    return { success: false, errMsg: 'unknown action', meta: { version: VERSION } };
  } catch (e) {
    return { success: false, errMsg: (e && e.message) || String(e), meta: { version: VERSION } };
  }
};
