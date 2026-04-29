/**
 * 工资测评分享归属链路工具
 * 与 articleDetail / resumeDetail 使用同一套 URL 参数协议：
 *   shared=1&sharerId=&sharer=&sharerPhone=&sharerCompany=&sharerAvatar=
 *   海报小程序码扫码进入：scene 字段，格式同 referrerRegister 页（key=value 用 & 分隔）
 */

const STORAGE_KEY = 'salary_assessment_sharer';

// 解析页面 onLoad 的 options（兼容直链和扫海报小程序码两种入口）
function parseSharerFromOptions(options) {
  const opt = options || {};
  let sharerId = opt.sharerId ? decodeURIComponent(opt.sharerId) : '';
  let sharer = opt.sharer ? decodeURIComponent(opt.sharer) : '';
  let sharerPhone = opt.sharerPhone ? decodeURIComponent(opt.sharerPhone) : '';
  let sharerCompany = opt.sharerCompany ? decodeURIComponent(opt.sharerCompany) : '';
  let sharerAvatar = opt.sharerAvatar ? decodeURIComponent(opt.sharerAvatar) : '';
  let sharerOpenid = opt.sharerOpenid ? decodeURIComponent(opt.sharerOpenid) : '';
  const isShared = opt.shared === '1' || !!sharerId || !!sharerPhone || !!sharerOpenid;

  // 兼容海报小程序码 scene 入口（key=value & 分隔）
  if (opt.scene) {
    try {
      const scene = decodeURIComponent(opt.scene);
      scene.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (!v) return;
        if (k === 'sharerId' || k === 'id') sharerId = sharerId || v;
        if (k === 'p' || k === 'phone' || k === 'sharerPhone') sharerPhone = sharerPhone || v;
        if (k === 'sharer') sharer = sharer || v;
        if (k === 'o' || k === 'openid' || k === 'sharerOpenid') sharerOpenid = sharerOpenid || v;
      });
    } catch (e) { /* ignore */ }
  }

  if (!isShared && !sharerId && !sharerPhone && !sharerOpenid) return null;

  return {
    id: sharerId,
    name: sharer || '安得褓贝顾问',
    phone: sharerPhone,
    company: sharerCompany || '安得褓贝',
    avatar: sharerAvatar,
    openid: sharerOpenid,
  };
}

// 缓存到本地（链路锁定，跨页面共享）
function saveSharer(sharerInfo) {
  if (!sharerInfo) return;
  try { wx.setStorageSync(STORAGE_KEY, sharerInfo); } catch (e) {}
}

function getSharer() {
  try { return wx.getStorageSync(STORAGE_KEY) || null; } catch (e) { return null; }
}

function clearSharer() {
  try { wx.removeStorageSync(STORAGE_KEY); } catch (e) {}
}

// 异步从云端补全顾问信息（姓名/头像缺失时调用）
function fetchAndMergeSharer(sharerInfo, cb) {
  if (!sharerInfo) return;
  if (!sharerInfo.id && !sharerInfo.phone) return;
  if (sharerInfo.name && sharerInfo.name !== '安得褓贝顾问' && sharerInfo.avatar) return;

  wx.cloud.callFunction({
    name: 'userService',
    data: { action: 'getStaffPublicInfo', userId: sharerInfo.id || '', phone: sharerInfo.phone || '' }
  }).then(res => {
    if (res && res.result && res.result.success) {
      const d = res.result.data || {};
      const merged = {
        ...sharerInfo,
        name: d.name || sharerInfo.name,
        phone: d.phone || sharerInfo.phone,
        avatar: d.avatar || sharerInfo.avatar,
        company: d.company || sharerInfo.company,
      };
      saveSharer(merged);
      if (typeof cb === 'function') cb(merged);
    }
  }).catch(err => {
    console.warn('[sharerUtils] 拉取顾问信息失败(不影响主流程):', err);
  });
}

// 当前登录员工的分享身份（用于员工自己分享给阿姨时）
function getCurrentStaffSharer() {
  const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
  const localName = wx.getStorageSync('userName') || '';
  const localPhone = wx.getStorageSync('userPhone') || '';
  const localAvatar = wx.getStorageSync('userAvatar') || '';
  return {
    id: String(crmUserInfo._id || crmUserInfo.id || crmUserInfo.userId || wx.getStorageSync('userId') || ''),
    name: localName || crmUserInfo.nickname || crmUserInfo.name || '安得褓贝顾问',
    phone: crmUserInfo.phone || localPhone || '',
    avatar: localAvatar || crmUserInfo.avatarUrl || crmUserInfo.avatar || '',
    company: '安得褓贝',
    openid: crmUserInfo.openid || '',
  };
}

// 把分享身份拼成 URL query
function buildShareQuery(sharer) {
  const s = sharer || getCurrentStaffSharer();
  return [
    'shared=1',
    `sharerId=${encodeURIComponent(s.id || '')}`,
    `sharer=${encodeURIComponent(s.name || '')}`,
    `sharerPhone=${encodeURIComponent(s.phone || '')}`,
    `sharerCompany=${encodeURIComponent(s.company || '安得褓贝')}`,
    `sharerAvatar=${encodeURIComponent(s.avatar || '')}`,
    `sharerOpenid=${encodeURIComponent(s.openid || '')}`,
  ].join('&');
}

module.exports = {
  parseSharerFromOptions,
  saveSharer,
  getSharer,
  clearSharer,
  fetchAndMergeSharer,
  getCurrentStaffSharer,
  buildShareQuery,
};
