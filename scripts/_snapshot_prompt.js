/* eslint-disable */
// Prompt 快照：把改造后的 buildEvaluatePrompt 输出渲染出来给人审
// 用法：node scripts/_snapshot_prompt.js
const Module = require('module');
const orig = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'wx-server-sdk') return require.resolve('./_stubs/wx-server-sdk-stub.js');
  return orig.call(this, req, ...rest);
};
const fs = require('fs');
const path = require('path');
const idx = path.join(__dirname, '..', 'cloudfunctions/salaryAssessment/index.js');
const tmp = path.join(__dirname, '_stubs/_index_for_snap.js');
fs.writeFileSync(tmp, fs.readFileSync(idx, 'utf8') + '\n;module.exports={buildEvaluatePrompt,computeSectionScores};');
const lib = require(tmp);

// 模拟一份混合（含 v2 + v1）题目：6 道
const Qs = [
  { id: 'q1', section: 'hardware', subsection: '年龄家庭', question: '您今年多大了？', options:[
    {label:'A',text:'25 岁以下',score:0},{label:'B',text:'26-35 岁',score:7},
    {label:'C',text:'36-45 岁',score:10},{label:'D',text:'46 岁以上',score:6}]},
  { id: 'q2', section: 'skill', subsection: '产妇护理', difficulty: 'easy',
    question: '产妇产后多久应鼓励主动排尿？', options:[
    {label:'A',text:'4小时内',score:10},{label:'B',text:'6小时内',score:3},
    {label:'C',text:'12小时内',score:0},{label:'D',text:'24小时内',score:4}],
    explanation:'产后4小时内排尿可避免膀胱充盈影响子宫收缩。超6小时未排尿需诱导或导尿。',
    source:'《产后康复指南》中华医学会'},
  { id: 'q3', section: 'skill', subsection: '新生儿护理', difficulty: 'medium',
    question: '新生儿黄疸警惕值？', options:[
    {label:'A',text:'血胆>15按医嘱',score:10},{label:'B',text:'肉眼看色深',score:3},
    {label:'C',text:'多晒太阳',score:0},{label:'D',text:'按月龄',score:4}],
    explanation:'足月儿>15或早产>10即警；皮黄+精神差/拒奶/抽搐等需急诊。',
    source:'《新生儿黄疸诊治共识》新生儿学会'},
  { id: 'q4', section: 'skill', subsection: '应急与异常观察', difficulty: 'hard',
    question: '产妇产后阴道大出血定义？', options:[
    {label:'A',text:'24h>500ml',score:10},{label:'B',text:'24h>300ml',score:3},
    {label:'C',text:'按手帕浸湿数',score:4},{label:'D',text:'剧痛即是',score:0}],
    explanation:'顺产24小时阴道出血≥500ml；剖宫≥1000ml；2小时内是高危期。',
    source:'《产后出血防治指南》中华妇产科学会'},
  { id: 'q5', section: 'personality', subsection: '服务心态',
    question: '雇主提了不合理要求该怎么办？', options:[
    {label:'A',text:'委婉解释',score:10},{label:'B',text:'拒绝',score:3},
    {label:'C',text:'先答应',score:4},{label:'D',text:'告状',score:0}]},
  // v1 旧题（无 explanation）
  { id: 'q6', section: 'skill', subsection: '产妇护理',
    question: '产妇饮食原则？', options:[
    {label:'A',text:'清淡少多',score:10},{label:'B',text:'大补',score:0},
    {label:'C',text:'重油',score:0},{label:'D',text:'少盐',score:5}]},
];
// 答题：q2 答错（B），q3 答对（A），q4 答错（B），q1/q5/q6 答对
const answers = [
  { id:'q1', label:'C' }, { id:'q2', label:'B' }, { id:'q3', label:'A' },
  { id:'q4', label:'B' }, { id:'q5', label:'A' }, { id:'q6', label:'A' },
];
const scores = lib.computeSectionScores(Qs, answers);
const prompt = lib.buildEvaluatePrompt(
  'yuexin',
  { name: '王某某', age: 38, experienceYears: 5, education: '高中', city: '北京' },
  scores.qa,
  { percent: 49, hardwareWeighted: 20, skillWeighted: 18, personalityWeighted: 11 }
);

console.log('━━━━━━━━━━━━━━━━━━ PROMPT ━━━━━━━━━━━━━━━━━');
console.log(prompt);
console.log('━━━━━━━━━━━━━━━━━━ END ━━━━━━━━━━━━━━━━━━━');
console.log(`prompt 长度：${prompt.length} 字符`);
console.log(`v2 题数：${scores.qa.filter(x=>x.explanation).length} / 总题：${scores.qa.length}`);
fs.unlinkSync(tmp);
