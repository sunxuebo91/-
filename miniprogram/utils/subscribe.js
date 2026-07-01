/**
 * 订阅消息统一管理工具
 * 集中管理模板 ID，封装授权申请逻辑
 */

// 模板 ID 定义
const TEMPLATES = {
  RESUME_VIEW: 'VXhA_qhgIRRy8avH1X9uE-eLGk--0M5Bs9Q27EEDmrM', // 简历被查看提醒
  ORDER_GRAB:  'BLTv1XLncYInvkyERP8fgoHtM0UQoXOwgK4SmbQF93E',  // 接单成功提醒
};

/**
 * 申请订阅授权（必须在用户点击事件中同步调用）
 * @param {string[]} tmplIds 模板 ID 数组
 * @returns {Promise<Object>} 授权结果集
 */
function requestSubscribe(tmplIds = []) {
  if (!tmplIds.length) return Promise.resolve({});

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        console.log('[Subscribe] 授权结果:', res);
        resolve(res);
      },
      fail: (err) => {
        console.warn('[Subscribe] 授权失败:', err);
        resolve({});
      }
    });
  });
}

/**
 * 仅针对已永久授权的模板进行静默补配额（top-up）
 * 注意：部分基础库版本可能仍需手势上下文，此处建议在 onShow 或点击点调用
 */
function topUpIfPermanent() {
  const ids = Object.values(TEMPLATES);
  wx.getSetting({
    withSubscriptions: true,
    success: (res) => {
      const itemSettings = (res.subscriptionsSetting || {}).itemSettings || {};
      const acceptedIds = ids.filter(id => itemSettings[id] === 'accept');

      if (acceptedIds.length > 0) {
        // 已永久授权的，可以尝试调用以增加配额（不弹窗）
        wx.requestSubscribeMessage({
          tmplIds: acceptedIds,
          success: (res) => console.log('[Subscribe] 静默补配额成功:', res),
          fail: (err) => console.warn('[Subscribe] 静默补配额失败:', err)
        });
      }
    }
  });
}

module.exports = {
  TEMPLATES,
  requestSubscribe,
  topUpIfPermanent
};
