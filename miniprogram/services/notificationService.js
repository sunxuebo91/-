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

/**
 * 发送"简历被查看"通知给员工（写 CRM 站内信 + 微信订阅消息）
 * @param {{ sharerPhone, customerName, nurseName, resumeId }} params
 */
function sendResumeViewNotify(params) {
  return call('sendResumeViewNotify', params);
}

/**
 * 发送"抢单成功"通知给订单发布人（写 CRM 站内信 + 微信订阅消息）
 * @param {{ publisherPhone, auntieName, serviceTypeLabel, orderId }} params
 */
function sendOrderGrabNotify(params) {
  return call('sendOrderGrabNotify', params);
}

module.exports = { getList, markRead, markAllRead, sendResumeViewNotify, sendOrderGrabNotify };
