/* eslint-disable */
// 把 scripts/data/yuexin_part_*.jsonl 12 个分批文件
// 合并成云开发控制台可导入的 JSON 文件：
//   scripts/data/_import_salary_question_bank.jsonl
// 使用：node scripts/build-import-jsonl.js [job]
//   job 默认 yuexin（后续 yuying/baomu/huli 同样用法）
// 导入方式：微信开发者工具 → 云开发 → 数据库 → salary_question_bank 集合
//          → 导入 → 文件类型 JSON → 冲突处理 Insert

const fs = require('fs');
const path = require('path');

const JOB = (process.argv[2] || 'yuexin').toLowerCase();
const SRC_DIR = path.join('scripts', 'data');
const OUT = path.join(SRC_DIR, `_import_salary_question_bank_${JOB}.json`);

const files = fs.readdirSync(SRC_DIR)
  .filter(f => f.startsWith(`${JOB}_part_`) && f.endsWith('.jsonl'))
  .sort();

if (!files.length) {
  console.error(`未找到 ${JOB}_part_*.jsonl 文件`);
  process.exit(1);
}

const out = fs.createWriteStream(OUT);
const now = new Date().toISOString();
let total = 0;
const stats = { hardware: 0, skill: 0, personality: 0 };
const subStats = {};
const diffStats = {};

files.forEach(f => {
  const lines = fs.readFileSync(path.join(SRC_DIR, f), 'utf8').split(/\r?\n/).filter(Boolean);
  lines.forEach((l, i) => {
    let o;
    try { o = JSON.parse(l); } catch (e) {
      console.error(`✗ JSON parse fail ${f}:${i + 1}`);
      process.exit(1);
    }
    // 字段对齐云函数 schema：jobType / section / type / question / options / createdAt
    // skill 题保留 subsection / difficulty 供未来智能抽样使用
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
    if (o.section === 'skill') {
      rec.subsection = o.subsection;
      rec.difficulty = o.difficulty;
    }
    out.write(JSON.stringify(rec) + '\n');
    total += 1;
    stats[o.section] = (stats[o.section] || 0) + 1;
    if (o.section === 'skill') {
      subStats[o.subsection] = (subStats[o.subsection] || 0) + 1;
      diffStats[o.difficulty] = (diffStats[o.difficulty] || 0) + 1;
    }
  });
});

out.end(() => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✓ 工种：${JOB}`);
  console.log(`✓ 输入：${files.length} 个分批文件`);
  files.forEach(f => console.log('   ·', f));
  console.log(`✓ 输出：${OUT}`);
  console.log(`✓ 总题数：${total}`);
  console.log(`✓ 模块分布：硬件 ${stats.hardware} / 技能 ${stats.skill} / 心理 ${stats.personality}`);
  if (Object.keys(subStats).length) {
    console.log(`✓ 技能专项：`);
    Object.entries(subStats).forEach(([k, v]) => console.log(`   · ${k}: ${v}`));
    console.log(`✓ 技能难度：`);
    Object.entries(diffStats).forEach(([k, v]) => console.log(`   · ${k}: ${v}`));
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('导入步骤：');
  console.log('  1) 微信开发者工具 → 云开发 → 数据库');
  console.log('  2) 选择 salary_question_bank 集合（如不存在请新建空集合）');
  console.log('  3) 点「导入」按钮 → 选择上面输出的文件');
  console.log('  4) 文件类型：JSON  /  冲突处理模式：Insert');
  console.log(`  5) 等待导入完成，集合记录数应增加 ${total} 条`);
  console.log('');
  console.log('⚠️  如果是重新导入：先去集合里把旧 yuexin 数据删掉');
  console.log(`   （按 jobType=="${JOB}" 过滤批量删除）`);
});
