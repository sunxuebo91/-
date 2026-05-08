// 用法：node scripts/_validate_skill_v2.js <file1.jsonl> [file2.jsonl] ...
// 校验工资测评题库 v2 学术格式（仅 skill 段）。0 错误退出 0，否则退出 1。
const fs = require('fs');
const path = require('path');

const ALLOWED_LOW = new Set([0, 3, 4, 7]);
const ALLOWED_DIFF = new Set(['easy', 'medium', 'hard']);
const ALLOWED_JOB = new Set(['yuexin', 'yuying', 'baomu', 'huli']);
const SUBSECTION = {
  yuexin: new Set(['产妇护理', '月子餐', '新生儿护理', '应急与异常观察']),
  yuying: new Set(['生活照料', '保健与疾病护理', '早教与发展', '安全与应急']),
  baomu: new Set(['家庭烹饪', '清洁整理', '衣物护理', '家电与用火用气安全']),
  huli: new Set(['生活照护', '基础照护与慢病', '康复与失智照护', '应急与消防安全']),
};
const BAD_OPT = /以上(都|全)?(对|不对|错误|正确|是)|都(对|不对|错)|以上皆/;

const args = process.argv.slice(2);
if (!args.length) {
  console.error('用法：node scripts/_validate_skill_v2.js <file1.jsonl> [file2.jsonl] ...');
  process.exit(2);
}

const issues = {
  parse: [], schema: [], jobType: [], section: [], subsection: [],
  difficulty: [], type: [], optCount: [], dupOpt: [], badOpt: [],
  scoreTen: [], scoreLow: [], stemLen: [], optLen: [], lenDiff: [],
  expLen: [], srcLen: [], expMissing: [], srcMissing: [],
};
let total = 0;

args.forEach((arg) => {
  const file = path.resolve(arg);
  if (!fs.existsSync(file)) { issues.parse.push(`${arg} 文件不存在`); return; }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const f = path.basename(file);
  lines.forEach((line, i) => {
    let o;
    try { o = JSON.parse(line); } catch (e) { issues.parse.push(`${f}:${i + 1} ${e.message}`); return; }
    total++;
    const loc = `${f}:${i + 1}`;
    const Q = (o.question || '').slice(0, 30);

    // 必填字段
    const required = ['jobType', 'section', 'subsection', 'difficulty', 'type', 'question', 'options', 'explanation', 'source'];
    required.forEach((k) => { if (o[k] === undefined || o[k] === null || o[k] === '') issues.schema.push(`${loc} 缺 ${k}`); });

    // 工种
    if (o.jobType && !ALLOWED_JOB.has(o.jobType)) issues.jobType.push(`${loc} jobType=${o.jobType}`);
    // section 必须是 skill
    if (o.section && o.section !== 'skill') issues.section.push(`${loc} section=${o.section}`);
    // 子项匹配工种
    if (o.jobType && SUBSECTION[o.jobType] && o.subsection && !SUBSECTION[o.jobType].has(o.subsection)) {
      issues.subsection.push(`${loc} ${o.jobType}/${o.subsection} 不在白名单`);
    }
    // 难度
    if (o.difficulty && !ALLOWED_DIFF.has(o.difficulty)) issues.difficulty.push(`${loc} difficulty=${o.difficulty}`);
    // 类型必须 choice
    if (o.type && o.type !== 'choice') issues.type.push(`${loc} type=${o.type}（v2 必须为 choice）`);

    // 选项
    if (!Array.isArray(o.options)) return;
    if (o.options.length !== 4) issues.optCount.push(`${loc} 选项数=${o.options.length}`);
    const txts = o.options.map((x) => String(x.text || ''));
    if (new Set(txts).size !== txts.length) issues.dupOpt.push(`${loc} Q:${Q}`);
    txts.forEach((t) => { if (BAD_OPT.test(t)) issues.badOpt.push(`${loc} opt:${t}`); });

    // 分数
    const scores = o.options.map((x) => x.score);
    const tens = scores.filter((s) => s === 10).length;
    if (tens !== 1) issues.scoreTen.push(`${loc} 10分共${tens}个 Q:${Q}`);
    scores.forEach((s, idx) => {
      if (s !== 10 && !ALLOWED_LOW.has(s)) issues.scoreLow.push(`${loc} opt[${idx}].score=${s}（应 ∈ {0,3,4,7,10}）`);
    });

    // 字数
    if (o.question && o.question.length > 50) issues.stemLen.push(`${loc} ${o.question.length}字 Q:${Q}`);
    o.options.forEach((x, idx) => {
      const t = String(x.text || '');
      if (t.length > 25) issues.optLen.push(`${loc} opt[${idx}] ${t.length}字`);
    });
    const lens = txts.map((t) => t.length);
    if (lens.length) {
      const diff = Math.max(...lens) - Math.min(...lens);
      if (diff > 8) issues.lenDiff.push(`${loc} 选项字数差=${diff}`);
    }

    // explanation / source
    if (o.explanation !== undefined && o.explanation !== null) {
      if (typeof o.explanation !== 'string' || !o.explanation.trim()) issues.expMissing.push(`${loc} explanation 空`);
      else if (o.explanation.length > 80) issues.expLen.push(`${loc} explanation ${o.explanation.length}字`);
    }
    if (o.source !== undefined && o.source !== null) {
      if (typeof o.source !== 'string' || !o.source.trim()) issues.srcMissing.push(`${loc} source 空`);
      else if (o.source.length > 40) issues.srcLen.push(`${loc} source ${o.source.length}字`);
    }
  });
});

const totalIssues = Object.values(issues).reduce((s, v) => s + v.length, 0);
console.log(`校验文件 ${args.length} 个，共 ${total} 题，问题 ${totalIssues} 条`);
Object.entries(issues).forEach(([k, v]) => {
  if (!v.length) return;
  console.log(`\n=== ${k} (${v.length}) ===`);
  v.slice(0, 30).forEach((x) => console.log('  ' + x));
  if (v.length > 30) console.log(`  ... 还有 ${v.length - 30} 条`);
});

if (totalIssues > 0) process.exit(1);
console.log('\n✅ 全部通过 v2 校验');
