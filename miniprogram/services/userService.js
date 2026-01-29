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

module.exports = {
  getOrCreateMe,
  updateMe,
};
