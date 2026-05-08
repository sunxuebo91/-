/* eslint-disable */
// 校验 _import_salary_question_bank_{job}.json 文件
// 每行必须为合法 JSON，字段完整；skill 题应有 explanation/source（v2）
const fs = require('fs');
const path = require('path');

const JOBS = ['yuexin', 'yuying', 'baomu', 'huli'];
let totalIssue = 0;

JOBS.forEach((job) => {
  const file = path.join('scripts', 'data', `_import_salary_question_bank_${job}.json`);
  if (!fs.existsSync(file)) { console.error(`✗ 缺失文件: ${file}`); totalIssue += 1; return; }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  let total = 0;
  const stats = { hardware: 0, personality: 0, skill: 0 };
  const skillNoExp = [];
  const skillNoSrc = [];
  const optBad = [];
  let issue = 0;

  lines.forEach((l, i) => {
    let o;
    try { o = JSON.parse(l); } catch (e) {
      console.error(`✗ ${file}:${i + 1} JSON 失败`); issue += 1; return;
    }
    total += 1;
    stats[o.section] = (stats[o.section] || 0) + 1;
    // 必填
    if (!o.jobType || !o.section || !o.type || !o.question || !Array.isArray(o.options)) {
      console.error(`✗ ${file}:${i + 1} 字段不全`); issue += 1; return;
    }
    if (o.options.some((x) => typeof x.text !== 'string' || typeof x.score !== 'number')) {
      optBad.push(`${file}:${i + 1}`); issue += 1;
    }
    if (o.section === 'skill') {
      if (!o.explanation) skillNoExp.push(`${file}:${i + 1}`);
      if (!o.source) skillNoSrc.push(`${file}:${i + 1}`);
      if (!o.subsection || !o.difficulty) {
        console.error(`✗ ${file}:${i + 1} skill 缺 subsection/difficulty`);
        issue += 1;
      }
    }
  });

  console.log(`\n=== ${job} (${total} 条) ===`);
  console.log(`  硬件 ${stats.hardware} / 心理 ${stats.personality} / 技能 ${stats.skill}`);
  if (skillNoExp.length) {
    console.log(`  ⚠ skill 无 explanation: ${skillNoExp.length} 条`);
    if (skillNoExp.length <= 3) skillNoExp.forEach((x) => console.log('    ', x));
  }
  if (skillNoSrc.length) {
    console.log(`  ⚠ skill 无 source: ${skillNoSrc.length} 条`);
  }
  if (optBad.length) console.log(`  ✗ options 类型错: ${optBad.length} 条`);
  totalIssue += issue + skillNoExp.length + skillNoSrc.length;
});

console.log(`\n${totalIssue === 0 ? '✅ 全部通过' : `⚠ 共 ${totalIssue} 条警告/错误`}`);
process.exit(totalIssue === 0 ? 0 : 1);
