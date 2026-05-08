/**
 * 员工身份统一处理：所有页面/登录入口都走这里，避免 isStaff 在多个路径上不同步
 * 数据流：CRM staff 表 → /api/resumes/staff/info?phone=xxx → 本地 crmUserInfo 缓存
 */

const CRM_BASE = 'https://crm.andejiazheng.com';

// 用 phone 到 CRM 拉员工档案，命中即把 isStaff/crmName/crmAvatar 写回 crmUserInfo
// 返回最终的 isStaff（boolean）
function refreshStaffIdentity(phone) {
  return new Promise((resolve) => {
    if (!phone) return resolve(false);
    wx.request({
      url: `${CRM_BASE}/api/resumes/staff/info?phone=${encodeURIComponent(phone)}`,
      method: 'GET',
      success: (res) => {
        const data = res && res.data && res.data.success ? res.data.data : null;
        // staff 表查得到、且未离职/禁用，才算员工
        const ok = !!(data && data.isActive !== false);
        if (!ok) return resolve(false);
        try {
          const info = wx.getStorageSync('crmUserInfo') || {};
          info.isStaff = true;
          if (data.name) info.crmName = data.name;
          if (data.avatar) info.crmAvatar = data.avatar;
          if (!info.phone) info.phone = phone;
          wx.setStorageSync('crmUserInfo', info);
        } catch (e) { /* 写缓存失败不影响返回值 */ }
        resolve(true);
      },
      fail: () => resolve(false),
    });
  });
}

// 兜底入口：缓存里 isStaff 已是 true 直接返回；否则用缓存 phone 调一次 CRM 修正
// 给 resumeDetail / resumeList / salaryAssessment 等页面统一调用
async function ensureStaffIdentity() {
  const info = wx.getStorageSync('crmUserInfo') || {};
  if (info.isStaff === true) return true;
  if (info.phone) {
    return await refreshStaffIdentity(info.phone);
  }
  return false;
}

// 把 openid<->phone 绑定关系同步到 CRM miniprogram_users 表，并保存 JWT
// 返回 CRM register 接口里的 data 对象（含 isStaff 等字段），失败返回 null
function syncCrmRegister({ openid, phone, nickname, avatar }) {
  return new Promise((resolve) => {
    if (!openid || !phone) return resolve(null);
    wx.request({
      url: `${CRM_BASE}/api/miniprogram-users/register`,
      method: 'POST',
      data: {
        openid,
        phone,
        nickname: nickname || '',
        avatar: avatar || '',
        gender: 0,
        city: '',
        province: '',
      },
      header: { 'Content-Type': 'application/json' },
      success: (res) => {
        if (!(res && res.data && res.data.success)) return resolve(null);
        const crmData = res.data.data || {};
        const token = res.data.access_token || res.data.token
          || crmData.access_token || crmData.token;
        if (token) {
          try {
            wx.setStorageSync('access_token', token);
            wx.setStorageSync('token', token);
          } catch (e) { /* ignore */ }
        }
        resolve(crmData);
      },
      fail: () => resolve(null),
    });
  });
}

// 解析当前用户角色：staff（员工）> auntie（阿姨）> customer（客户）
// 员工走 CRM staff 表；阿姨走 referralService.checkDuplicate（phone 命中 resumes/referral_resumes 即视为阿姨）
// 阿姨身份命中后写回 crmUserInfo.isAuntie，避免重复请求
async function getUserRole() {
  const info = wx.getStorageSync('crmUserInfo') || {};

  // 1. 员工：缓存命中直接返回；否则用 phone 兜底校验
  if (info.isStaff === true) return 'staff';
  if (info.phone) {
    const ok = await refreshStaffIdentity(info.phone);
    if (ok) return 'staff';
  }

  // 2. 阿姨：缓存命中直接返回
  if (info.isAuntie === true) return 'auntie';

  // 3. 阿姨：调云函数到 CRM/本地 resumes 库按 phone 查
  if (info.phone) {
    try {
      const resp = await wx.cloud.callFunction({
        name: 'referralService',
        data: { action: 'checkDuplicate', phone: info.phone },
      });
      const r = resp && resp.result;
      if (r && r.success && r.isDuplicate && r.matchField === 'phone') {
        try {
          const latest = wx.getStorageSync('crmUserInfo') || {};
          latest.isAuntie = true;
          wx.setStorageSync('crmUserInfo', latest);
        } catch (e) { /* 写缓存失败不影响返回值 */ }
        return 'auntie';
      }
    } catch (e) {
      console.warn('[getUserRole] checkDuplicate 调用失败（视为客户）:', e && e.message);
    }
  }

  // 4. 默认客户
  return 'customer';
}

module.exports = {
  refreshStaffIdentity,
  ensureStaffIdentity,
  syncCrmRegister,
  getUserRole,
};
