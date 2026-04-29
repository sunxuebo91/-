const fs = require('fs');
const path = require('path');

const dir = 'scripts/data';
const files = fs.readdirSync(dir).filter(f => f.startsWith('yuexin_part_')).sort();

const issues = {
  schema: [], noTen: [], multiTen: [], zeroOnly: [],
  judgeOpt: [], choiceOpt: [], dupOpts: [],
  stemLen: [], optLen: [], lenDiff: [], smoothPenalty: []
};
let total = 0;

files.forEach(f => {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).filter(Boolean);
  lines.forEach((l, i) => {
    let o;
    try { o = JSON.parse(l); } catch (e) { issues.schema.push(`${f}:${i+1} parse`); return; }
    total++;
    const loc = `${f}:${i+1}`;
    if (!o.jobType || !o.section || !o.type || !o.question || !Array.isArray(o.options)) issues.schema.push(`${loc} missing field`);
    if (o.section === 'skill' && !o.subsection) issues.schema.push(`${loc} missing subsection`);
    if (o.section === 'skill' && !o.difficulty) issues.schema.push(`${loc} missing difficulty`);
    if (o.type === 'judge' && o.options.length !== 2) issues.judgeOpt.push(`${loc} opts=${o.options.length}`);
    if (o.type === 'choice' && o.options.length !== 4) issues.choiceOpt.push(`${loc} opts=${o.options.length}`);
    const scores = o.options.map(x => x.score);
    const maxs = scores.filter(s => s === 10).length;
    if (maxs === 0) issues.noTen.push(`${loc} max=${Math.max(...scores)} Q:${o.question}`);
    if (maxs > 1) issues.multiTen.push(`${loc} 有${maxs}个10分 Q:${o.question}`);
    const nonzero = scores.filter(s => s > 0).length;
    if (o.type === 'choice' && nonzero === 1) issues.zeroOnly.push(`${loc} 仅1正分 Q:${o.question}`);
    const txts = o.options.map(x => x.text);
    if (new Set(txts).size !== txts.length) issues.dupOpts.push(`${loc} Q:${o.question}`);
    if (o.question.length > 25) issues.stemLen.push(`${loc} ${o.question.length}字 Q:${o.question}`);
    o.options.forEach(x => { if (x.text.length > 12) issues.optLen.push(`${loc} ${x.text.length}字 opt:${x.text}`); });
    const lens = txts.map(t => t.length);
    const diff = Math.max(...lens) - Math.min(...lens);
    if (diff > 3) issues.lenDiff.push(`${loc} diff=${diff}`);
    // 判断题分值梯度合理性：低分应 0~3，差距过小（如 10/8）算"伪二选一"
    if (o.type === 'judge') {
      const lo = Math.min(...scores);
      if (lo > 5) issues.smoothPenalty.push(`${loc} 低分=${lo} Q:${o.question}`);
    }
  });
});

console.log('总题数:', total);
Object.entries(issues).forEach(([k, v]) => {
  if (v.length) {
    console.log(`\n=== ${k} (${v.length}) ===`);
    v.slice(0, 30).forEach(x => console.log(' ', x));
    if (v.length > 30) console.log(`  ... 还有 ${v.length - 30} 条`);
  }
});
