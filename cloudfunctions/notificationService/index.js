const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const https = require('https');

const db = cloud.database();

// 订阅消息模板 ID（简历被查看通知）
const RESUME_VIEW_TEMPLATE_ID = 'VXhA_qhgIRRy8avH1X9uE-eLGk--0M5Bs9Q27EEDmrM';

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

  // 1. 查员工 openid
  const touser = await getOpenidByPhone(sharerPhone);
  if (!touser) {
    console.warn('[sendResumeViewNotify] ❌ 未找到员工 openid, phone:', sharerPhone,
      '→ 请确认 users 集合中该手机号记录存在且含 _openid 字段');
    return { success: false, errMsg: '未找到员工微信账号' };
  }
  console.log('[sendResumeViewNotify] ✅ 查到 openid:', touser);

  // 2. 构建跳转页面
  const page = resumeId
    ? `pages/resumeDetail/index?id=${encodeURIComponent(resumeId)}`
    : 'pages/resumeList/index';

  // 3. 发送订阅消息
  const viewTime = formatViewTime(new Date());
  const safeCustomerName = (customerName || '新客户').slice(0, 20);
  const safeNurseName = nurseName.slice(0, 20);

  console.log('[sendResumeViewNotify] 准备发送 →', { touser, template_id: RESUME_VIEW_TEMPLATE_ID, page, safeCustomerName, safeNurseName, viewTime });

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
    console.log('[sendResumeViewNotify] ✅ 发送成功 → openid:', touser);
    return { success: true };
  } catch (err) {
    // 常见错误码：
    // 43101 = 用户未订阅该消息（订阅次数耗尽或从未订阅）→ 员工需在分享前点击订阅
    // 47003 = 模板不存在或已删除
    // 40001 = access_token 无效（云函数内不应出现）
    console.error('[sendResumeViewNotify] ❌ 发送失败, errCode:', err.errCode, 'errMsg:', err.errMsg || err.message, '完整错误:', JSON.stringify(err));
    return { success: false, errMsg: err.errMsg || err.message, errCode: err.errCode };
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
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// 诊断用：直接向指定手机号发送测试通知，返回详细中间结果
async function sendTestNotify(event) {
  const { phone: testPhone } = event;
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
      miniprogram_state: 'developer'   // 测试时用 developer，收到后改回 formal
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
        return { success: true, data: res.data };
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
