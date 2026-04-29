#!/usr/bin/env node
// Reclassify yuying skill subsections to align with OSTA 4 专项:
// 生活照料 / 保健与疾病护理 / 早教与发展 / 安全与应急
const fs = require('fs');
const path = require('path');

const DATA_DIR = 'scripts/data';
const FILES = fs.readdirSync(DATA_DIR)
  .filter(f => f.startsWith('yuying_part_') && f.includes('skill'))
  .sort();

// Keyword classifiers (order matters: safety wins over medical when both match)
const SAFETY_KW = [
  // 急救/送医/应急
  '呛奶','磕碰','磕到头','咽下异物','异物','鼻血','烫伤','烧伤','抽搐','惊厥','中暑','休克','送医','侧卧通气','急救','喷射状','吐奶严重','溺水','误吞','窒息','热性惊厥',
  // 喂养/喂奶安全（防呛防溢）
  '竖抱拍嗝','拍嗝失败','奶液滴下','吃奶后应','吃奶后多久平躺','吐奶分溢',
  // 睡眠安全（防猝死/防捂热/防摇晃）
  '摇晃哄睡','侧睡仰睡','睡袋','盖被','睡觉打鼾',
  // 洗澡/洗头/居家防滑
  '洗澡水温','洗头怎么固定','床上吃',
  // 防误食/防肉毒/防呛食
  '蜂蜜','坚果',
  // 衣物/室温/晒太阳防捂热
  '穿衣怎么把握','晒太阳','室温保持','避开正午',
  // 护理/脐带/消毒
  '肚脐','护脐'
];
const NEONATAL_MEDICAL_KW = ['黄疸','肠绞痛','奶粉过敏','鹅口疮','乳糖不耐','便秘','维生素D','叶酸','拒奶','排便规律','早产儿','矫正月龄','胀气','腹胀','乳头混淆','大便绿','大便酸臭','尿色','奶粉过浓','奶粉变换','奶粉冲调过浓'];

function classify(q) {
  const text = q.question + '|' + q.options.map(o => o.text).join('|');
  const sub = q.subsection;

  if (sub === '早教启蒙') return '早教与发展';

  // Safety wins everywhere
  if (SAFETY_KW.some(k => text.includes(k))) return '安全与应急';

  if (sub === '健康疾病') return '保健与疾病护理';
  if (sub === '生活习惯') return '生活照料';

  if (sub === '新生儿照护') {
    if (NEONATAL_MEDICAL_KW.some(k => text.includes(k))) return '保健与疾病护理';
    return '生活照料';
  }

  return sub;
}

const dryRun = process.argv.includes('--dry-run');
const stats = { before: {}, after: {} };
const moves = [];

const fileChanges = {};

FILES.forEach(f => {
  const p = path.join(DATA_DIR, f);
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
  const newLines = lines.map(l => {
    const o = JSON.parse(l);
    stats.before[o.subsection] = (stats.before[o.subsection] || 0) + 1;
    const newSub = classify(o);
    stats.after[newSub] = (stats.after[newSub] || 0) + 1;
    if (newSub !== o.subsection) {
      moves.push({ file: f, from: o.subsection, to: newSub, q: o.question });
      o.subsection = newSub;
    }
    return JSON.stringify(o);
  });
  fileChanges[f] = newLines;
});

console.log('=== BEFORE ===');
console.log(stats.before);
console.log('=== AFTER ===');
console.log(stats.after);
console.log('=== MOVES (sample) ===');
moves.slice(0, 15).forEach(m => console.log(`  ${m.file}: ${m.from} → ${m.to} | ${m.q}`));
console.log(`Total moves: ${moves.length}`);

if (dryRun) {
  console.log('\n[DRY RUN] No files written. Re-run without --dry-run to apply.');
  return;
}

Object.entries(fileChanges).forEach(([f, lines]) => {
  fs.writeFileSync(path.join(DATA_DIR, f), lines.join('\n') + '\n', 'utf8');
});
console.log('\n✓ Files updated.');
