/* eslint-disable */
// 把 v1 hardware/personality + v2 skill 合并成云开发可导入的 JSON：
//   scripts/data/_import_salary_question_bank_{job}.json
// 用法：node scripts/build-import-v2.js [job]
//   job 默认遍历全部 yuexin/yuying/baomu/huli
// 导入：微信开发者工具 → 云开发 → 数据库 → salary_question_bank
//      → 导入 → JSON / Insert（重导前先按 jobType 删旧）

const fs = require('fs');
const path = require('path');

const JOBS = ['yuexin', 'yuying', 'baomu', 'huli'];
const SRC_DIR = path.join('scripts', 'data');
const arg = (process.argv[2] || '').toLowerCase();
const targets = arg && JOBS.includes(arg) ? [arg] : JOBS;

function readLines(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
}

function pickV1NonSkill(job) {
  // v1 part 文件中只取 hardware / personality（_skill_ 已被 v2 替换）
  const files = fs.readdirSync(SRC_DIR)
    .filter(f => f.startsWith(`${job}_part_`) && f.endsWith('.jsonl'))
    .filter(f => !f.includes('_skill_') && !f.includes('_skill.jsonl'))
    .sort();
  return files;
}

function pickV2Skill(job) {
  return fs.readdirSync(SRC_DIR)
    .filter(f => f.startsWith(`${job}_v2_skill_`) && f.endsWith('.jsonl'))
    .sort();
}

function build(job) {
  const out = path.join(SRC_DIR, `_import_salary_question_bank_${job}.json`);
  const ws = fs.createWriteStream(out);
  const now = new Date().toISOString();
  const stats = { hardware: 0, personality: 0, skill: 0 };
  const subStats = {};
  const diffStats = {};

  const v1Files = pickV1NonSkill(job);
  const v2Files = pickV2Skill(job);

  if (!v1Files.length && !v2Files.length) {
    console.error(`✗ ${job}: 未找到任何源文件`);
    process.exit(1);
  }

  const writeRec = (o) => {
    const rec = {
      jobType: o.jobType,
      section: o.section,
      type: o.type,
      question: o.question,
      options: o.options.map(opt => ({
        text: String(opt.text),
        score: Number(opt.score) || 0,
      })),
      createdAt: { $date: now },
    };
    if (o.subsection) rec.subsection = o.subsection;
    if (o.section === 'skill') {
      if (o.difficulty) rec.difficulty = o.difficulty;
      if (o.explanation) rec.explanation = String(o.explanation);
      if (o.source) rec.source = String(o.source);
    }
    ws.write(JSON.stringify(rec) + '\n');
    stats[o.section] = (stats[o.section] || 0) + 1;
    if (o.section === 'skill') {
      subStats[o.subsection] = (subStats[o.subsection] || 0) + 1;
      diffStats[o.difficulty] = (diffStats[o.difficulty] || 0) + 1;
    }
  };

  v1Files.forEach(f => readLines(path.join(SRC_DIR, f)).forEach((l, i) => {
    let o;
    try { o = JSON.parse(l); } catch (e) {
      console.error(`✗ JSON parse fail ${f}:${i + 1}`); process.exit(1);
    }
    writeRec(o);
  }));
  v2Files.forEach(f => readLines(path.join(SRC_DIR, f)).forEach((l, i) => {
    let o;
    try { o = JSON.parse(l); } catch (e) {
      console.error(`✗ JSON parse fail ${f}:${i + 1}`); process.exit(1);
    }
    writeRec(o);
  }));

  ws.end(() => {
    const total = stats.hardware + stats.personality + stats.skill;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✓ 工种：${job}`);
    console.log(`✓ v1 输入：${v1Files.length} 文件`);
    v1Files.forEach(f => console.log('   ·', f));
    console.log(`✓ v2 输入：${v2Files.length} 文件（skill）`);
    console.log(`✓ 输出：${out}`);
    console.log(`✓ 总题数：${total}`);
    console.log(`✓ 模块：硬件 ${stats.hardware} / 心理 ${stats.personality} / 技能 ${stats.skill}`);
    if (Object.keys(subStats).length) {
      console.log(`✓ 技能专项：`);
      Object.entries(subStats).forEach(([k, v]) => console.log(`   · ${k}: ${v}`));
      console.log(`✓ 技能难度：`);
      Object.entries(diffStats).forEach(([k, v]) => console.log(`   · ${k}: ${v}`));
    }
  });
}

targets.forEach(build);
