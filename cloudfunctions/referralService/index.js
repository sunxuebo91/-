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

// ── 集合初始化 ──────────────────────────────────────────────
async function safeCreateCollection(name) {
  try { await db.createCollection(name); } catch (e) { /* 已存在则忽略 */ }
}
async function ensureCollections() {
  await Promise.all([
    safeCreateCollection('referrers'),
    safeCreateCollection('referral_resumes'),
    safeCreateCollection('referral_rewards'),
    safeCreateCollection('referral_binding_logs'),
  ]);
}

// ── 权限工具 ─────────────────────────────────────────────────
async function getStaffRecord(openid) {
  const r = await db.collection('staff').where({ openid }).limit(1).get();
  return (r.data && r.data[0]) || null;
}
async function checkIsAdmin(openid) {
  const s = await getStaffRecord(openid);
  return !!(s && s.isAdmin);
}
async function getReferrerRecord(openid) {
  const r = await db.collection('referrers').where({ openid }).limit(1).get();
  return (r.data && r.data[0]) || null;
}

// ── 推荐人侧 ─────────────────────────────────────────────────

/** 申请成为推荐人（pending_approval） */
async function registerReferrer(openid, ev) {
  const { name, phone, sourceStaffId, sourceCustomerId } = ev;
  console.log('[registerReferrer] openid=', openid, 'name=', name, 'phone=', phone, 'sourceCustomerId=', sourceCustomerId);

  if (!name || !phone) {
    console.log('[registerReferrer] 缺少必填参数');
    return { success: false, message: '姓名和手机号不能为空' };
  }

  const existing = await getReferrerRecord(openid);
  if (existing) {
    console.log('[registerReferrer] 已有记录:', existing._id, 'status=', existing.approvalStatus);
    return { success: false, message: '您已提交过申请', data: existing };
  }

  const doc = {
    openid,
    name: name.trim(),
    phone,
    sourceStaffId:    sourceStaffId    || '',
    sourceCustomerId: sourceCustomerId || '',  // 来源客户订单 ID（推荐链路关键字段）
    approvalStatus: 'pending_approval',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };
  const addRes = await db.collection('referrers').add({ data: doc });
  console.log('[registerReferrer] 写入成功, _id=', addRes._id, 'sourceCustomerId=', doc.sourceCustomerId);
  return { success: true, data: { ...doc, _id: addRes._id } };
}

/** 查询当前用户的推荐人状态 */
async function getReferrerInfo(openid) {
  const record = await getReferrerRecord(openid);
  return { success: true, data: record || null };
}

/** 去重查询（手机号 / 身份证号）
 *  同时查 referral_resumes（推荐库）和 resumes（阿姨简历库），任一命中即判重复
 */
async function checkDuplicate(openid, ev) {
  const { phone, idCard } = ev;
  if (!phone && !idCard) return { success: true, isDuplicate: false };

  const checks = [];
  if (phone)  checks.push({ field: 'phone',  val: phone });
  if (idCard) checks.push({ field: 'idCard', val: idCard });

  for (const { field, val } of checks) {
    // 同时查两个集合，任一命中即返回重复
    const [r1, r2] = await Promise.all([
      db.collection('referral_resumes').where({ [field]: val }).limit(1).get(),
      db.collection('resumes').where({ [field]: val }).limit(1).get(),
    ]);
    if ((r1.data && r1.data.length > 0) || (r2.data && r2.data.length > 0)) {
      return { success: true, isDuplicate: true, matchField: field };
    }
  }
  return { success: true, isDuplicate: false };
}

/** 推荐人提交阿姨简历 */
async function submitReferral(openid, ev) {
  let referrer = await getReferrerRecord(openid);
  console.log('[submitReferral] caller openid=', openid,
    '| referrer found=', !!referrer,
    '| approvalStatus=', referrer ? referrer.approvalStatus : 'N/A');

  // 本地状态不是 approved 时，去 CRM 查一次（CRM 是审批的来源）
  if (referrer && referrer.approvalStatus !== 'approved') {
    try {
      const crmRes = await crmGet(`/referral/miniprogram/referrer-status?openid=${openid}`);
      const crmStatus = crmRes && crmRes.data && crmRes.data.status;
      console.log('[submitReferral] CRM 审批状态=', crmStatus);
      if (crmStatus === 'approved') {
        // 同步修正本地记录，后续不再需要回查 CRM
        await db.collection('referrers').doc(referrer._id).update({
          data: { approvalStatus: 'approved', updatedAt: db.serverDate() },
        });
        referrer = { ...referrer, approvalStatus: 'approved' };
      }
    } catch (e) {
      console.warn('[submitReferral] CRM 查询失败，跳过:', e.message);
    }
  }

  if (!referrer || referrer.approvalStatus !== 'approved') {
    return { success: false, message: '您还未通过推荐官审核，暂无法推荐' };
  }

  const { name, phone, idCard, serviceType, experience, remark } = ev;
  if (!name) return { success: false, message: '请填写阿姨姓名' };
  if (!phone) return { success: false, message: '手机号为必填项' };

  // ── 第一步：先调 CRM（阻塞）——CRM 负责去重校验并落库到 MongoDB ──
  // CRM 返回 success:false 或 HTTP 400 时，直接把 message 透传给用户
  let crmRecordId = '';
  try {
    const crmRes = await crmPost('/referral/miniprogram/submit-referral', {
      openid,
      name:            name.trim(),
      phone:           phone || '',
      idCard:          idCard || '',
      serviceType:     serviceType || '',
      experience:      experience || '',
      remark:          remark || '',
      sourceStaffId:   referrer.sourceStaffId    || '',
      sourceCustomerId:referrer.sourceCustomerId || '',
    });
    if (!crmRes || crmRes.success === false) {
      // 透传 CRM 的去重/业务错误文案
      return { success: false, message: (crmRes && crmRes.message) || '提交失败，请稍后重试' };
    }
    crmRecordId = (crmRes.data && (crmRes.data.id || crmRes.data._id)) || '';
  } catch (e) {
    console.error('[submitReferral] CRM 提交失败:', e.message);
    return { success: false, message: '网络异常，请稍后重试' };
  }

  // ── 第二步：CRM 成功后写本地薄记录（仅保留导航元数据，展示数据均从 CRM 取）──
  const doc = {
    referrerId:       referrer._id,
    referrerOpenid:   openid,
    assignedStaffId:  referrer.sourceStaffId    || '',
    customerId:       referrer.sourceCustomerId || '',
    crmId:            crmRecordId,   // 关联 CRM 记录，用于详情页白名单覆盖
    name:             name.trim(),   // 冗余保留，供本地列表首字匹配兜底
    phone:            phone || '',
    serviceType:      serviceType || '',
    status:           'pending',
    createdAt:        db.serverDate(),
    updatedAt:        db.serverDate(),
  };
  const addRes = await db.collection('referral_resumes').add({ data: doc });
  console.log('[submitReferral] 本地薄记录写入成功 _id=', addRes._id, 'crmId=', crmRecordId);

  return { success: true, data: { ...doc, _id: addRes._id } };
}

/** 获取我的推荐列表（本地库全量 + CRM状态合并） */
async function getMyReferrals(openid, ev) {
  const { page = 1, pageSize = 20 } = ev;

  // 1. 从本地库拿全量
  const [r, countR] = await Promise.all([
    db.collection('referral_resumes')
      .where({ referrerOpenid: openid })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get(),
    db.collection('referral_resumes').where({ referrerOpenid: openid }).count(),
  ]);
  let list = r.data || [];

  // 2. 拉 CRM 数据，以 CRM 为展示字段权威来源（白名单显式覆盖）
  // 匹配优先级：crmId 精确匹配 > 姓名首字+服务类型兜底
  const CRM_LIST_DISPLAY_KEYS = [
    // 'name' 不从 CRM 覆盖：推荐官视角应显示完整姓名（本地提交值），CRM 返回的是脱敏值
    'serviceType', 'createdAt', 'experience', 'remark',
    'status', 'statusLabel', 'contractSignedAt', 'onboardedAt',
    'rewardAmount', 'rewardExpectedAt', 'rewardPaidAt',
  ];
  try {
    const crmRes = await crmGet(`/referral/miniprogram/my-referrals?openid=${openid}&page=1&pageSize=100`);
    const crmList = crmRes && crmRes.data && crmRes.data.list;
    if (Array.isArray(crmList) && crmList.length > 0) {
      // 建两个索引：crmId 精确索引 + 首字+服务类型兜底索引
      const crmById  = {};
      const crmByKey = {};
      crmList.forEach(c => {
        if (c._id) crmById[c._id] = c;
        const key = (c.name || '')[0] + '|' + (c.serviceType || '');
        if (!crmByKey[key]) crmByKey[key] = c;  // 同 key 取第一条
      });

      list = list.map(item => {
        const crm = crmById[item.crmId]
          || crmByKey[(item.name || '')[0] + '|' + (item.serviceType || '')];
        if (!crm) return item;

        // 只覆盖白名单字段，undefined 不覆盖
        const override = {};
        for (const key of CRM_LIST_DISPLAY_KEYS) {
          if (crm[key] !== undefined) override[key] = crm[key];
        }
        // 保留本地系统字段（_id / referrerOpenid / crmId / assignedStaffId 等）
        return { ...item, ...override };
      });
      console.log('[getMyReferrals] CRM合并完成，CRM条数=', crmList.length);
    }
  } catch (e) {
    console.warn('[getMyReferrals] CRM合并失败，使用本地状态:', e.message);
  }

  return { success: true, data: list, total: countR.total || 0 };
}

/** 推荐记录详情（脱敏：仅推荐人自己可看） */
async function getReferralDetail(openid, ev) {
  const { id } = ev;
  if (!id) return { success: false, message: '缺少记录ID' };
  const r = await db.collection('referral_resumes').doc(id).get();
  const record = r.data;
  if (record.referrerOpenid !== openid) {
    const adminFlag = await checkIsAdmin(openid);
    const staffRec = await getStaffRecord(openid);
    if (!adminFlag && !(staffRec && record.assignedStaffId === openid)) {
      return { success: false, message: '无权查看' };
    }
  }

  // CRM 为展示字段的唯一权威来源，有 crmId 时全量覆盖本地库同名字段
  // 本地 record 只保留系统元数据（_id / referrerOpenid / crmId / assignedStaffId 等）
  const CRM_DISPLAY_KEYS = [
    // 'name' 不从 CRM 覆盖：推荐官视角应显示完整姓名（本地提交值），CRM 返回的是脱敏值
    'serviceType', 'status', 'statusLabel',
    'experience', 'remark', 'createdAt',
    'contractSignedAt', 'onboardedAt',
    'serviceFee', 'rewardAmount', 'rewardExpectedAt', 'rewardPaidAt',
    'contract',
    'reviewNote',       // 审核不通过原因
    'sourceStaffName',  // 推荐归属人姓名（CRM 若返回则优先）
  ];

  // 推荐归属人：从 staff_profiles 用 assignedStaffId（= CRM staffId）查员工姓名
  // 注意：assignedStaffId 是 CRM 侧数字/字符串 ID，staff_profiles 用 staffId 字段存储，
  // 不是 staffOpenid（微信 openid），两者不同，必须用 staffId 查。
  let sourceStaffName = '';
  if (record.assignedStaffId) {
    try {
      const idStr = String(record.assignedStaffId);
      let sp = await db.collection('staff_profiles')
        .where({ staffId: idStr })
        .limit(1)
        .get();
      // 兼容旧数据：staffId 可能以数字类型存储
      if ((!sp.data || !sp.data.length) && !isNaN(Number(idStr))) {
        sp = await db.collection('staff_profiles')
          .where({ staffId: Number(idStr) })
          .limit(1)
          .get();
      }
      sourceStaffName = (sp.data && sp.data[0] && sp.data[0].name) || '';
    } catch (e) {
      console.warn('[getReferralDetail] 查员工姓名失败:', e.message);
    }
  }

  try {
    if (record.crmId) {
      const crmRes = await crmGet(`/referral/miniprogram/referral-detail/${record.crmId}?openid=${openid}`);
      const crmData = crmRes && crmRes.data;
      if (crmData) {
        // 只把 CRM 里有定义的 key 覆盖，undefined 字段不覆盖（保留本地值兜底）
        const crmOverride = {};
        for (const key of CRM_DISPLAY_KEYS) {
          if (crmData[key] !== undefined) crmOverride[key] = crmData[key];
        }
        // sourceStaffName：CRM 未返回时用本地 staff_profiles 值兜底
        if (!crmOverride.sourceStaffName) crmOverride.sourceStaffName = sourceStaffName;
        return { success: true, data: { ...record, ...crmOverride } };
      }
    } else {
      // 没有 crmId：用列表接口按首字+服务类型匹配，同样走白名单覆盖（取 serviceType 等字段）
      const crmRes = await crmGet(`/referral/miniprogram/my-referrals?openid=${openid}&page=1&pageSize=100`);
      const crmList = crmRes && crmRes.data && crmRes.data.list;
      if (Array.isArray(crmList)) {
        const key = (record.name || '')[0] + '|' + (record.serviceType || '');
        const hit = crmList.find(c => (c.name || '')[0] + '|' + (c.serviceType || '') === key);
        if (hit) {
          const crmOverride = {};
          for (const k of CRM_DISPLAY_KEYS) {
            if (hit[k] !== undefined) crmOverride[k] = hit[k];
          }
          if (!crmOverride.sourceStaffName) crmOverride.sourceStaffName = sourceStaffName;
          return { success: true, data: { ...record, ...crmOverride } };
        }
      }
    }
  } catch (e) {
    console.warn('[getReferralDetail] CRM 数据获取失败，降级到本地数据:', e.message);
  }

  // 降级：CRM 不可达时返回本地库数据（附员工姓名兜底）
  return { success: true, data: { ...record, sourceStaffName } };
}

// ── 员工侧 ───────────────────────────────────────────────────

/** 获取分配给我的推荐简历列表 */
async function getMyAssignedReferrals(openid, ev) {
  const { reviewStatus, page = 1, pageSize = 20 } = ev;
  const query = { assignedStaffId: openid };
  if (reviewStatus) query.reviewStatus = reviewStatus;

  const [r, countR] = await Promise.all([
    db.collection('referral_resumes')
      .where(query)
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get(),
    db.collection('referral_resumes').where(query).count(),
  ]);
  return { success: true, data: r.data || [], total: countR.total || 0 };
}

/** 审核推荐简历（通过/拒绝） */
async function reviewReferral(openid, ev) {
  const { id, result, note } = ev;
  if (!id || !result) return { success: false, message: '缺少参数' };

  const r = await db.collection('referral_resumes').doc(id).get();
  const record = r.data;
  if (record.assignedStaffId !== openid) {
    const adminFlag = await checkIsAdmin(openid);
    if (!adminFlag) return { success: false, message: '无权操作此记录' };
  }

  const newReviewStatus = result === 'approve' ? 'reviewed' : 'review_rejected';
  await db.collection('referral_resumes').doc(id).update({
    data: {
      reviewStatus: newReviewStatus,
      reviewedBy: openid,
      reviewNote: note || '',
      updatedAt: db.serverDate(),
    },
  });
  return { success: true };
}

/** 推荐官申请结算（已上户状态下提交收款信息，触发 CRM 返费审核流程） */
async function applySettlement(openid, ev) {
  const { referralId, crmId, payeeName, payeePhone, bankCard, bankName, rewardAmount } = ev;
  if (!referralId && !crmId) return { success: false, message: '缺少推荐记录ID' };
  if (!payeeName)   return { success: false, message: '请填写收款姓名' };
  if (!payeePhone)  return { success: false, message: '请填写收款手机号' };
  if (!bankCard)    return { success: false, message: '请填写银行卡号' };
  if (!bankName)    return { success: false, message: '请填写开户行' };

  // 校验推荐记录归属
  if (referralId) {
    const r = await db.collection('referral_resumes').doc(referralId).get();
    if (!r.data || r.data.referrerOpenid !== openid) {
      return { success: false, message: '无权操作此记录' };
    }
  }

  // 调 CRM 提交结算申请（CRM 负责校验状态为 onboarded 并保存收款信息）
  try {
    const crmRes = await crmPost('/referral/miniprogram/apply-settlement', {
      openid,
      crmId:        crmId || '',
      referralId:   referralId || '',
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

/** 待审批的推荐人申请列表 */
async function listPendingReferrers(openid, ev) {
  const adminFlag = await checkIsAdmin(openid);
  if (!adminFlag) return { success: false, message: '无权操作' };

  const { page = 1, pageSize = 20 } = ev;
  const query = { approvalStatus: 'pending_approval' };
  const [r, countR] = await Promise.all([
    db.collection('referrers')
      .where(query)
      .orderBy('createdAt', 'asc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get(),
    db.collection('referrers').where(query).count(),
  ]);
  return { success: true, data: r.data || [], total: countR.total || 0 };
}

/** 通过推荐人申请 */
async function approveReferrer(openid, ev) {
  const adminFlag = await checkIsAdmin(openid);
  if (!adminFlag) return { success: false, message: '无权操作' };

  const { referrerId } = ev;
  if (!referrerId) return { success: false, message: '缺少推荐人ID' };

  const r = await db.collection('referrers').doc(referrerId).get();
  const referrer = r.data;

  await db.collection('referrers').doc(referrerId).update({
    data: {
      approvalStatus: 'approved',
      approvedBy: openid,
      approvedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });

  // 更新 users 集合 role → referrer
  if (referrer.openid) {
    await db.collection('users').where({ _openid: referrer.openid }).update({
      data: { role: 'referrer', updatedAt: db.serverDate() },
    });
  }
  return { success: true };
}

/** 拒绝推荐人申请 */
async function rejectReferrer(openid, ev) {
  const adminFlag = await checkIsAdmin(openid);
  if (!adminFlag) return { success: false, message: '无权操作' };

  const { referrerId, reason } = ev;
  if (!referrerId) return { success: false, message: '缺少推荐人ID' };

  await db.collection('referrers').doc(referrerId).update({
    data: {
      approvalStatus: 'rejected',
      rejectedReason: reason || '',
      rejectedBy: openid,
      updatedAt: db.serverDate(),
    },
  });
  return { success: true };
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
    await ensureCollections();

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
