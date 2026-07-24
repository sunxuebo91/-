// pages/aiMatch/needs-sanitize.js
// needs 白名单规范化（独立模块，便于单测复用，不依赖 wx 环境）
//
// 后端 MatchNeedsDto 合法字段（多余字段会 400，缺失字段静默丢条件）。
// 云函数新旧版本/LLM 输出字段可能漂移（budget/region/province…），
// 发送前统一归一，保证 priceMax/nativePlace 等条件不静默丢失。

const NEEDS_WHITELIST = ['jobType', 'city', 'nativePlace', 'level', 'priceMax', 'ageMin', 'ageMax', 'skills', 'keywords', 'summary'];
const NEEDS_ALIASES = {
  priceMax: ['budget', 'price', 'salary', 'maxPrice', 'price_max'],
  nativePlace: ['region', 'province', 'birthplace', 'native_place', 'origin'],
};

// 23 省 + 5 自治区短名（不含 4 直辖市：北京/上海/天津/重庆 是真·工作城市语义）
const PROVINCE_SHORT_NAMES = [
  '黑龙江', '吉林', '辽宁', '河北', '山西', '陕西', '甘肃', '青海',
  '山东', '河南', '湖北', '湖南', '江苏', '浙江', '安徽', '江西',
  '福建', '广东', '海南', '四川', '贵州', '云南', '台湾',
  '内蒙古', '广西', '西藏', '宁夏', '新疆',
];

function stripProvinceSuffix(v) {
  return String(v).trim().replace(/(壮族自治区|回族自治区|维吾尔自治区|自治区|省|市|特别行政区)$/, '');
}

function sanitizeNeeds(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const needs = {};

  // 1. 白名单字段透传（跳过 null/空串）
  NEEDS_WHITELIST.forEach((k) => {
    const v = src[k];
    if (v !== undefined && v !== null && v !== '') needs[k] = v;
  });

  // 2. 别名归一：白名单字段缺失时从漂移字段补齐
  Object.keys(NEEDS_ALIASES).forEach((k) => {
    if (needs[k] !== undefined) return;
    const hit = NEEDS_ALIASES[k].map((a) => src[a]).find((v) => v !== undefined && v !== null && v !== '');
    if (hit === undefined) return;
    if (k === 'priceMax') {
      const n = Number(hit);
      if (!isNaN(n) && n > 0) needs.priceMax = n;
    } else if (k === 'nativePlace') {
      needs.nativePlace = stripProvinceSuffix(hit);
    }
  });

  // 3. 类型兜底
  ['priceMax', 'ageMin', 'ageMax'].forEach((k) => {
    if (needs[k] === undefined) return;
    const n = Number(needs[k]);
    if (isNaN(n)) delete needs[k]; else needs[k] = n;
  });
  ['skills', 'keywords'].forEach((k) => {
    if (needs[k] === undefined) return;
    if (!Array.isArray(needs[k])) needs[k] = [String(needs[k])];
    needs[k] = needs[k].filter(Boolean).map(String);
  });
  if (needs.nativePlace !== undefined) needs.nativePlace = stripProvinceSuffix(needs.nativePlace);
  ['jobType', 'city', 'level', 'summary'].forEach((k) => {
    if (needs[k] !== undefined) needs[k] = String(needs[k]);
  });

  // 4. 省份纠正规则（不等云函数上传就生效的兜底）：
  //    线上旧版云函数会把"帮我找个黑龙江的育儿嫂"解析成 {city:"黑龙江"}，
  //    籍贯错塞成工作城市，后端无法触发籍贯封顶。业务上阿姨都在本地（北京）服务，
  //    客户说省份 99% 是籍贯诉求 → nativePlace 为空且 city 命中省级短名时，
  //    把 city 移正到 nativePlace。直辖市（北京/上海/天津/重庆）与地级市（杭州/成都）不动。
  if ((needs.nativePlace === undefined || needs.nativePlace === '') && needs.city) {
    const cityShort = stripProvinceSuffix(needs.city);
    if (PROVINCE_SHORT_NAMES.includes(cityShort)) {
      console.log(`[aiMatch] city ${needs.city} 纠正为 nativePlace（省份=籍贯诉求，非工作城市）`);
      needs.nativePlace = cityShort;
      delete needs.city;
    }
  }

  console.log('[aiMatch] 最终发送的 needs:', JSON.stringify(needs));
  return needs;
}

module.exports = { sanitizeNeeds, NEEDS_WHITELIST, PROVINCE_SHORT_NAMES };
