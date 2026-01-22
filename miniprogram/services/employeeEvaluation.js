/**
 * 员工评价服务
 * 用于调用 CRM 后台员工评价相关 API
 */

const { publicRequest, authenticatedRequest } = require('../utils/request.js');

/**
 * 获取员工评价列表（公开接口，无需登录）
 * @param {Object} params 查询参数
 * @param {string} params.employeeId 员工ID（可选）
 * @param {number} params.page 页码（从 1 开始）
 * @param {number} params.pageSize 每页数量
 * @returns {Promise<Object>} 评价列表
 */
const getEvaluationList = (params = {}) => {
  console.log('⭐ 获取员工评价列表（公开接口）:', params);

  // 构建查询参数
  const queryParams = [];

  // 员工ID（可选）
  if (params.employeeId) {
    queryParams.push(`employeeId=${params.employeeId}`);
  }

  // 分页参数
  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  queryParams.push(`page=${page}`);
  queryParams.push(`pageSize=${pageSize}`);

  const queryString = queryParams.join('&');

  return publicRequest({
    url: `/employee-evaluations/miniprogram/list?${queryString}`,
    method: 'GET'
  });
};

/**
 * 获取员工评价详情（公开接口，无需登录）
 * @param {string} id 评价ID
 * @returns {Promise<Object>} 评价详情
 */
const getEvaluationDetail = (id) => {
  console.log('⭐ 获取员工评价详情（公开接口）:', id);

  if (!id) {
    return Promise.reject(new Error('评价ID不能为空'));
  }

  return publicRequest({
    url: `/employee-evaluations/miniprogram/${id}`,
    method: 'GET'
  });
};

/**
 * 获取员工评价统计（公开接口，无需登录）
 * @param {string} employeeId 员工ID
 * @returns {Promise<Object>} 评价统计数据
 */
const getEvaluationStatistics = (employeeId) => {
  console.log('⭐ 获取员工评价统计（公开接口）:', employeeId);

  if (!employeeId) {
    return Promise.reject(new Error('员工ID不能为空'));
  }

  return publicRequest({
    url: `/employee-evaluations/miniprogram/statistics/${employeeId}`,
    method: 'GET'
  });
};

/**
 * 创建员工评价（需要登录）
 * @param {Object} data 评价数据
 * @param {string} data.employeeId 员工ID
 * @param {string} data.employeeName 员工姓名
 * @param {string} data.evaluationType 评价类型：daily/monthly/contract_end/special
 * @param {number} data.overallRating 综合评分（1-5）
 * @param {number} data.serviceAttitudeRating 服务态度评分（1-5）
 * @param {number} data.professionalSkillRating 专业技能评分（1-5）
 * @param {number} data.workEfficiencyRating 工作效率评分（1-5）
 * @param {number} data.communicationRating 沟通能力评分（1-5）
 * @param {string} data.comment 评价内容
 * @param {Array<string>} data.tags 评价标签
 * @param {boolean} data.isPublic 是否公开
 * @param {string} data.status 状态：draft/published/archived
 * @returns {Promise<Object>} 创建结果
 */
const createEvaluation = (data) => {
  console.log('⭐ 创建员工评价（需要登录）:', data);

  if (!data.employeeId) {
    return Promise.reject(new Error('员工ID不能为空'));
  }

  if (!data.employeeName) {
    return Promise.reject(new Error('员工姓名不能为空'));
  }

  return authenticatedRequest({
    url: '/employee-evaluations/miniprogram/create',
    method: 'POST',
    data: data
  });
};

module.exports = {
  getEvaluationList,
  getEvaluationDetail,
  getEvaluationStatistics,
  createEvaluation
};

