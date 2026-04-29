const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 工种映射（与简历端保持一致）
const JOB_TYPE_LABELS = {
  yuexin: '月嫂',
  yuying: '育儿嫂',
  baomu: '保姆',
  huli: '护老/陪护',
};

// 题型分布：硬件 4 + 技能 18 + 心理 8 = 30
const SECTION_SPEC = [
  { key: 'hardware',    label: '硬件条件', count: 4  },
  { key: 'skill',       label: '技能条件', count: 18 },
  { key: 'personality', label: '心理素质', count: 8  },
];
const TOTAL_QUESTIONS = SECTION_SPEC.reduce((s, x) => s + x.count, 0);

// 模块加权（100 分制）：硬件 20 / 技能 60 / 心理 20
// 每个模块内部题题等权（0~10 分），模块得分按下方权重折算到 100 分
const SECTION_WEIGHTS = { hardware: 20, skill: 60, personality: 20 };

// ── 薪资矩阵（北京基准；其他城市按系数折算）────────────────
// 数字与小程序报价页（maternityPricing/childcarePricing/nannyPricing/eldercarePricing）一一对齐
// 月嫂按"元/26天单"，其他工种按"元/月"
const SALARY_UNIT = {
  yuexin: '元/单',
  yuying: '元/月',
  baomu:  '元/月',
  huli:   '元/月',
};
// 测评 5 级（初级/中级/高级/金牌/钻石，按分数档）→ 实际行情映射：
// 月嫂：7000-9000 起步，向上延伸至报价页顶 22000
// 育儿嫂：6000-7000 起，每档 +1000（5 档铺到 11000）
// 保姆：报价页 3 档（铜/金/皇冠 = 6000-7500/7500-10000/10000+）按 5 档展开
// 护老：自理 4500-5000 / 半自理 5500-6000 / 不自理 6000+，按测评级别向上扩展
const SALARY_MATRIX_BJ = {
  yuexin: { 初级: [7000, 9000],   中级: [9000, 12000],  高级: [12000, 15000], 金牌: [15000, 18000], 钻石: [18000, 22000] },
  yuying: { 初级: [6000, 7000],   中级: [7000, 8000],   高级: [8000, 9000],   金牌: [9000, 10000],  钻石: [10000, 11000] },
  baomu:  { 初级: [6000, 7000],   中级: [7000, 8000],   高级: [8000, 9500],   金牌: [9500, 11500],  钻石: [11500, 14000] },
  huli:   { 初级: [4500, 5000],   中级: [5500, 6000],   高级: [6000, 7000],   金牌: [7000, 8500],   钻石: [8500, 10000]  },
};
// 城市分档：一线 1.0 / 新一线 0.85 / 其他 0.7
const TIER1_CITIES = ['北京', '上海', '深圳', '广州'];
const TIER15_CITIES = ['杭州', '成都', '苏州', '南京', '武汉', '天津', '重庆', '西安', '长沙', '东莞', '佛山', '宁波', '青岛'];
function getCityCoef(city) {
  if (!city) return 0.85;
  const c = String(city).trim();
  if (TIER1_CITIES.some(k => c.includes(k))) return 1.0;
  if (TIER15_CITIES.some(k => c.includes(k))) return 0.85;
  return 0.7;
}
function getCityTierLabel(coef) {
  return coef === 1.0 ? '一线' : coef === 0.85 ? '新一线' : '其他';
}
// 给定工种 + 等级 + 城市，返回该档薪资区间（已按城市系数调整、整百取整）
function getSalaryRange(jobType, level, city) {
  const matrix = SALARY_MATRIX_BJ[jobType];
  const unit = SALARY_UNIT[jobType] || '元/月';
  if (!matrix || !matrix[level]) return { min: 0, max: 0, unit };
  const coef = getCityCoef(city);
  const [bjMin, bjMax] = matrix[level];
  const round = (n) => Math.round(n * coef / 100) * 100;
  return { min: round(bjMin), max: round(bjMax), unit };
}
// 渲染该工种全档行情（已按城市系数调整），用于喂给 AI 当参考
function renderSalaryMatrixForAI(jobType, city) {
  const matrix = SALARY_MATRIX_BJ[jobType];
  if (!matrix) return '';
  const unit = SALARY_UNIT[jobType] || '元/月';
  const coef = getCityCoef(city);
  const round = (n) => Math.round(n * coef / 100) * 100;
  return ['初级', '中级', '高级', '金牌', '钻石'].map(lv => {
    const [bjMin, bjMax] = matrix[lv];
    return `${lv}：${round(bjMin)}-${round(bjMax)} ${unit}`;
  }).join('；');
}

async function safeCreateCollection(name) {
  try { await db.createCollection(name); } catch (e) { /* ignore */ }
}
async function ensureCollections() {
  await Promise.all([
    safeCreateCollection('salary_assessment_questions'),
    safeCreateCollection('salary_assessments'),
    safeCreateCollection('salary_question_bank'),
  ]);
}

// ── 工具：当日 dateKey（北京时间，UTC+8）─────────────────────
function todayKey() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── 工具：从 AI 回复里抽出第一段 JSON（兼容 ```json 代码块）──
function extractJson(text) {
  if (!text) return null;
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : text;
  // 找到第一个 { 或 [ 到最后一个 } 或 ]
  const startObj = candidate.indexOf('{');
  const startArr = candidate.indexOf('[');
  let start = -1;
  if (startObj === -1) start = startArr;
  else if (startArr === -1) start = startObj;
  else start = Math.min(startObj, startArr);
  if (start === -1) return null;
  const endObj = candidate.lastIndexOf('}');
  const endArr = candidate.lastIndexOf(']');
  const end = Math.max(endObj, endArr);
  if (end === -1) return null;
  const slice = candidate.slice(start, end + 1);
  try { return JSON.parse(slice); } catch (e) { return null; }
}

function httpsPostJson(host, path, headers, bodyObj, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(bodyObj);
    const req = https.request({
      host, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
      timeout: timeoutMs,
    }, (res) => {
      let chunks = '';
      res.on('data', (d) => { chunks += d.toString('utf8'); });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(chunks)); } catch (e) { reject(new Error('AI 响应解析失败: ' + chunks.slice(0, 200))); }
        } else {
          reject(new Error(`AI HTTP ${res.statusCode}: ${chunks.slice(0, 300)}`));
        }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('AI 请求超时')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── AI 调用封装：豆包 doubao-seed-2-0-mini（thinking:disabled，5-10s 出报告）──
// API Key 必须通过云函数环境变量 ARK_API_KEY 注入，未设置则报错
const DOUBAO_HOST  = 'ark.cn-beijing.volces.com';
const DOUBAO_PATH  = '/api/v3/chat/completions';
const DOUBAO_MODEL = 'doubao-seed-2-0-mini-260215';

async function callDoubaoAI(prompt, maxTokens = 1200, temperature = 0.5) {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) throw new Error('未配置 ARK_API_KEY 环境变量');

  const t0 = Date.now();
  console.log(`[callDoubaoAI] →  prompt=${prompt.length} chars, maxTokens=${maxTokens}`);
  const resp = await httpsPostJson(DOUBAO_HOST, DOUBAO_PATH, {
    Authorization: `Bearer ${apiKey}`,
  }, {
    model: DOUBAO_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature,
    thinking: { type: 'disabled' },
  }, 30000);
  console.log(`[callDoubaoAI] ←  ${Date.now() - t0}ms, usage=${JSON.stringify(resp && resp.usage)}`);

  const choice = ((resp && resp.choices) || [])[0];
  let text = (choice && choice.message && choice.message.content) || '';
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return text;
}

// ── section 中文 label（评分 prompt 渲染用）──────────────
const SECTION_LABEL = { hardware: '硬件条件', skill: '技能条件', personality: '心理素质' };

// ── 评分 Prompt（完整版：30 题全部喂给 AI 做综合评价）──
function buildEvaluatePrompt(jobType, basicInfo, qa, sectionScores) {
  const jobLabel = JOB_TYPE_LABELS[jobType] || jobType;

  // 按模块分组，逐题列出：题干 + 阿姨选了什么 + 满分答案 + 得分
  const bySection = { hardware: [], skill: [], personality: [] };
  qa.forEach(item => { if (bySection[item.section]) bySection[item.section].push(item); });

  const renderSection = (sec) => {
    const arr = bySection[sec] || [];
    if (!arr.length) return '';
    const lines = arr.map((it, i) => {
      const correct = it.score === it.maxScore;
      const flag = correct ? '✓' : '✗';
      const sameAsBest = it.selectedText === it.bestText;
      const bestLine = sameAsBest ? '' : `\n   满分答案：${it.bestText}（${it.maxScore}分）`;
      return `${i + 1}. ${flag} ${it.question}\n   阿姨选：${it.selectedText}（得${it.score}/${it.maxScore}）${bestLine}`;
    });
    return `\n【${SECTION_LABEL[sec]}】\n${lines.join('\n')}`;
  };

  const fullQA = renderSection('hardware') + renderSection('skill') + renderSection('personality');

  // 行情参考（已按城市分档调整）
  const city = basicInfo.city || '';
  const coef = getCityCoef(city);
  const tierLabel = getCityTierLabel(coef);
  const unit = SALARY_UNIT[jobType] || '元/月';
  const matrixLine = renderSalaryMatrixForAI(jobType, city);
  const unitNote = jobType === 'yuexin' ? '（月嫂按 26 天/单计酬，不是月薪）' : '';

  return `你叫"李老师"，中国家政行业 15 年资深培训师，给「${jobLabel}」做能力评估，语气专业温暖直接。

【应聘者】${basicInfo.name || '—'}，${basicInfo.age || '—'}岁，从业${basicInfo.experienceYears || '—'}年，${basicInfo.education || '—'}，${city || '—'}

【得分（百分制；权重 硬件${SECTION_WEIGHTS.hardware}/技能${SECTION_WEIGHTS.skill}/心理${SECTION_WEIGHTS.personality}）】
硬件 ${sectionScores.hardwareWeighted}/${SECTION_WEIGHTS.hardware}｜技能 ${sectionScores.skillWeighted}/${SECTION_WEIGHTS.skill}｜心理 ${sectionScores.personalityWeighted}/${SECTION_WEIGHTS.personality}｜综合 ${sectionScores.percent}/100

【完整答题（✓正确 / ✗错误或部分正确）】${fullQA}

【${tierLabel}城市「${jobLabel}」薪资行情参考${unitNote}】
${matrixLine}

基于以上完整答题情况和行情参考，做综合评价：
- strengths 要从答对的题里抽提她真正掌握的能力点（不是泛泛而谈）
- improvements 要点名她答错的具体知识点/场景，越具体越好
- advice 针对最严重的 1~2 个短板给可执行的提升路径
- salaryRange 必须落在上面行情区间附近：先按 level 取该档区间作为基准，再根据她具体答题的强项/短板在 ±15% 内浮动；不得超出"初级下限 ~ 钻石上限"。单位用「${unit}」
- salaryReasoning 一句话讲清楚为什么是这个数（例如"虽属初级但新生儿急救题答对，建议谈到初级偏上"）

【严格输出 JSON，不要 markdown、不要 <think>、不要任何额外文字】
{"totalScore":${sectionScores.percent},"level":"初级|中级|高级|金牌|钻石","levelDesc":"一句话","strengths":["优势1","优势2","优势3"],"improvements":["待提升1","待提升2","待提升3"],"salaryRange":{"min":0,"max":0,"unit":"${unit}"},"salaryReasoning":"一句话","marketComparison":"一句话讲与该城市该工种平均水平的差距","advice":"以'我'的口吻给 1~2 条具体建议，200 字内"}

规则：level 五选一（80+ 至少高级，90+ 才给金牌/钻石）；salaryRange 整百元、必须在行情参考范围内；strengths/improvements 各 3 条贴答题、不套话。`;
}

// ── 工具：洗牌（Fisher-Yates）─────────────────────────────
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── 子分类常量（与 docs/工资测评题库建设.md 保持一致）─────────
const HARDWARE_SUBS    = ['年龄家庭', '工龄经历', '学历语言', '证书资质', '健康体能'];
const PERSONALITY_SUBS = ['服务心态', '沟通', '抗压', '职业道德', '稳定性'];
const SKILL_SUBS = {
  yuexin: ['产妇护理', '月子餐', '新生儿护理', '应急与异常观察'],
  yuying: ['生活照料', '保健与疾病护理', '早教与发展', '安全与应急'],
  baomu:  ['家庭烹饪', '清洁整理', '衣物护理', '家电与用火用气安全'],
  huli:   ['生活照护', '基础照护与慢病', '康复与失智照护', '应急与消防安全'],
};

// 经验年限 → 技能 18 题难度配额（easy + medium + hard = 18）
function getSkillDifficultyQuota(years) {
  const y = Number(years) || 0;
  if (y <= 2)  return { easy: 11, medium: 5, hard: 2  };
  if (y <= 5)  return { easy: 5,  medium: 9, hard: 4  };
  if (y <= 10) return { easy: 3,  medium: 8, hard: 7  };
  return           { easy: 2,  medium: 6, hard: 10 };
}

// Round-robin：把 total 个名额分配给 K 个子项（先洗牌再循环填充）
function distributeRoundRobin(subs, total) {
  const arr = shuffle(subs);
  const result = {};
  arr.forEach(s => { result[s] = 0; });
  for (let i = 0; i < total; i++) {
    result[arr[i % arr.length]] += 1;
  }
  return result;
}

// ── 题库内存缓存（按 jobType 缓存全量，TTL 10 分钟）──────────
// 冷启动一次拉全量 ~500 条到模块作用域，热启动直接 JS 内随机抽样
// 每次抽题省去 ~12 个 aggregate.sample 查询，单次 getQuestions 从 ~500ms 降到 ~50ms
const BANK_CACHE = {};
const BANK_CACHE_TTL_MS = 10 * 60 * 1000;
const BANK_PAGE_SIZE = 100;

async function loadBankPool(jobType) {
  let all = [];
  let skip = 0;
  while (skip < 2000) {
    const r = await db.collection('salary_question_bank')
      .where({ jobType })
      .skip(skip).limit(BANK_PAGE_SIZE)
      .get();
    const list = (r && r.data) || [];
    all = all.concat(list);
    if (list.length < BANK_PAGE_SIZE) break;
    skip += BANK_PAGE_SIZE;
  }
  return all;
}

async function getBankPool(jobType) {
  const cached = BANK_CACHE[jobType];
  if (cached && (Date.now() - cached.ts) < BANK_CACHE_TTL_MS) return cached.data;
  const data = await loadBankPool(jobType);
  BANK_CACHE[jobType] = { data, ts: Date.now() };
  return data;
}

// 兼容 yuexin 历史数据"证书" vs 新版"证书资质"
function subsectionMatches(qSub, wanted) {
  if (wanted === '证书资质' || wanted === '证书') {
    return qSub === '证书资质' || qSub === '证书';
  }
  return qSub === wanted;
}

// 单桶抽样（内存版）：从 pool 里筛选符合条件的题再随机取 n 道
function sampleBucket(pool, section, extra, n) {
  if (n <= 0) return [];
  const filtered = pool.filter(q => {
    if (q.section !== section) return false;
    if (extra && extra.subsection && !subsectionMatches(q.subsection, extra.subsection)) return false;
    if (extra && extra.difficulty && q.difficulty !== extra.difficulty) return false;
    return true;
  });
  return shuffle(filtered).slice(0, n);
}

// 兜底补齐：从同 section 全池随机补 deficit 道（去重已抽到的 _id）
function fillDeficit(pool, section, picked, target) {
  if (picked.length >= target) return picked.slice(0, target);
  const have = new Set(picked.map(x => x._id));
  const candidates = pool.filter(q => q.section === section && !have.has(q._id));
  return picked.concat(shuffle(candidates).slice(0, target - picked.length));
}

// ── action: getQuestions —— 智能抽 30 题 ────────────────────
// 抽样策略：
//   硬件 4：从 5 子项随机选 4 个，每子项抽 1 道
//   技能 18：按 experienceYears 落难度档（11/5/2 → 5/9/4 → 3/8/7 → 2/6/10），
//            每档内 4 国标专项 round-robin
//   心理 8：5 子类按 round-robin 分配（自然得 2+2+2+1+1）
async function getQuestions(jobType, assessmentId) {
  if (!JOB_TYPE_LABELS[jobType]) throw new Error('invalid jobType');
  if (!SKILL_SUBS[jobType]) throw new Error('invalid jobType (no skill subs)');
  await ensureCollections();

  // 读 experienceYears 用于难度落档；缺失则按 0 年（最易档）
  let experienceYears = 0;
  if (assessmentId) {
    try {
      const recRes = await db.collection('salary_assessments').doc(assessmentId).get();
      if (recRes && recRes.data) experienceYears = Number(recRes.data.experienceYears) || 0;
    } catch (e) { /* ignore */ }
  }

  // 加载题库到内存（首次冷启动 ~500ms 拉全量，之后 10 分钟内热启动直接 ~0ms）
  const pool = await getBankPool(jobType);

  // ① 硬件：5 子项随机选 4 个，每子项 1 道
  const hwSubs = shuffle(HARDWARE_SUBS).slice(0, 4);
  let hwArr = [];
  hwSubs.forEach(sub => {
    hwArr = hwArr.concat(sampleBucket(pool, 'hardware', { subsection: sub }, 1));
  });

  // ② 心理：5 子类 round-robin 分配 8 道（自然得 2+2+2+1+1）
  const psyDist = distributeRoundRobin(PERSONALITY_SUBS, 8);
  let perArr = [];
  Object.entries(psyDist).forEach(([sub, n]) => {
    if (n > 0) perArr = perArr.concat(sampleBucket(pool, 'personality', { subsection: sub }, n));
  });

  // ③ 技能：难度落档 + 4 专项 round-robin
  const skillSubs = SKILL_SUBS[jobType];
  const quota = getSkillDifficultyQuota(experienceYears);
  let skillArr = [];
  Object.entries(quota).forEach(([diff, totalN]) => {
    if (totalN <= 0) return;
    const dist = distributeRoundRobin(skillSubs, totalN);
    Object.entries(dist).forEach(([sub, n]) => {
      if (n > 0) skillArr = skillArr.concat(
        sampleBucket(pool, 'skill', { subsection: sub, difficulty: diff }, n)
      );
    });
  });

  // ④ 兜底补齐：某桶题数不够（罕见）从同 section 池补足
  hwArr    = fillDeficit(pool, 'hardware',    hwArr,    4);
  skillArr = fillDeficit(pool, 'skill',       skillArr, 18);
  perArr   = fillDeficit(pool, 'personality', perArr,   8);
  if (hwArr.length < 4 || skillArr.length < 18 || perArr.length < 8) {
    throw new Error('题库题数不足，无法组卷');
  }

  // ⑤ 选项打乱 + 分配 ABCD + 题目 id
  let idx = 0;
  const compose = (items) => items.map(it => {
    idx += 1;
    const opts = shuffle(it.options).map((o, i) => ({
      label: ['A', 'B', 'C', 'D'][i],
      text: o.text,
      score: Number(o.score) || 0,
    }));
    return {
      id: `q${idx}`,
      type: it.type || (opts.length === 2 ? 'judge' : 'choice'),
      section: it.section,
      question: it.question,
      options: opts,
    };
  });
  const questions = [
    ...compose(hwArr),
    ...compose(skillArr),
    ...compose(perArr),
  ];

  if (assessmentId) {
    try {
      await db.collection('salary_assessments').doc(assessmentId).update({
        data: { pickedQuestions: questions, pickedAt: db.serverDate() },
      });
    } catch (e) { /* ignore */ }
  }
  return { questions };
}

// ── action: getBankStats —— 看每个 (工种,section) 题库当前数量 ─
async function getBankStatsAction() {
  await ensureCollections();
  const stats = {};
  for (const jt of Object.keys(JOB_TYPE_LABELS)) {
    stats[jt] = {};
    for (const s of SECTION_SPEC) {
      const r = await db.collection('salary_question_bank')
        .where({ jobType: jt, section: s.key }).count();
      stats[jt][s.key] = r.total;
    }
  }
  // 目标：与本地题库实际产出对齐（硬件 30 / 技能 320 / 心理 150）
  return { stats, target: { hardware: 30, skill: 320, personality: 150 } };
}

// ── action: start —— 开始测评：登记简历线索 ─────────────────
async function startAssessment(openid, ev) {
  if (!ev || !ev.basicInfo) throw new Error('missing basicInfo');
  const b = ev.basicInfo;
  if (!b.name || !b.phone || !b.jobType) throw new Error('name/phone/jobType required');
  if (!JOB_TYPE_LABELS[b.jobType]) throw new Error('invalid jobType');
  await ensureCollections();

  const sourceStaff = ev.sourceStaff || {};
  const doc = {
    openid: openid || '',
    name: String(b.name).trim(),
    phone: String(b.phone).trim(),
    jobType: b.jobType,
    age: b.age != null ? Number(b.age) : null,
    experienceYears: b.experienceYears != null ? Number(b.experienceYears) : null,
    education: b.education || '',
    city: b.city || '',
    sourceStaffId: String(sourceStaff.id || ''),
    sourceStaffPhone: String(sourceStaff.phone || ''),
    sourceStaffName: String(sourceStaff.name || ''),
    sourceStaffAvatar: String(sourceStaff.avatar || ''),
    sourceStaffCompany: String(sourceStaff.company || ''),
    status: 'in_progress',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };

  // 同 openid + 同手机号 + 同工种当日已有未完成记录则复用，避免重复创建
  try {
    const exist = await db.collection('salary_assessments').where({
      openid, phone: doc.phone, jobType: doc.jobType, status: 'in_progress',
    }).orderBy('createdAt', 'desc').limit(1).get();
    if (exist.data && exist.data[0]) {
      const id = exist.data[0]._id;
      await db.collection('salary_assessments').doc(id).update({ data: {
        ...doc, createdAt: exist.data[0].createdAt, updatedAt: db.serverDate(),
      }});
      return { assessmentId: id, dateKey: todayKey() };
    }
  } catch (e) { /* ignore */ }

  const add = await db.collection('salary_assessments').add({ data: doc });
  return { assessmentId: add._id, dateKey: todayKey() };
}


// ── 计算各 section 的实际得分（模块加权 100 分制）────────────
function computeSectionScores(questions, answers) {
  const map = {};
  questions.forEach(q => { map[q.id] = q; });
  const stat = {
    hardware: { score: 0, max: 0 },
    skill: { score: 0, max: 0 },
    personality: { score: 0, max: 0 },
  };
  const qa = [];
  answers.forEach(a => {
    const q = map[a.id];
    if (!q || !stat[q.section]) return;
    const opt = q.options.find(o => o.label === a.label) || null;
    const score = opt ? Number(opt.score) || 0 : 0;
    const maxScore = Math.max(...q.options.map(o => Number(o.score) || 0));
    const bestOpt = q.options.find(o => (Number(o.score) || 0) === maxScore) || null;
    stat[q.section].score += score;
    stat[q.section].max += maxScore;
    qa.push({
      id: q.id,
      section: q.section,
      question: q.question,
      selectedLabel: a.label,
      selectedText: opt ? opt.text : '',
      bestText: bestOpt ? bestOpt.text : '',
      score,
      maxScore,
    });
  });
  // 各模块完成率（0~1）
  const hwPct  = stat.hardware.max    > 0 ? stat.hardware.score    / stat.hardware.max    : 0;
  const skPct  = stat.skill.max       > 0 ? stat.skill.score       / stat.skill.max       : 0;
  const psyPct = stat.personality.max > 0 ? stat.personality.score / stat.personality.max : 0;
  // 加权得分（保留 1 位小数）
  const hardwareWeighted    = Math.round(hwPct  * SECTION_WEIGHTS.hardware    * 10) / 10;
  const skillWeighted       = Math.round(skPct  * SECTION_WEIGHTS.skill       * 10) / 10;
  const personalityWeighted = Math.round(psyPct * SECTION_WEIGHTS.personality * 10) / 10;
  // 百分制总分（四舍五入到整数）
  const percent = Math.round(
    hwPct  * SECTION_WEIGHTS.hardware
    + skPct  * SECTION_WEIGHTS.skill
    + psyPct * SECTION_WEIGHTS.personality
  );
  // 原始合计（仅参考，AI 不再用）
  const total = stat.hardware.score + stat.skill.score + stat.personality.score;
  const totalMax = stat.hardware.max + stat.skill.max + stat.personality.max;
  return {
    hardware: stat.hardware.score, hardwareMax: stat.hardware.max,
    skill: stat.skill.score,       skillMax: stat.skill.max,
    personality: stat.personality.score, personalityMax: stat.personality.max,
    hardwareWeighted, skillWeighted, personalityWeighted,
    weights: SECTION_WEIGHTS,
    total, totalMax, percent, qa,
  };
}

// ── 规则兜底：按工种 + 城市矩阵给等级、薪资、套话评语 ─────────
function buildFallbackResult(scores, reason, jobType, city) {
  const p = scores.percent;
  const level = p >= 90 ? '钻石' : p >= 80 ? '金牌' : p >= 70 ? '高级' : p >= 55 ? '中级' : '初级';
  const range = getSalaryRange(jobType, level, city);
  return {
    totalScore: p,
    level,
    levelDesc: `综合表现达到${level}阿姨水平`,
    strengths: ['答题完整、态度认真'],
    improvements: ['建议进一步补充证书和实战经验'],
    salaryRange: range,
    salaryReasoning: 'AI 报告生成中，先按行情档位给出参考。',
    marketComparison: '与该城市该工种平均水平相当',
    advice: 'AI 报告生成中，已先按答题得分给出参考结果，稍后会自动刷新。',
    _fallback: true,
    _fallbackReason: reason || '',
  };
}

// ── action: evaluate —— 仅算分 + 写兜底，立即返回（≤2s）──────
async function evaluateAssessment(openid, ev) {
  const { assessmentId, jobType, answers } = ev || {};
  if (!assessmentId) throw new Error('missing assessmentId');
  if (!JOB_TYPE_LABELS[jobType]) throw new Error('invalid jobType');
  if (!Array.isArray(answers) || !answers.length) throw new Error('missing answers');
  await ensureCollections();

  const recRes = await db.collection('salary_assessments').doc(assessmentId).get().catch(() => null);
  if (!recRes || !recRes.data) throw new Error('assessment not found');
  const record = recRes.data;
  if (record.openid && record.openid !== openid) throw new Error('permission denied');

  const questions = Array.isArray(record.pickedQuestions) ? record.pickedQuestions : [];
  if (questions.length !== TOTAL_QUESTIONS) {
    throw new Error('未找到本次测评的题目，请重新答题');
  }

  const scores = computeSectionScores(questions, answers);
  const fallback = buildFallbackResult(scores, 'pending', jobType, record.city);

  const sectionScores = {
    hardware: scores.hardware, hardwareMax: scores.hardwareMax,
    skill: scores.skill, skillMax: scores.skillMax,
    personality: scores.personality, personalityMax: scores.personalityMax,
    hardwareWeighted: scores.hardwareWeighted,
    skillWeighted: scores.skillWeighted,
    personalityWeighted: scores.personalityWeighted,
    weights: scores.weights,
    total: scores.total, totalMax: scores.totalMax, percent: scores.percent,
  };

  await db.collection('salary_assessments').doc(assessmentId).update({
    data: {
      answers,
      sectionScores,
      result: fallback,
      aiStatus: 'scoring',
      status: 'scoring',
      submittedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });

  return { assessmentId, sectionScores, result: fallback, aiStatus: 'scoring' };
}

// ── action: runAIEvaluation —— 真·AI 评估，由结果页独立触发 ──
async function runAIEvaluation(openid, ev) {
  const { assessmentId } = ev || {};
  if (!assessmentId) throw new Error('missing assessmentId');
  await ensureCollections();

  const recRes = await db.collection('salary_assessments').doc(assessmentId).get().catch(() => null);
  if (!recRes || !recRes.data) throw new Error('assessment not found');
  const record = recRes.data;
  if (record.openid && record.openid !== openid) throw new Error('permission denied');

  // 已完成且非 fallback，直接返回（幂等）
  if (record.status === 'completed' && record.result && !record.result._fallback) {
    return { assessmentId, sectionScores: record.sectionScores || null, result: record.result, aiStatus: 'completed' };
  }

  const questions = Array.isArray(record.pickedQuestions) ? record.pickedQuestions : [];
  const answers = Array.isArray(record.answers) ? record.answers : [];
  if (questions.length !== TOTAL_QUESTIONS || !answers.length) {
    throw new Error('测评未提交完整，无法生成 AI 报告');
  }
  const jobType = record.jobType;
  if (!JOB_TYPE_LABELS[jobType]) throw new Error('invalid jobType');

  const scores = computeSectionScores(questions, answers);
  const basicInfo = {
    name: record.name, age: record.age, experienceYears: record.experienceYears,
    education: record.education, city: record.city,
  };

  let aiResult = null;
  let lastErr = '';
  for (let attempt = 0; attempt < 2 && !aiResult; attempt++) {
    try {
      const text = await callDoubaoAI(buildEvaluatePrompt(jobType, basicInfo, scores.qa, scores), 1200, 0.5);
      aiResult = extractJson(text);
      if (!aiResult || typeof aiResult.totalScore !== 'number' || !aiResult.salaryRange) {
        aiResult = null;
        lastErr = 'AI 返回结构异常';
      }
    } catch (e) {
      lastErr = (e && e.message) || String(e);
    }
  }

  if (!aiResult) {
    aiResult = buildFallbackResult(scores, lastErr || 'AI unavailable', jobType, basicInfo.city);
  }

  await db.collection('salary_assessments').doc(assessmentId).update({
    data: {
      result: aiResult,
      aiStatus: aiResult._fallback ? 'failed' : 'completed',
      status: 'completed',
      completedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });

  return {
    assessmentId,
    sectionScores: record.sectionScores || null,
    result: aiResult,
    aiStatus: aiResult._fallback ? 'failed' : 'completed',
  };
}

// ── action: getResult —— 拉取测评结果（容忍 scoring 中状态）─
async function getResult(openid, ev) {
  const { assessmentId } = ev || {};
  if (!assessmentId) throw new Error('missing assessmentId');
  await ensureCollections();
  const recRes = await db.collection('salary_assessments').doc(assessmentId).get().catch(() => null);
  if (!recRes || !recRes.data) throw new Error('assessment not found');
  const record = recRes.data;
  if (record.openid && record.openid !== openid) throw new Error('permission denied');
  if (!record.result) throw new Error('assessment not completed');
  return {
    assessmentId,
    jobType: record.jobType,
    sectionScores: record.sectionScores || null,
    result: record.result,
    aiStatus: record.aiStatus || (record.status === 'completed' ? 'completed' : 'scoring'),
  };
}

// ── 入口 ───────────────────────────────────────────────────
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  try {
    switch (event.action) {
      case 'getQuestions': {
        const data = await getQuestions(event.jobType, event.assessmentId);
        return { success: true, data };
      }
      case 'start': {
        const data = await startAssessment(openid, event);
        return { success: true, data };
      }
      case 'evaluate': {
        const data = await evaluateAssessment(openid, event);
        return { success: true, data };
      }
      case 'runAIEvaluation': {
        const data = await runAIEvaluation(openid, event);
        return { success: true, data };
      }
      case 'getResult': {
        const data = await getResult(openid, event);
        return { success: true, data };
      }
      case 'getBankStats': {
        const data = await getBankStatsAction();
        return { success: true, data };
      }
      default:
        return { success: false, errMsg: 'unknown action' };
    }
  } catch (e) {
    console.error('[salaryAssessment]', event && event.action, e);
    return { success: false, errMsg: (e && e.message) || String(e) };
  }
};
