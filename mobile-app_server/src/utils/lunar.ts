/**
 * 轻量农历（阴历）转换工具，仅用于首页展示，避免为单一展示功能引入额外依赖。
 * 数据表覆盖 1900-2100 年，来源于通用的农历压缩查表算法。
 */

// 每个元素为对应年份的农历信息（十六进制），1900-2100
const LUNAR_INFO: number[] = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
];

const N_STR1 = ['日', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const N_STR2 = ['初', '十', '廿', '卅'];
const M_STR = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];

function lYearDays(y: number): number {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) sum += LUNAR_INFO[y - 1900] & i ? 1 : 0;
  return sum + leapDays(y);
}
function leapMonth(y: number): number {
  return LUNAR_INFO[y - 1900] & 0xf;
}
function leapDays(y: number): number {
  if (leapMonth(y)) return LUNAR_INFO[y - 1900] & 0x10000 ? 30 : 29;
  return 0;
}
function monthDays(y: number, m: number): number {
  return LUNAR_INFO[y - 1900] & (0x10000 >> m) ? 30 : 29;
}

function toChinaDay(d: number): string {
  if (d === 10) return '初十';
  if (d === 20) return '二十';
  if (d === 30) return '三十';
  return N_STR2[Math.floor(d / 10)] + N_STR1[d % 10];
}

/** 返回如「农历五月初八」的字符串 */
export function getLunarText(date: Date): string {
  const baseDate = new Date(1900, 0, 31);
  let offset = Math.floor((date.getTime() - baseDate.getTime()) / 86400000);
  let year = 1900;
  for (; year < 2100 && offset > 0; year++) {
    const temp = lYearDays(year);
    if (offset < temp) break;
    offset -= temp;
  }
  const leap = leapMonth(year);
  let isLeap = false;
  let month = 1;
  for (; month < 13 && offset > 0; month++) {
    let temp: number;
    if (leap > 0 && month === leap + 1 && !isLeap) {
      month--;
      isLeap = true;
      temp = leapDays(year);
    } else {
      temp = monthDays(year, month);
    }
    if (isLeap && month === leap + 1) isLeap = false;
    if (offset < temp) break;
    offset -= temp;
  }
  const day = offset + 1;
  const monthText = (isLeap ? '闰' : '') + M_STR[month - 1] + '月';
  return `农历${monthText}${toChinaDay(day)}`;
}

/** 每日励志正能量短句（均在 15 字以内，事业向） */
export const MOTIVATIONAL_QUOTES: string[] = [
  '机会总是留给有准备的人',
  '不要等待机会，而要创造机会',
  '行动永远胜过空谈',
  '今日的努力，是明日的实力',
  '每一步都算数',
  '越努力，越幸运',
  '认真做事，专注成长',
  '把平凡的事做到极致',
  '心中有梦，脚下有路',
  '坚持，是成功的另一个名字',
  '天道酬勤，实干兴业',
  '专业成就价值',
  '用心服务，赢得信任',
  '一分耕耘，一分收获',
  '积跬步以至千里',
];

/** 根据当天日期稳定地取一条励志短句 */
export function getDailyQuote(date: Date = new Date()): string {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length];
}
