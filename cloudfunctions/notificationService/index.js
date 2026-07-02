const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const https = require('https');

const db = cloud.database();

// 订阅消息模板 ID
const RESUME_VIEW_TEMPLATE_ID = 'VXhA_qhgIRRy8avH1X9uE-eLGk--0M5Bs9Q27EEDmrM';
const ORDER_GRAB_TEMPLATE_ID  = 'BLTv1XLncYInvkyERP8fgoHtM0UQoXOwgK4SmbQF93E';

// 格式化时间：2024年04月10日 16:30
function formatViewTime(date) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}年${m}月${day}日 ${h}:${min}`;
}

// 按手机号查员工的微信 openid
// 查询顺序：① users.phone → ② staff_profiles.staffOpenid（员工分享时写入）
async function getOpenidByPhone(phone) {
  const phoneStr = String(phone);

  // ① 先查 users 集合（标准路径：用户通过 loginByPhone 授权后写入）
  const r = await db.collection('users').where({ phone: phoneStr }).limit(1).get();
  if (r.data && r.data[0] && r.data[0]._openid) {
    console.log('[getOpenidByPhone] 从 users 集合找到 openid');
    return r.data[0]._openid;
  }

  // ② 回退查 staff_profiles（员工每次生成海报/分享简历时由 saveStaffProfile 写入 staffOpenid）
  const s = await db.collection('staff_profiles').where({ phone: phoneStr }).limit(1).get();
  if (s.data && s.data[0] && s.data[0].staffOpenid) {
    console.log('[getOpenidByPhone] 从 staff_profiles 找到 openid');
    return s.data[0].staffOpenid;
  }

  console.warn('[getOpenidByPhone] 两个集合均未找到 openid, phone:', phone);
  return null;
}

// 发送"简历被查看"订阅通知给员工
async function sendResumeViewNotify(event) {
  const { sharerPhone, customerName, nurseName, resumeId } = event;

  console.log('[sendResumeViewNotify] 入参:', { sharerPhone, customerName, nurseName, resumeId });

  if (!sharerPhone) return { success: false, errMsg: '缺少 sharerPhone' };
  if (!nurseName)   return { success: false, errMsg: '缺少 nurseName' };

  const viewTime = formatViewTime(new Date());
  const safeCustomerName = (customerName || '新客户').slice(0, 20);
  const safeNurseName = nurseName.slice(0, 20);
  const page = resumeId
    ? `pages/resumeDetail/index?id=${encodeURIComponent(resumeId)}`
    : 'pages/resumeList/index';

  // --- 1. 写入 CRM 站内信（强通知/留痕） ---
  await writeCrmNotification({
    phone: sharerPhone,
    type: 'resume_view',
    title: '简历被查看提醒',
    content: `客户 ${safeCustomerName} 查看了阿姨 ${safeNurseName} 的简历`,
    page
  });

  // --- 2. 发送订阅消息（即时推送） ---
  const touser = await getOpenidByPhone(sharerPhone);
  if (!touser) {
    console.warn('[sendResumeViewNotify] 未找到员工 openid，仅写入站内信');
    return { success: true, msg: '已记录站内信，但未找到微信账号发送订阅消息' };
  }

  try {
    await cloud.openapi.subscribeMessage.send({
      touser,
      template_id: RESUME_VIEW_TEMPLATE_ID,
      page,
      data: {
        thing6: { value: safeCustomerName },                    // 预约人
        thing8: { value: safeNurseName },                       // 服务人员
        thing7: { value: '客户已查看阿姨简历，请及时跟进' },      // 温馨提示
        time4:  { value: viewTime },                            // 预约时间
      },
      miniprogram_state: 'formal'
    });
    return { success: true };
  } catch (err) {
    console.error('[sendResumeViewNotify] 订阅消息发送失败:', err.errCode, err.errMsg);
    return { success: true, msg: '站内信已发，订阅消息发送失败', errCode: err.errCode };
  }
}

// 发送"抢单成功"订阅通知给订单发布人（员工）
async function sendOrderGrabNotify(event) {
  const { publisherPhone, auntieName, serviceTypeLabel, orderId } = event;

  if (!publisherPhone) return { success: false, errMsg: '缺少 publisherPhone' };
  if (!auntieName)     return { success: false, errMsg: '缺少 auntieName' };

  const grabTime = formatViewTime(new Date());
  const safeAuntieName   = (auntieName       || '').slice(0, 20);
  const safeServiceType  = (serviceTypeLabel || '家政服务').slice(0, 20);
  const page = orderId
    ? `pages/orderHall/detail?id=${encodeURIComponent(orderId)}`
    : 'pages/orderHall/index';

  // --- 1. 写入 CRM 站内信 ---
  await writeCrmNotification({
    phone: publisherPhone,
    type: 'order_grab',
    title: '接单成功提醒',
    content: `阿姨 ${safeAuntieName} 已抢占您发布的 ${safeServiceType} 订单`,
    page
  });

  // --- 2. 发送订阅消息 ---
  const touser = await getOpenidByPhone(publisherPhone);
  if (!touser) {
    console.warn('[sendOrderGrabNotify] 未找到员工 openid，仅写入站内信');
    return { success: true, msg: '已记录站内信，但未找到微信账号发送订阅消息' };
  }

  try {
    await cloud.openapi.subscribeMessage.send({
      touser,
      template_id: ORDER_GRAB_TEMPLATE_ID,
      page,
      data: {
        thing10: { value: safeAuntieName  },   // 接单人员（阿姨姓名）
        thing5:  { value: safeServiceType },   // 服务类型（工种）
        time9:   { value: grabTime        },   // 接单时间
      },
      miniprogram_state: 'formal',
    });
    return { success: true };
  } catch (err) {
    console.error('[sendOrderGrabNotify] 订阅消息发送失败:', err.errCode, err.errMsg);
    return { success: true, msg: '站内信已发，订阅消息发送失败', errCode: err.errCode };
  }
}

/**
 * 写入 CRM 站内通知
 */
async function writeCrmNotification({ phone, type, title, content, page }) {
  console.log('[writeCrmNotification] 准备写入 CRM:', { phone, type, title, content, page });
  try {
    await crmRequest('POST', '/api/miniprogram/notifications', {
      phone,
      type,
      title,
      content,
      page
    });
    console.log('[writeCrmNotification] ✅ CRM 写入成功');
  } catch (err) {
    console.warn('[writeCrmNotification] ❌ CRM 写入失败:', err.message);
  }
}

const CRM_SERVICE_SECRET = process.env.CRM_SERVICE_SECRET || '270a1997eeebe6bfca45e9cb9bc2e602ed708a1b3663119cfe6fcb2112976093';
const CRM_HOSTNAME = 'crm.andejiazheng.com';

function crmRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname: CRM_HOSTNAME,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Secret': CRM_SERVICE_SECRET,
        'X-Client-Type': 'miniprogram',
      },
    };
    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
        } catch (e) {
          reject(new Error('响应解析失败'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(new Error('CRM 请求超时')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// 归一化 CRM 通知列表返回，兼容多种可能结构，产出统一 { list, total, unreadCount }
// 修复「tabBar 红点 99+ 但点进去列表空白」：徽标与列表须来自同一份数据，且无通知时未读数必须为 0
function normalizeNotifications(res) {
  // CRM body 可能是 { data: {...} } 也可能直接是 {...}
  const d = (res && res.data && typeof res.data === 'object' && !Array.isArray(res.data)) ? res.data : (res || {});
  // 列表可能落在 list / items / records / rows / data 任一键上
  const list = d.list || d.items || d.records || d.rows || (Array.isArray(d.data) ? d.data : []) || [];
  const total = (d.total != null ? d.total : (d.count != null ? d.count : list.length)) || 0;
  const unreadField = (d.unreadCount != null ? d.unreadCount : d.unread);
  const unreadRaw = (unreadField != null ? unreadField : list.filter(n => !(n.isRead || n.read)).length) || 0;
  // 没有任何通知却报未读 → 视为脏数据，纠正为 0
  const unreadCount = total > 0 ? unreadRaw : 0;
  // 诊断日志：只打印形状与数量，不含任何内容/手机号
  console.log('[getList] CRM shape:', {
    topKeys: (res && typeof res === 'object') ? Object.keys(res) : typeof res,
    dataKeys: (d && typeof d === 'object') ? Object.keys(d) : typeof d,
    listLen: Array.isArray(list) ? list.length : 'not-array',
    total, unreadRaw, unreadCount,
  });
  return { list, total, unreadCount };
}

// 诊断用：直接向指定手机号发送测试通知，返回详细中间结果
async function sendTestNotify(event) {
  const { phone: testPhone, state = 'formal' } = event;
  if (!testPhone) return { success: false, errMsg: '缺少 phone 参数' };

  // step1: 查 openid（走统一查询：users → staff_profiles 双重回退）
  const touser = await getOpenidByPhone(testPhone);
  if (!touser) {
    // 同时把两个集合的原始数据返回，方便诊断
    const u = await db.collection('users').where({ phone: String(testPhone) }).limit(1).get();
    const s = await db.collection('staff_profiles').where({ phone: String(testPhone) }).limit(1).get();
    return {
      success: false,
      step: 'lookup',
      errMsg: `users 和 staff_profiles 均未找到 phone=${testPhone} 的 openid`,
      usersRaw: u.data,
      staffProfilesRaw: s.data
    };
  }
  console.log('[sendTestNotify] openid=', touser);

  // step2: 发测试消息
  try {
    await cloud.openapi.subscribeMessage.send({
      touser,
      template_id: RESUME_VIEW_TEMPLATE_ID,
      page: 'pages/resumeList/index',
      data: {
        thing6: { value: '测试客户' },
        thing8: { value: '张阿姨(测试)' },
        thing7: { value: '这是一条测试通知，收到即为配置正常' },
        time4:  { value: formatViewTime(new Date()) },
      },
      miniprogram_state: state   // 默认 formal，诊断时可传 state:'developer'
    });
    return { success: true, openid: touser, msg: '✅ 测试通知发送成功，请检查微信消息' };
  } catch (err) {
    return {
      success: false,
      step: 'send',
      openid: touser,
      errCode: err.errCode,
      errMsg: err.errMsg || err.message,
      hint: err.errCode === 43101
        ? '43101=用户未订阅或订阅次数耗尽，请先在小程序内点击"开启提醒"后再测试'
        : err.errCode === 47003
        ? '47003=模板ID不存在，请核对微信公众平台模板ID'
        : '其他错误，见 errCode/errMsg'
    };
  }
}

exports.main = async (event) => {
  const { action, phone, page = 1, pageSize = 20, id } = event;

  try {
    switch (action) {
      // 新增：发送简历查看通知给员工
      case 'sendResumeViewNotify':
        return await sendResumeViewNotify(event);

      case 'sendOrderGrabNotify':
        return await sendOrderGrabNotify(event);

      // 诊断：直接向指定手机号发测试通知
      case 'sendTestNotify':
        return await sendTestNotify(event);

      // 诊断：dump users 集合前 20 条记录的 phone 和 _openid，排查环境/数据问题
      case 'debugUsers': {
        const all = await db.collection('users').limit(20).get();
        const summary = (all.data || []).map(u => ({
          _id: u._id,
          _openid: u._openid ? u._openid.slice(0, 12) + '...' : '空',
          phone: u.phone || '(空)',
          role: u.role
        }));
        // 同时按传入手机号精确查一次
        const byPhone = event.phone
          ? await db.collection('users').where({ phone: String(event.phone) }).limit(5).get()
          : { data: [] };
        return {
          success: true,
          env: cloud.DYNAMIC_CURRENT_ENV,
          totalInPage: summary.length,
          records: summary,
          phoneMatch: byPhone.data.length,
          phoneMatchDetail: (byPhone.data || []).map(u => ({ _id: u._id, phone: u.phone, _openid: u._openid }))
        };
      }

      case 'getList': {
        if (!phone) return { success: false, errMsg: '缺少 phone' };
        const qs = `phone=${encodeURIComponent(phone)}&page=${page}&pageSize=${pageSize}`;
        const res = await crmRequest('GET', `/api/miniprogram/notifications?${qs}`);
        return { success: true, data: normalizeNotifications(res) };
      }
      case 'markRead': {
        if (!phone) return { success: false, errMsg: '缺少 phone' };
        if (!id) return { success: false, errMsg: '缺少通知 id' };
        await crmRequest('POST', `/api/miniprogram/notifications/${id}/read`, { phone });
        return { success: true };
      }
      case 'markAllRead': {
        if (!phone) return { success: false, errMsg: '缺少 phone' };
        await crmRequest('POST', '/api/miniprogram/notifications/read-all', { phone });
        return { success: true };
      }
      default:
        return { success: false, errMsg: `未知 action: ${action}` };
    }
  } catch (e) {
    console.error('[notificationService] error:', e.message);
    return { success: false, errMsg: e.message };
  }
};
