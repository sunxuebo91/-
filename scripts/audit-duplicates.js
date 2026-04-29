/* eslint-disable */
// 工资测评题库去重审计：按题干前 N 字 + 题型聚合，输出疑似重复对
// 用法：node scripts/audit-duplicates.js [job] [prefixLen]
//   job        默认 all（也可指定 yuexin/yuying/baomu/huli）
//   prefixLen  题干前缀比对长度，默认 8
// 输出：控制台打印每组疑似重复的题干 + 文件来源

const fs = require('fs');
const path = require('path');

const JOB = (process.argv[2] || 'all').toLowerCase();
const PREFIX = Number(process.argv[3]) || 8;
const SRC_DIR = path.join('scripts', 'data');

const targets = JOB === 'all'
  ? ['yuexin', 'yuying', 'baomu', 'huli']
  : [JOB];

let totalDup = 0;

targets.forEach(job => {
  const files = fs.readdirSync(SRC_DIR)
    .filter(f => f.startsWith(`${job}_part_`) && f.endsWith('.jsonl'))
    .sort();
  if (!files.length) return;

  // key = type + question.slice(0, PREFIX) → list of { file, line, full }
  const buckets = {};
  let total = 0;
  files.forEach(f => {
    const lines = fs.readFileSync(path.join(SRC_DIR, f), 'utf8').split(/\r?\n/).filter(Boolean);
    lines.forEach((l, i) => {
      let o;
      try { o = JSON.parse(l); } catch (e) { return; }
      total += 1;
      const q = String(o.question || '').trim();
      const head = q.slice(0, PREFIX);
      const key = `${o.type}|${head}`;
      (buckets[key] = buckets[key] || []).push({ file: f, line: i + 1, full: q, sub: o.subsection || '', diff: o.difficulty || '' });
    });
  });

  const dups = Object.entries(buckets).filter(([, arr]) => arr.length > 1);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`▶ ${job}：${total} 题 / ${dups.length} 组疑似重复（前 ${PREFIX} 字 + 题型一致）`);
  if (!dups.length) {
    console.log('  ✓ 无疑似重复');
    return;
  }
  dups.sort((a, b) => b[1].length - a[1].length);
  dups.forEach(([key, arr], idx) => {
    console.log(`\n  [${idx + 1}] type=${key.split('|')[0]}  共 ${arr.length} 道：`);
    arr.forEach(x => {
      console.log(`    · ${x.file}:${x.line}  [${x.sub}/${x.diff}]  ${x.full}`);
    });
    totalDup += arr.length - 1;
  });
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`合计疑似冗余：${totalDup} 道（同组 N 道视作 N-1 道重复）`);
console.log('提示：题干前缀相同未必真重复，请人工裁决后用 str-replace-editor 改写或删除。');
