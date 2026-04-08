/**
 * 通知中心 Service
 * 调用 notificationService 云函数，代理 CRM 通知接口
 */

function call(action, data = {}) {
  return wx.cloud.callFunction({
    name: 'notificationService',
    data: { action, ...data },
  }).then(res => {
    const result = res?.result;
    if (result?.success) return result;
    throw new Error(result?.errMsg || '通知请求失败');
  });
}

/**
 * 获取通知列表
 * @param {string} phone  用户手机号
 * @param {number} page
 * @param {number} pageSize
 * @returns {{ list, total, unreadCount }}
 */
function getList(phone, page = 1, pageSize = 20) {
  return call('getList', { phone, page, pageSize }).then(r => r.data);
}

/**
 * 标记单条已读
 * @param {string} phone
 * @param {string} id  通知 id
 */
function markRead(phone, id) {
  return call('markRead', { phone, id });
}

/**
 * 全部标记已读
 * @param {string} phone
 */
function markAllRead(phone) {
  return call('markAllRead', { phone });
}

module.exports = { getList, markRead, markAllRead };
