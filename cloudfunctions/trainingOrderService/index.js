const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const https = require('https');

// ⚠️ 必须与 CRM 后端部署时设置的 SERVICE_SECRET 环境变量保持一致
const CRM_SERVICE_SECRET = process.env.CRM_SERVICE_SECRET || '270a1997eeebe6bfca45e9cb9bc2e602ed708a1b3663119cfe6fcb2112976093';
const CRM_HOSTNAME = 'crm.andejiazheng.com';

// 手机号由小程序端从 crmUserInfo.phone 传入（CRM 登录时已下发），
// CRM 后端按 customerPhone 校验学员与合同归属，越权访问在后端拦截

/**
 * 向 CRM 后端发 HTTPS 请求
 * 非 2xx 不直接抛错，把 statusCode 带回调用方便前端区分 404/403/400
 */
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
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { /* ignore */ }
        resolve({ statusCode: res.statusCode, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/** 统一 response 处理：把 404/403/400 透传给前端 */
function unwrap(res) {
  const { statusCode, body } = res;
  if (statusCode >= 200 && statusCode < 300) {
    return { success: true, data: body && body.data };
  }
  const msg = (body && body.message) || `HTTP ${statusCode}`;
  return { success: false, errCode: statusCode, errMsg: msg };
}

async function getMyOrder(phone) {
  if (!phone) return { success: false, errCode: 400, errMsg: '请先绑定手机号' };
  const res = await crmRequest('GET', `/api/miniprogram/training-orders/baobei/my-order?phone=${encodeURIComponent(phone)}`);
  return unwrap(res);
}

async function getSigningUrl(phone, id) {
  if (!id)    return { success: false, errCode: 400, errMsg: '缺少合同ID' };
  if (!phone) return { success: false, errCode: 400, errMsg: '请先绑定手机号' };
  const res = await crmRequest('GET', `/api/miniprogram/training-orders/baobei/${id}/signing-url?phone=${encodeURIComponent(phone)}`);
  return unwrap(res);
}

async function confirmPayment(phone, id, amount, sqbSn, paidAt) {
  if (!id)     return { success: false, errCode: 400, errMsg: '缺少合同ID' };
  if (!phone)  return { success: false, errCode: 400, errMsg: '请先绑定手机号' };
  if (!amount) return { success: false, errCode: 400, errMsg: '缺少支付金额' };
  const res = await crmRequest('POST', `/api/miniprogram/training-orders/baobei/${id}/payment-confirm`, {
    phone, amount, sqb_sn: sqbSn, paidAt,
  });
  return unwrap(res);
}

// 学员自助申报毕业：active → graduated（终态不可逆）
// 后端要求 contractStatus==='active' 且 paymentStatus==='paid' 才能成功，未付款返回 400
async function applyGraduation(phone, id) {
  if (!id)    return { success: false, errCode: 400, errMsg: '缺少合同ID' };
  if (!phone) return { success: false, errCode: 400, errMsg: '请先绑定手机号' };
  const res = await crmRequest('POST', `/api/miniprogram/training-orders/baobei/${id}/apply-graduation`, { phone });
  return unwrap(res);
}

// 轻量状态查询：仅返回 contractStatus / esignStatus / paymentStatus 等状态字段
// 适合付款页、签约页等待状态更新时高频轮询
async function getStatus(phone, id) {
  if (!id)    return { success: false, errCode: 400, errMsg: '缺少合同ID' };
  if (!phone) return { success: false, errCode: 400, errMsg: '请先绑定手机号' };
  const res = await crmRequest('GET', `/api/miniprogram/training-orders/baobei/${id}/status?phone=${encodeURIComponent(phone)}`);
  return unwrap(res);
}

exports.main = async (event) => {
  const phone = event.phone ? String(event.phone).trim() : '';

  try {
    switch (event.action) {
      case 'getMyOrder':
        return await getMyOrder(phone);
      case 'getSigningUrl':
        return await getSigningUrl(phone, event.id);
      case 'confirmPayment':
        return await confirmPayment(phone, event.id, event.amount, event.sqb_sn, event.paidAt);
      case 'applyGraduation':
        return await applyGraduation(phone, event.id);
      case 'getStatus':
        return await getStatus(phone, event.id);
      default:
        return { success: false, errMsg: 'unknown action' };
    }
  } catch (err) {
    console.error('[trainingOrderService] error:', err.message);
    return { success: false, errMsg: err.message || '服务异常' };
  }
};
