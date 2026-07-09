/**
 * 随机头像昵称生成工具
 * 用于新用户注册时自动分配，提升登录效率
 */

const ADJECTIVES = [
  '快乐的', '幸福的', '暖心的', '阳光的', '温柔的', '可爱的',
  '勤劳的', '聪明的', '优雅的', '贴心的', '细心的', '安心的',
  '热情的', '真诚的', '踏实的', '靠谱的', '甜美的', '活泼的',
];

const NOUNS = [
  '宝妈', '月嫂', '育婴师', '育儿达人', '家政能手',
  '小天使', '小太阳', '小可爱', '小能手', '小管家',
  '守护者', '贴心人', '小棉袄', '小星星', '小幸运',
];

const AVATAR_COLORS = [
  '#8766F3', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
  '#85C1E9', '#F8C471', '#82E0AA', '#F1948A', '#AED6F1',
];

/**
 * 生成随机昵称
 * 格式：形容词 + 名词 + 4位随机数
 * 例：快乐的宝妈3829、阳光的育婴师1746
 */
function generateNickname() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000); // 1000-9999
  return `${adj}${noun}${num}`;
}

/**
 * 生成随机头像颜色
 * 用于默认头像的背景色（无头像时展示首字+纯色背景）
 */
function generateAvatarColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

/**
 * 获取名字的首字（用于头像展示）
 */
function getInitialChar(name) {
  if (!name) return '用';
  return name.charAt(0);
}

module.exports = {
  generateNickname,
  generateAvatarColor,
  getInitialChar,
};
