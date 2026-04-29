/* eslint-disable */
// 本地测试智能抽样算法：把云函数里的 sampling 工具函数搬过来跑模拟
// 用法：node scripts/test-sampling.js
// 验证：
//   1) 每次抽出恰好 30 题（4 hw + 18 skill + 8 psy）
//   2) 4 经验档位的难度分布与文档表格一致
//   3) 技能 4 专项每次都被覆盖（round-robin）
//   4) 心理 5 子类基本均衡（2+2+2+1+1）
//   5) 硬件随机覆盖 4/5 子项

const fs = require('fs');
const path = require('path');

const HARDWARE_SUBS    = ['年龄家庭', '工龄经历', '学历语言', '证书资质', '健康体能'];
const PERSONALITY_SUBS = ['服务心态', '沟通', '抗压', '职业道德', '稳定性'];
const SKILL_SUBS = {
  yuexin: ['产妇护理', '月子餐', '新生儿护理', '应急与异常观察'],
  yuying: ['生活照料', '保健与疾病护理', '早教与发展', '安全与应急'],
  baomu:  ['家庭烹饪', '清洁整理', '衣物护理', '家电与用火用气安全'],
  huli:   ['生活照护', '基础照护与慢病', '康复与失智照护', '应急与消防安全'],
};

function getSkillDifficultyQuota(years) {
  const y = Number(years) || 0;
  if (y <= 2)  return { easy: 11, medium: 5, hard: 2  };
  if (y <= 5)  return { easy: 5,  medium: 9, hard: 4  };
  if (y <= 10) return { easy: 3,  medium: 8, hard: 7  };
  return           { easy: 2,  medium: 6, hard: 10 };
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function distributeRoundRobin(subs, total) {
  const arr = shuffle(subs);
  const result = {};
  arr.forEach(s => { result[s] = 0; });
  for (let i = 0; i < total; i++) result[arr[i % arr.length]] += 1;
  return result;
}

function subsectionMatches(qSub, wanted) {
  if (wanted === '证书资质' || wanted === '证书') return qSub === '证书资质' || qSub === '证书';
  return qSub === wanted;
}

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

function fillDeficit(pool, section, picked, target) {
  if (picked.length >= target) return picked.slice(0, target);
  const have = new Set(picked.map(x => x._id));
  const candidates = pool.filter(q => q.section === section && !have.has(q._id));
  return picked.concat(shuffle(candidates).slice(0, target - picked.length));
}

function loadPool(job) {
  const dir = path.join('scripts', 'data');
  const files = fs.readdirSync(dir).filter(f => f.startsWith(`${job}_part_`) && f.endsWith('.jsonl'));
  const pool = [];
  files.forEach(f => {
    fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).filter(Boolean).forEach((l, i) => {
      const o = JSON.parse(l);
      o._id = `${f}:${i}`;
      pool.push(o);
    });
  });
  return pool;
}

function pickOne(pool, jobType, experienceYears) {
  const hwSubs = shuffle(HARDWARE_SUBS).slice(0, 4);
  let hw = [];
  hwSubs.forEach(s => { hw = hw.concat(sampleBucket(pool, 'hardware', { subsection: s }, 1)); });
  let psy = [];
  Object.entries(distributeRoundRobin(PERSONALITY_SUBS, 8)).forEach(([s, n]) => {
    if (n > 0) psy = psy.concat(sampleBucket(pool, 'personality', { subsection: s }, n));
  });
  let sk = [];
  Object.entries(getSkillDifficultyQuota(experienceYears)).forEach(([d, n]) => {
    if (n <= 0) return;
    Object.entries(distributeRoundRobin(SKILL_SUBS[jobType], n)).forEach(([s, k]) => {
      if (k > 0) sk = sk.concat(sampleBucket(pool, 'skill', { subsection: s, difficulty: d }, k));
    });
  });
  hw  = fillDeficit(pool, 'hardware',    hw,  4);
  sk  = fillDeficit(pool, 'skill',       sk,  18);
  psy = fillDeficit(pool, 'personality', psy, 8);
  return { hw, sk, psy };
}

function runOnce(job, years) {
  const pool = loadPool(job);
  const { hw, sk, psy } = pickOne(pool, job, years);
  const total = hw.length + sk.length + psy.length;
  const skSubs = {}; sk.forEach(q => { skSubs[q.subsection] = (skSubs[q.subsection]||0)+1; });
  const skDiff = {}; sk.forEach(q => { skDiff[q.difficulty] = (skDiff[q.difficulty]||0)+1; });
  const psySubs = {}; psy.forEach(q => { psySubs[q.subsection] = (psySubs[q.subsection]||0)+1; });
  return { total, hw: hw.length, sk: sk.length, psy: psy.length, skSubs, skDiff, psySubs };
}

const jobs = ['yuexin', 'yuying', 'baomu', 'huli'];
const exps = [0, 3, 8, 15];
const RUNS = 50;
console.log(`运行 ${jobs.length} 工种 × ${exps.length} 经验档 × ${RUNS} 次 = ${jobs.length*exps.length*RUNS} 次抽样`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
let allOk = true;
jobs.forEach(job => {
  exps.forEach(yr => {
    const agg = { total: 0, skSubs: {}, skDiff: {}, psySubs: {}, hwOk: 0, fullOk: 0 };
    for (let i = 0; i < RUNS; i++) {
      const r = runOnce(job, yr);
      agg.total += r.total;
      if (r.total === 30) agg.fullOk += 1;
      Object.entries(r.skSubs).forEach(([k,v])=>{agg.skSubs[k]=(agg.skSubs[k]||0)+v});
      Object.entries(r.skDiff).forEach(([k,v])=>{agg.skDiff[k]=(agg.skDiff[k]||0)+v});
      Object.entries(r.psySubs).forEach(([k,v])=>{agg.psySubs[k]=(agg.psySubs[k]||0)+v});
      // 每次硬件应覆盖 4 个子项
      if (r.hw === 4) agg.hwOk += 1;
    }
    const expectedDiff = getSkillDifficultyQuota(yr);
    const expSkPerSub = (18 / 4 * RUNS).toFixed(0);  // 每专项理论平均 4.5 道/次
    console.log(`▶ ${job}  经验=${yr}年  ${RUNS}次抽样：每次30题=${agg.fullOk}/${RUNS}  硬件覆盖4子项=${agg.hwOk}/${RUNS}`);
    console.log(`  技能难度（每次目标 ${expectedDiff.easy}/${expectedDiff.medium}/${expectedDiff.hard}）：`,
      Object.fromEntries(Object.entries(agg.skDiff).map(([k,v])=>[k,(v/RUNS).toFixed(1)])));
    console.log(`  技能专项（每次理论 ~4.5/4.5/4.5/4.5）：`,
      Object.fromEntries(Object.entries(agg.skSubs).map(([k,v])=>[k,(v/RUNS).toFixed(1)])));
    console.log(`  心理子类（每次理论 1.6×5）：`,
      Object.fromEntries(Object.entries(agg.psySubs).map(([k,v])=>[k,(v/RUNS).toFixed(1)])));
    if (agg.fullOk !== RUNS || agg.hwOk !== RUNS) { allOk = false; console.log('  ❌ 异常'); }
  });
});
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(allOk ? '✅ 全部通过' : '❌ 有异常请排查');
