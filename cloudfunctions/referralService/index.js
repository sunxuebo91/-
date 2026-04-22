const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const https = require('https');

const CRM_BASE = 'https://crm.andejiazheng.com/api';

/** 向 CRM 发 GET 请求，返回解析后的 JSON */
function crmGet(path) {
  return new Promise((resolve, reject) => {
    https.get(CRM_BASE + path, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

/** 向 CRM 发 POST 请求，返回解析后的 JSON */
function crmPost(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(CRM_BASE + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Client-Type': 'miniprogram',
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const VERSION = 'v1.0.0';

// 注意：推荐人档案（referrers）和推荐记录（referral_resumes）已完全下沉 CRM，
// 小程序云开发不再持有这两张表。保留 referral_rewards / referral_binding_logs
// 以备后续本地侧功能（目前未使用，不做初始化）。

// ── 权限工具 ─────────────────────────────────────────────────
async function getStaffRecord(openid) {
  const r = await db.collection('staff').where({ openid }).limit(1).get();
  return (r.data && r.data[0]) || null;
}
async function checkIsAdmin(openid) {
  const s = await getStaffRecord(openid);
  return !!(s && s.isAdmin);
}

// ── 推荐人侧 ─────────────────────────────────────────────────

/** 申请成为推荐人：纯 CRM 模式，小程序侧不落任何数据 */
async function registerReferrer(openid, ev) {
  const { name, phone, sourceStaffId, sourcePhone, sourceOpenid, sourceCustomerId } = ev;
  console.log('[registerReferrer] openid=', openid, 'name=', name, 'phone=', phone, 'sourceCustomerId=', sourceCustomerId);

  if (!name || !phone) {
    return { success: false, message: '姓名和手机号不能为空' };
  }

  let crmRes;
  try {
    // 身份三件套 sourceStaffId / sourcePhone / sourceOpenid 一并下发，CRM 端任一命中即可定位 staff
    crmRes = await crmPost('/referral/miniprogram/register-referrer', {
      openid,
      name:             name.trim(),
      phone,
      sourceStaffId:    sourceStaffId    || '',
      sourcePhone:      sourcePhone      || '',
      sourceOpenid:     sourceOpenid     || '',
      sourceCustomerId: sourceCustomerId || '',
    });
  } catch (e) {
    console.error('[registerReferrer] CRM 提交失败:', e.message);
    return { success: false, message: '网络异常，请稍后重试' };
  }
  if (!crmRes || crmRes.success === false) {
    return { success: false, message: (crmRes && crmRes.message) || '提交失败，请稍后重试' };
  }
  console.log('[registerReferrer] CRM 成功 id=', crmRes.data && (crmRes.data.id || crmRes.data._id));
  return { success: true, data: crmRes.data || {} };
}

/** 查询当前用户的推荐人状态：纯 CRM 查询，审批通过时同步 users.role */
async function getReferrerInfo(openid) {
  let crmRes;
  try {
    crmRes = await crmGet(`/referral/miniprogram/referrer-status?openid=${encodeURIComponent(openid)}`);
  } catch (e) {
    console.error('[getReferrerInfo] CRM 查询失败:', e.message);
    return { success: false, message: '网络异常，请稍后重试' };
  }
  const crmData = (crmRes && crmRes.data) || null;

  // 审批通过：同步 users.role = referrer（小程序侧角色是本地自治的）
  if (crmData && crmData.approvalStatus === 'approved') {
    try {
      await db.collection('users').where({ _openid: openid }).update({
        data: { role: 'referrer', updatedAt: db.serverDate() },
      });
    } catch (e) { /* 忽略同步失败 */ }
  }

  return { success: true, data: crmData };
}

/** 去重查询（手机号 / 身份证号）
 *  CRM 侧去重（推荐库）+ 本地 resumes（阿姨简历库）双查，任一命中即判重复
 */
async function checkDuplicate(openid, ev) {
  const { phone, idCard } = ev;
  if (!phone && !idCard) return { success: true, isDuplicate: false };

  // 1. 查 CRM：推荐侧重复（兼容 {isDuplicate,...} 或 {data:{isDuplicate,...}} 两种格式）
  try {
    const qs = [];
    if (phone)  qs.push(`phone=${encodeURIComponent(phone)}`);
    if (idCard) qs.push(`idCard=${encodeURIComponent(idCard)}`);
    const crmRes = await crmGet(`/referral/miniprogram/check-duplicate?${qs.join('&')}`);
    const dup = crmRes && (crmRes.isDuplicate !== undefined ? crmRes : (crmRes.data || {}));
    if (dup && dup.isDuplicate) {
      return { success: true, isDuplicate: true, matchField: dup.matchField || 'phone' };
    }
  } catch (e) {
    console.warn('[checkDuplicate] CRM 查询失败，仅查本地 resumes:', e.message);
  }

  // 2. 查本地 resumes（阿姨简历库，小程序自治数据）
  const checks = [];
  if (phone)  checks.push({ field: 'phone',  val: phone });
  if (idCard) checks.push({ field: 'idCard', val: idCard });
  for (const { field, val } of checks) {
    const r = await db.collection('resumes').where({ [field]: val }).limit(1).get();
    if (r.data && r.data.length > 0) {
      return { success: true, isDuplicate: true, matchField: field };
    }
  }
  return { success: true, isDuplicate: false };
}

/** 推荐人提交阿姨简历：纯 CRM 模式 */
async function submitReferral(openid, ev) {
  // 从 CRM 拉推荐人状态 + 元数据
  let referrerStatus;
  try {
    const crmRes = await crmGet(`/referral/miniprogram/referrer-status?openid=${encodeURIComponent(openid)}`);
    referrerStatus = (crmRes && crmRes.data) || null;
  } catch (e) {
    console.error('[submitReferral] 查询推荐人状态失败:', e.message);
    return { success: false, message: '网络异常，请稍后重试' };
  }
  console.log('[submitReferral] CRM 推荐人状态=', referrerStatus && referrerStatus.approvalStatus);

  if (!referrerStatus || referrerStatus.approvalStatus !== 'approved') {
    return { success: false, message: '您还未通过推荐官审核，暂无法推荐' };
  }

  const { name, phone, idCard, serviceType, experience, remark } = ev;
  if (!name)  return { success: false, message: '请填写阿姨姓名' };
  if (!phone) return { success: false, message: '手机号为必填项' };

  // 调 CRM 提交（CRM 负责去重校验并落库）
  try {
    const crmRes = await crmPost('/referral/miniprogram/submit-referral', {
      openid,
      name:             name.trim(),
      phone:            phone || '',
      idCard:           idCard || '',
      serviceType:      serviceType || '',
      experience:       experience || '',
      remark:           remark || '',
      sourceStaffId:    referrerStatus.sourceStaffId    || '',
      sourceCustomerId: referrerStatus.sourceCustomerId || '',
    });
    if (!crmRes || crmRes.success === false) {
      return { success: false, message: (crmRes && crmRes.message) || '提交失败，请稍后重试' };
    }
    console.log('[submitReferral] CRM 写入成功 id=', crmRes.data && (crmRes.data.id || crmRes.data._id));
    return { success: true, data: crmRes.data || {} };
  } catch (e) {
    console.error('[submitReferral] CRM 提交失败:', e.message);
    return { success: false, message: '网络异常，请稍后重试' };
  }
}

/** 归一化 CRM 返回记录的 ID 字段：兼容 id / _id 两种命名，小程序统一读 _id */
function normalizeId(item) {
  if (!item || typeof item !== 'object') return item;
  return { ...item, _id: item._id || item.id || '' };
}

/** 我的推荐列表：纯 CRM 代理 */
async function getMyReferrals(openid, ev) {
  const { page = 1, pageSize = 20 } = ev;
  try {
    const crmRes = await crmGet(`/referral/miniprogram/my-referrals?openid=${encodeURIComponent(openid)}&page=${page}&pageSize=${pageSize}`);
    if (!crmRes || crmRes.success === false) {
      return { success: false, message: (crmRes && crmRes.message) || '加载失败，请重试' };
    }
    const rawList = (crmRes.data && crmRes.data.list) || crmRes.data || [];
    const data = Array.isArray(rawList) ? rawList.map(normalizeId) : [];
    const total = (crmRes.data && crmRes.data.total) || crmRes.total || data.length;
    return { success: true, data, total };
  } catch (e) {
    console.error('[getMyReferrals] CRM 请求失败:', e.message);
    return { success: false, message: '网络异常，请稍后重试' };
  }
}

/** 推荐记录详情：纯 CRM 代理 */
async function getReferralDetail(openid, ev) {
  const { id } = ev;
  if (!id) return { success: false, message: '缺少记录ID' };
  try {
    const crmRes = await crmGet(`/referral/miniprogram/referral-detail/${encodeURIComponent(id)}?openid=${encodeURIComponent(openid)}`);
    if (!crmRes || crmRes.success === false) {
      return { success: false, message: (crmRes && crmRes.message) || '加载失败，请重试' };
    }
    // 归一化 _id，避免小程序端读 detail._id 为 undefined
    const data = crmRes.data ? normalizeId(crmRes.data) : null;
    // 兜底：若 CRM 没有返回 _id 也没有 id，把入参 id 回填，保证后续 applySettlement 能拿到 referralId
    if (data && !data._id) data._id = id;
    return { success: true, data };
  } catch (e) {
    console.error('[getReferralDetail] CRM 请求失败:', e.message);
    return { success: false, message: '网络异常，请稍后重试' };
  }
}

// ── 员工侧 ───────────────────────────────────────────────────

/** 员工：分配给我的待审核简历列表（纯 CRM 代理） */
async function getMyAssignedReferrals(openid, ev) {
  const { reviewStatus, page = 1, pageSize = 20 } = ev;
  try {
    const qs = [`openid=${encodeURIComponent(openid)}`, `page=${page}`, `pageSize=${pageSize}`];
    if (reviewStatus) qs.push(`reviewStatus=${encodeURIComponent(reviewStatus)}`);
    const crmRes = await crmGet(`/referral/staff/assigned-referrals?${qs.join('&')}`);
    if (!crmRes || crmRes.success === false) {
      return { success: false, message: (crmRes && crmRes.message) || '加载失败，请重试' };
    }
    const data = (crmRes.data && crmRes.data.list) || crmRes.data || [];
    const total = (crmRes.data && crmRes.data.total) || crmRes.total || data.length;
    return { success: true, data, total };
  } catch (e) {
    console.error('[getMyAssignedReferrals] CRM 请求失败:', e.message);
    return { success: false, message: '网络异常，请稍后重试' };
  }
}

/** 员工：审核推荐简历（纯 CRM 代理） */
async function reviewReferral(openid, ev) {
  const { id, result, note } = ev;
  if (!id || !result) return { success: false, message: '缺少参数' };
  try {
    const crmRes = await crmPost('/referral/staff/review-referral', {
      openid, id, result, note: note || '',
    });
    if (!crmRes || crmRes.success === false) {
      return { success: false, message: (crmRes && crmRes.message) || '审核失败，请重试' };
    }
    return { success: true };
  } catch (e) {
    console.error('[reviewReferral] CRM 请求失败:', e.message);
    return { success: false, message: '网络异常，请稍后重试' };
  }
}

/** 推荐官申请结算：CRM 负责校验记录归属和状态，小程序仅透传 */
async function applySettlement(openid, ev) {
  const { referralId, crmId, idCard, payeeName, payeePhone, bankCard, bankName, rewardAmount } = ev;
  if (!referralId && !crmId) return { success: false, message: '缺少推荐记录ID' };
  if (!idCard)      return { success: false, message: '请填写身份证号' };
  if (!payeeName)   return { success: false, message: '请填写收款姓名' };
  if (!payeePhone)  return { success: false, message: '请填写收款手机号' };
  if (!bankCard)    return { success: false, message: '请填写银行卡号' };
  if (!bankName)    return { success: false, message: '请填写开户行' };

  try {
    const crmRes = await crmPost('/referral/miniprogram/apply-settlement', {
      openid,
      crmId:        crmId || '',
      referralId:   referralId || '',
      idCard,
      payeeName,
      payeePhone,
      bankCard,
      bankName,
      rewardAmount: rewardAmount || 0,
    });
    if (!crmRes || crmRes.success === false) {
      return { success: false, message: (crmRes && crmRes.message) || '申请失败，请稍后重试' };
    }
    return { success: true };
  } catch (e) {
    console.error('[applySettlement] CRM 请求失败:', e.message);
    return { success: false, message: '网络异常，请稍后重试' };
  }
}

// ── 管理员侧 ─────────────────────────────────────────────────
// 注意：推荐人注册审批已全部迁移至 CRM（crm.andejiazheng.com），
// 以下三个函数仅作兼容保留（如小程序角标调用），不做任何本地审批写入。

/** 待审批列表：审批已迁移 CRM，此处恒返回空，仅为兼容 profile 角标调用 */
async function listPendingReferrers(openid, ev) {
  const adminFlag = await checkIsAdmin(openid);
  if (!adminFlag) return { success: false, message: '无权操作' };
  return { success: true, data: [], total: 0 };
}

/** 通过推荐人申请：已迁移 CRM，不再提供小程序端入口 */
async function approveReferrer(openid, ev) {
  return { success: false, message: '推荐人审批已迁移至 CRM 后台，请在 CRM 管理端操作' };
}

/** 拒绝推荐人申请：已迁移 CRM，不再提供小程序端入口 */
async function rejectReferrer(openid, ev) {
  return { success: false, message: '推荐人审批已迁移至 CRM 后台，请在 CRM 管理端操作' };
}

/** 获取工种列表（代理 CRM，供推荐录入页下拉选择用） */
async function getJobTypes() {
  const res = await crmGet('/referral/miniprogram/job-types');
  return { success: true, data: (res && res.data) || [] };
}

// ── 入口 ─────────────────────────────────────────────────────
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action;

  console.log('[referralService]', VERSION, 'action=', action, 'openid=', openid);

  try {
    switch (action) {
      // 推荐人侧
      case 'registerReferrer':       return await registerReferrer(openid, event);
      case 'getReferrerInfo':        return await getReferrerInfo(openid);
      case 'checkDuplicate':         return await checkDuplicate(openid, event);
      case 'submitReferral':         return await submitReferral(openid, event);
      case 'getMyReferrals':         return await getMyReferrals(openid, event);
      case 'getReferralDetail':      return await getReferralDetail(openid, event);
      case 'getJobTypes':            return await getJobTypes();
      case 'applySettlement':        return await applySettlement(openid, event);
      // 员工侧
      case 'getMyAssignedReferrals': return await getMyAssignedReferrals(openid, event);
      case 'reviewReferral':         return await reviewReferral(openid, event);
      // 管理员侧
      case 'listPendingReferrers':   return await listPendingReferrers(openid, event);
      case 'approveReferrer':        return await approveReferrer(openid, event);
      case 'rejectReferrer':         return await rejectReferrer(openid, event);
      default:
        return { success: false, errMsg: 'unknown action: ' + action };
    }
  } catch (e) {
    console.error('[referralService] error:', e);
    return { success: false, errMsg: e && e.message ? e.message : String(e) };
  }
};
