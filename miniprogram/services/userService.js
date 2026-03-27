/**
 * 用户服务（云函数 userService）
 */

function call(action, data = {}) {
  return wx.cloud.callFunction({
    name: 'userService',
    data: { action, ...data }
  }).then(res => {
    const result = res?.result;
    if (result?.success) return result;
    const msg = result?.errMsg || res?.errMsg || '云函数调用失败';
    return Promise.reject(new Error(msg));
  });
}

async function getOrCreateMe() {
  const r = await call('getOrCreateMe');
  return r.data || {};
}

async function updateMe(data) {
  const r = await call('updateMe', { data });
  return r.data || {};
}

function isLoggedIn() {
  const crmUserInfo = wx.getStorageSync('crmUserInfo');
  return !!(crmUserInfo && crmUserInfo.phone);
}

// 检查登录，未登录则跳转登录页，返回 false 表示需要中断
function requireLogin() {
  if (isLoggedIn()) return true;
  wx.navigateTo({ url: '/pages/login/index' });
  return false;
}

module.exports = {
  getOrCreateMe,
  updateMe,
  isLoggedIn,
  requireLogin,
};
