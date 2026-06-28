/**
 * 接单大厅服务
 * 对接 CRM 后端 /order-hall/miniprogram/* 接口
 */

const { publicRequest, authenticatedRequest } = require('../utils/request.js');

/**
 * 获取接单大厅订单列表（公开接口）
 * @param {Object} params
 * @param {number} [params.page=1]
 * @param {number} [params.pageSize=10]
 * @param {string} [params.serviceType] 工种英文 key
 * @param {string} [params.area] 区域
 * @returns {Promise<Object>}
 */
const getOrderList = (params = {}) => {
  const data = {
    page: params.page || 1,
    pageSize: params.pageSize || 10,
  };
  if (params.serviceType) data.serviceType = params.serviceType;
  if (params.area && String(params.area).trim()) data.area = String(params.area).trim();

  return publicRequest({
    url: '/order-hall/miniprogram/orders',
    method: 'GET',
    data,
  });
};

/**
 * 获取订单详情（公开接口）
 * @param {string} id
 */
const getOrderDetail = (id) => {
  return publicRequest({
    url: '/order-hall/miniprogram/orders/' + id,
    method: 'GET',
  });
};

/**
 * 抢单（公开接口，openid 可选）
 * 注：微信授权号码需在前端通过 cloudfunctions/userService loginByPhone 兑换为明文 phone 后再调用本接口。
 * @param {Object} payload
 * @param {string} payload.orderId
 * @param {string} payload.name
 * @param {string} payload.phone 手机号（已是明文，11 位）
 * @param {string} [payload.openid]
 */
const grabOrder = (payload) => {
  const idempotencyKey = 'grab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  return publicRequest({
    url: '/order-hall/miniprogram/grab',
    method: 'POST',
    data: payload,
    header: {
      'Idempotency-Key': idempotencyKey,
    },
  });
};

/**
 * 我的抢单记录
 * 优先使用本地 openid 作为查询主键，登录后追加 phone
 * @param {Object} params
 * @param {string} [params.openid]
 * @param {string} [params.phone]
 * @param {number} [params.page=1]
 * @param {number} [params.pageSize=20]
 */
const getMyGrabs = (params = {}) => {
  const data = {
    page: params.page || 1,
    pageSize: params.pageSize || 20,
  };
  if (params.openid) data.openid = params.openid;
  if (params.phone) data.phone = params.phone;

  // 若已登录则带 token，否则走公开接口（仅按 openid/phone 检索）
  const token = wx.getStorageSync('access_token') || wx.getStorageSync('token');
  const requester = token ? authenticatedRequest : publicRequest;
  return requester({
    url: '/order-hall/miniprogram/my-grabs',
    method: 'GET',
    data,
  });
};

/**
 * 工种字典（与简历/推荐复用同一份英文 key）
 */
const getJobTypes = () => {
  return publicRequest({
    url: '/order-hall/miniprogram/job-types',
    method: 'GET',
  });
};

module.exports = {
  getOrderList,
  getOrderDetail,
  grabOrder,
  getMyGrabs,
  getJobTypes,
};
