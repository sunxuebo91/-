/**
 * HTTP 请求工具
 * 从"安得家政"复制，用于调用 CRM 后台 API
 */

const BASE_URL = 'https://crm.andejiazheng.com/api';

/**
 * 公开请求（无需 Token）
 * 用于登录等不需要认证的接口
 */
const publicRequest = (options) => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + options.url,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'miniprogram',
        'X-Platform': 'wechat',
        ...options.header
      },
      success: (response) => {
        console.log(`📡 API 响应 [${options.method || 'GET'}] ${options.url}:`, response);
        
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data);
        } else {
          const errorMsg = response.data?.message || `请求失败 (${response.statusCode})`;
          console.error(`❌ API 错误:`, errorMsg);
          reject(new Error(errorMsg));
        }
      },
      fail: (error) => {
        console.error(`❌ 网络请求失败:`, error);
        reject(error);
      }
    });
  });
};

/**
 * 认证请求（需要 Token）
 * 用于需要登录后才能访问的接口
 */
const authenticatedRequest = (options) => {
  const token = wx.getStorageSync('access_token') || wx.getStorageSync('token');
  
  if (!token) {
    console.error('❌ 未找到 Token，请先登录');
    return Promise.reject(new Error('请先登录'));
  }
  
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + options.url,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Client-Type': 'miniprogram',
        'X-Platform': 'wechat',
        ...options.header
      },
      success: (response) => {
        console.log(`📡 API 响应 [${options.method || 'GET'}] ${options.url}:`, response);
        
        if (response.statusCode === 401) {
          // Token 过期，清除本地数据并跳转到登录页
          console.warn('⚠️ Token 已过期，跳转到登录页');
          wx.removeStorageSync('access_token');
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('user_info');
          
          wx.showToast({
            title: '登录已过期，请重新登录',
            icon: 'none',
            duration: 2000
          });
          
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/login/index' });
          }, 2000);
          
          reject(new Error('登录已过期'));
        } else if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data);
        } else {
          const errorMsg = response.data?.message || `请求失败 (${response.statusCode})`;
          console.error(`❌ API 错误:`, errorMsg);
          reject(new Error(errorMsg));
        }
      },
      fail: (error) => {
        console.error(`❌ 网络请求失败:`, error);
        reject(error);
      }
    });
  });
};

/**
 * 默认请求（自动判断是否需要 Token）
 */
const request = (options) => {
  const token = wx.getStorageSync('access_token') || wx.getStorageSync('token');
  
  if (token) {
    return authenticatedRequest(options);
  } else {
    return publicRequest(options);
  }
};

module.exports = {
  publicRequest,
  authenticatedRequest,
  request,
  BASE_URL
};

