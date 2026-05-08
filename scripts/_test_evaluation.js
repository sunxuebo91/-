/* eslint-disable */
// AI 点评改造单元测试
// 通过 stub mock wx-server-sdk + https，把 index.js 内部纯函数挖出来测
// 用法：node scripts/_test_evaluation.js

const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'wx-server-sdk') return require.resolve('./_stubs/wx-server-sdk-stub.js');
  return origResolve.call(this, req, ...rest);
};

// 准备 stub
const fs = require('fs');
const path = require('path');
const stubDir = path.join(__dirname, '_stubs');
if (!fs.existsSync(stubDir)) fs.mkdirSync(stubDir);
fs.writeFileSync(path.join(stubDir, 'wx-server-sdk-stub.js'), `
module.exports = {
  DYNAMIC_CURRENT_ENV: 'dynamic',
  init: () => {},
  database: () => ({
    command: {},
    serverDate: () => new Date(),
    collection: () => ({ doc: () => ({ get: async () => ({}), update: async () => ({}) }), add: async () => ({ _id: 'x' }) }),
    createCollection: async () => {},
  }),
};
`);

// 把 index.js 的纯函数提取出来
const idx = path.join(__dirname, '..', 'cloudfunctions/salaryAssessment/index.js');
const src = fs.readFileSync(idx, 'utf8');

// 用 vm 跑加载（stub 已就位）
const code = `${src}; module.exports = { pickLevel, computeSectionScores, buildFallbackResult, buildEvaluatePrompt, LEVEL_THRESHOLDS };`;
const tmp = path.join(__dirname, '_stubs/_index_for_test.js');
fs.writeFileSync(tmp, code);
const lib = require(tmp);

let passed = 0, failed = 0;
function eq(actual, expected, name) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`); }
}
function ok(cond, name) { if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}`); } }

// ── Test 1：pickLevel 5 档边界值 ──────────────────
console.log('\n[Test 1] pickLevel 阈值边界');
eq(lib.pickLevel(0),  '初级', 'p=0');
eq(lib.pickLevel(49), '初级', 'p=49');
eq(lib.pickLevel(50), '中级', 'p=50（中级线）');
eq(lib.pickLevel(66), '中级', 'p=66');
eq(lib.pickLevel(67), '高级', 'p=67（高级线）');
eq(lib.pickLevel(77), '高级', 'p=77');
eq(lib.pickLevel(78), '金牌', 'p=78（金牌线）');
eq(lib.pickLevel(87), '金牌', 'p=87');
eq(lib.pickLevel(88), '钻石', 'p=88（钻石线）');
eq(lib.pickLevel(100), '钻石', 'p=100');
eq(lib.LEVEL_THRESHOLDS, { 钻石: 88, 金牌: 78, 高级: 67, 中级: 50 }, 'LEVEL_THRESHOLDS');

// ── Test 2：computeSectionScores 透传 v2 字段 ─────
console.log('\n[Test 2] qa 包含 v2 字段');
const v2Q = {
  id: 'q1', section: 'skill', subsection: '产妇护理', difficulty: 'easy',
  question: '产妇产后多久应鼓励主动排尿？',
  options: [
    { label: 'A', text: '4小时内', score: 10 },
    { label: 'B', text: '6小时内', score: 3 },
    { label: 'C', text: '12小时内', score: 0 },
    { label: 'D', text: '24小时内', score: 4 },
  ],
  explanation: '产后4小时内排尿可避免膀胱充盈影响子宫收缩。',
  source: '《产后康复指南》中华医学会',
};
const v1Q = {
  id: 'q2', section: 'skill',
  question: '产妇产后第一餐？',
  options: [
    { label: 'A', text: '小米粥', score: 10 },
    { label: 'B', text: '红烧肉', score: 0 },
    { label: 'C', text: '豆浆', score: 5 },
    { label: 'D', text: '冰水', score: 0 },
  ],
};
const scores = lib.computeSectionScores(
  [v2Q, v1Q],
  [{ id: 'q1', label: 'B' }, { id: 'q2', label: 'A' }]
);
eq(scores.qa[0].subsection, '产妇护理', 'v2 题 subsection 透传');
eq(scores.qa[0].difficulty, 'easy', 'v2 题 difficulty 透传');
ok(scores.qa[0].explanation.length > 0, 'v2 题 explanation 透传');
ok(scores.qa[0].source.length > 0, 'v2 题 source 透传');
eq(scores.qa[1].explanation, '', 'v1 题 explanation 空（向后兼容）');
eq(scores.qa[1].source, '', 'v1 题 source 空');

// ── Test 3：buildFallbackResult 利用 v2 错题 ─────
console.log('\n[Test 3] fallback 利用 v2 错题给具体反馈');
const fbScores = { percent: 49, qa: scores.qa };
const fb = lib.buildFallbackResult(fbScores, 'pending', 'yuexin', '北京');
eq(fb.level, '初级', 'level 按新阈值=初级');
ok(fb.improvements[0].includes('产妇护理'), 'improvements 含 subsection');
ok(fb.improvements[0].includes('排尿'), 'improvements 引用 explanation 内容');
ok(fb.salaryReasoning.includes('49'), 'salaryReasoning 含具体分数');
ok(!fb.salaryReasoning.includes('生成中'), 'salaryReasoning 不再是"生成中"套话');

// ── Test 4：prompt 含依据 + 阈值 + 一致性规则 ────
console.log('\n[Test 4] buildEvaluatePrompt 输出包含 v2 增强');
const prompt = lib.buildEvaluatePrompt(
  'yuexin',
  { name: '张某', age: 35, experienceYears: 3, education: '高中', city: '北京' },
  scores.qa, { percent: 49, hardwareWeighted: 13, skillWeighted: 23, personalityWeighted: 13 }
);
ok(prompt.includes('依据：产后4小时内排尿'), 'prompt 题面含 v2 依据');
ok(prompt.includes('出处：《产后康复指南》'), 'prompt 题面含 v2 出处');
ok(prompt.includes('<50 初级'), 'prompt 含新阈值 50');
ok(prompt.includes('≥88 钻石'), 'prompt 含新阈值 88');
ok(prompt.includes('levelDesc 与 salaryReasoning 的水平描述必须一致'), 'prompt 含一致性约束');
ok(prompt.includes('引用错题的「依据」原文'), 'prompt 要求引用依据原文');
ok(!prompt.includes('80+ 至少高级'), 'prompt 旧 80+ 阈值已移除');

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`通过 ${passed} / 失败 ${failed}`);
fs.unlinkSync(tmp);
process.exit(failed === 0 ? 0 : 1);
