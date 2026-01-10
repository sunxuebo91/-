/**
 * 认证服务
 * 从"安得家政"复制，用于处理登录、登出、Token 管理等
 */

const { publicRequest, authenticatedRequest } = require('../utils/request.js');

/**
 * 账号密码登录
 * @param {string} username 用户名
 * @param {string} password 密码
 * @returns {Promise<Object>} 登录结果
 */
const login = (username, password) => {
  console.log('🔐 开始账号密码登录:', username);
  
  return publicRequest({
    url: '/auth/login',
    method: 'POST',
    data: { username, password }
  });
};

/**
 * 获取当前登录用户信息
 * @returns {Promise<Object>} 用户信息
 */
const getCurrentUser = () => {
  console.log('👤 获取当前用户信息');
  
  return authenticatedRequest({
    url: '/auth/me',
    method: 'GET'
  });
};

/**
 * 验证 Token 是否有效
 * @returns {Promise<boolean>} Token 是否有效
 */
const validateToken = async () => {
  try {
    const token = wx.getStorageSync('access_token') || wx.getStorageSync('token');
    if (!token) {
      console.log('❌ 未找到 Token');
      return false;
    }
    
    console.log('🔍 验证 Token 有效性...');
    const response = await getCurrentUser();
    
    if (response && response.success) {
      console.log('✅ Token 有效');
      return true;
    } else {
      console.log('❌ Token 无效');
      return false;
    }
  } catch (error) {
    console.error('❌ Token 验证失败:', error);
    return false;
  }
};

/**
 * 保存认证数据
 * @param {Object} authData 认证数据
 */
const saveAuthData = (authData) => {
  try {
    console.log('💾 保存认证数据:', {
      hasToken: !!authData.access_token,
      userId: authData.user?.id,
      userName: authData.user?.name
    });
    
    // Token（双键存储，兼容性）
    wx.setStorageSync('access_token', authData.access_token);
    wx.setStorageSync('token', authData.access_token);
    
    // 用户信息（双键存储，兼容性）
    wx.setStorageSync('userInfo', authData.user);
    wx.setStorageSync('user_info', authData.user);
    
    // OpenID（如果有）
    if (authData.openid) {
      wx.setStorageSync('openid', authData.openid);
    }
    
    console.log('✅ 认证数据保存成功');
  } catch (error) {
    console.error('❌ 保存认证数据失败:', error);
    throw error;
  }
};

/**
 * 获取本地存储的用户信息
 * @returns {Object|null} 用户信息
 */
const getLocalUserInfo = () => {
  try {
    return wx.getStorageSync('userInfo') || wx.getStorageSync('user_info') || null;
  } catch (error) {
    console.error('❌ 获取用户信息失败:', error);
    return null;
  }
};

/**
 * 获取本地存储的 Token
 * @returns {string|null} Token
 */
const getLocalToken = () => {
  try {
    return wx.getStorageSync('access_token') || wx.getStorageSync('token') || null;
  } catch (error) {
    console.error('❌ 获取 Token 失败:', error);
    return null;
  }
};

/**
 * 检查是否已登录
 * @returns {boolean} 是否已登录
 */
const isLoggedIn = () => {
  const token = getLocalToken();
  const user = getLocalUserInfo();
  return !!(token && user);
};

/**
 * 登出（清除认证数据）
 */
const logout = () => {
  try {
    console.log('🚪 用户登出');
    
    wx.removeStorageSync('access_token');
    wx.removeStorageSync('token');
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('user_info');
    wx.removeStorageSync('openid');
    
    console.log('✅ 认证数据已清除');
  } catch (error) {
    console.error('❌ 清除认证数据失败:', error);
  }
};

module.exports = {
  login,
  getCurrentUser,
  validateToken,
  saveAuthData,
  getLocalUserInfo,
  getLocalToken,
  isLoggedIn,
  logout
};

