const userService = require('../../services/userService.js');

// 上户须知章节数据：red=true 为红线条款（🚫，违反将按公司规定处理）
const SECTIONS = [
  {
    idx: '一', title: '安全红线', subtitle: '最重要，置顶', tone: 'critical',
    items: [
      { red: true, text: '绝不允许留宝宝一个人在房间（包括宝宝睡着时）' },
      { red: true, text: '绝不允许剧烈摇晃宝宝' },
      { red: true, text: '绝不允许把个人负面情绪发泄到宝宝或老人身上' },
      { red: true, text: '绝不允许对宝宝或老人使用犀利、侮辱性语言' },
      { red: true, text: '绝不允许给宝宝修剪指甲' },
      { red: true, text: '带孩子或老人外出时，必须提前告知家人外出时长和地点' },
      { red: true, text: '带孩子外出不去"第二现场"（客户未授权的其他场所）' },
      { red: true, text: '客户家中无人时，绝不私自带外人进入' },
    ],
  },
  {
    idx: '二', title: '信息与诚信红线', tone: 'critical',
    items: [
      { red: true, text: '不透露客户家庭住址、家庭情况、隐私信息' },
      { red: true, text: '不在朋友圈、抖音、快手、小红书、视频号等任何平台发布宝宝照片、视频、客户家场景' },
      { red: true, text: '不和客户讨论公司负面消息' },
      { red: true, text: '不和客户说上一户情况' },
      { red: true, text: '不和客户过多聊自己家里的事' },
      { red: true, text: '不和客户私签合同' },
      { red: true, text: '入职前如实告知公司真实身体健康状况，不得故意隐瞒' },
      { red: true, text: '入户后与客户沟通的个人情况和经验，必须与面试时保持一致' },
    ],
  },
  {
    idx: '三', title: '财务红线', tone: 'critical',
    items: [
      { red: true, text: '不提前预支工资' },
      { red: true, text: '不暗示客户给红包、涨工资、索要礼物' },
      { red: true, text: '不私自动用客户家物品；借用必须先告知并征得客户同意' },
      { red: true, text: '采买物品必须记账 + 保留小票' },
      { red: true, text: '上户期间不佩戴贵重首饰、不携带过多现金及贵重物品' },
    ],
  },
  {
    idx: '四', title: '入户前准备', tone: 'normal',
    items: [
      { text: '守时：约定上户时间切记不迟到，提前出门规划路线' },
      { text: '入户前调整好身体状态，保存体力，预防感冒' },
      { text: '仪容仪表：不留长指甲、不做美甲、不佩戴首饰、化淡妆、不喷浓烈香水' },
      { text: '自备私人用品：洗漱用品、拖鞋、家居服、餐具、水杯、毛巾、卫生巾等' },
      { text: '入户前主动联系客户，确认上户时间、地址、进门方式' },
      { text: '上下户必须开箱让客户检查行李' },
    ],
  },
  {
    idx: '五', title: '上户日常规范', tone: 'normal',
    items: [
      { text: '手机调成静音，工作时间内禁止长时间玩手机（紧急情况除外）' },
      { text: '勤洗手、勤剪指甲，保持个人卫生' },
      { text: '作息时间尽量与客户家庭节奏一致，作息和休息安排提前与客户沟通明确' },
      { text: '餐饮不挑三拣四，过敏食物提前告知；不主动开客户冰箱拿取额外食材' },
      { text: '使用敬语、有礼貌，心态宽容，禁止在客户家大声喧哗' },
      { text: '尊重客户生活习惯，友好相处' },
      { text: '有主动服务意识，服从客户合理的工作安排' },
      { text: '勤俭节约：用水、用电、用餐不浪费' },
    ],
  },
  {
    idx: '六', title: '衣物与家务规范', tone: 'normal',
    items: [
      { text: '客户的内衣、内裤、袜子由客户自行清洗，阿姨不负责' },
      { text: '外衣清洗前先询问客户能否机洗，并查看水洗标确认洗涤方式' },
      { text: '不擅自整理或丢弃客户家物品' },
    ],
  },
  {
    idx: '七', title: '突发事件与沟通', tone: 'normal',
    items: [
      { text: '突发事件（请假、宝宝身体异常、老人突发状况等）必须第一时间联系公司老师 + 同步告知客户，不得隐瞒' },
      { text: '在户上遇任何不适应或变动，先和老师沟通，经老师指导后再和客户沟通' },
      { text: '公司老师是阿姨的第一沟通人，不要越过公司和客户私下处理问题' },
      { text: '定期（每周或每两周）向公司老师反馈上户情况', emphasis: true },
    ],
  },
  {
    idx: '八', title: '宝宝与老人照护规范', tone: 'normal',
    items: [
      { text: '宝宝和老人的安全永远是第一位', emphasis: true },
      { text: '喂奶、辅食、用药严格按客户要求执行，不擅自做主' },
      { text: '不擅自给宝宝喂食未确认的食品' },
      { text: '宝宝用品（奶瓶、餐具、玩具等）按客户要求消毒' },
    ],
  },
  {
    idx: '九', title: '离户交接', tone: 'normal',
    items: [
      { text: '下户前提前 3-7 天告知公司和客户' },
      { text: '交接内容：手头工作、客户交代事项、客户家钥匙/门禁卡等物品归还' },
      { text: '行李箱下户时开箱让客户检查' },
      { text: '离户后仍需遵守信息保密条款' },
    ],
  },
  {
    idx: '十', title: '节假日与调休', tone: 'normal',
    items: [
      { text: '节假日、调休、加班工资按公司和客户约定执行' },
      { red: true, text: '不和客户私下协商加班费、节假日工资等' },
    ],
  },
];

Page({
  data: {
    sections: SECTIONS,
  },

  onLoad() {
    // 页面加载
  },

  onShareAppMessage() {
    return {
      title: '安得阿姨上户须知',
      path: '/pages/houseRules/index'
    };
  },

  onShareTimeline() {
    return {
      title: '安得阿姨上户须知'
    };
  }
});

