const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const https = require('https');

// ⚠️ 必须与 CRM 后端部署时设置的 SERVICE_SECRET 环境变量保持一致
const CRM_SERVICE_SECRET = process.env.CRM_SERVICE_SECRET || '270a1997eeebe6bfca45e9cb9bc2e602ed708a1b3663119cfe6fcb2112976093';
const CRM_HOSTNAME = 'crm.andejiazheng.com';

// 手机号直接由小程序端从 crmUserInfo.phone 传入（CRM 登录时已返回）
// CRM 后端会用 phone 匹配合同 customerPhone，越权访问在后端拦截

/**
 * 向 CRM 后端发 HTTPS 请求
 * 所有请求统一带上 X-Service-Secret，由后端校验身份
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
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
          }
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

async function getMyContracts(phone) {
  if (!phone) throw new Error('请先绑定手机号');
  const res = await crmRequest('GET', `/api/miniprogram/contracts?phone=${encodeURIComponent(phone)}`);
  return res.data || [];
}

async function getContractDetail(phone, id) {
  if (!id) throw new Error('缺少合同ID');
  if (!phone) throw new Error('请先绑定手机号');
  const res = await crmRequest('GET', `/api/miniprogram/contracts/${id}?phone=${encodeURIComponent(phone)}`);
  return res.data;
}

async function confirmOnboard(phone, id) {
  if (!id) throw new Error('缺少合同ID');
  if (!phone) throw new Error('请先绑定手机号');
  const res = await crmRequest('POST', `/api/miniprogram/contracts/${id}/confirm-onboard`, { phone });
  return res.data;
}

async function getSigningUrl(phone, id) {
  if (!id) throw new Error('缺少合同ID');
  if (!phone) throw new Error('请先绑定手机号');
  const res = await crmRequest('GET', `/api/miniprogram/contracts/${id}/signing-url?phone=${encodeURIComponent(phone)}`);
  return res.data;
}

exports.main = async (event) => {
  // phone 由小程序端从 crmUserInfo.phone 传入（CRM 登录时已下发，来源可信）
  const phone = event.phone ? String(event.phone).trim() : '';

  try {
    switch (event.action) {
      case 'getMyContracts': {
        const data = await getMyContracts(phone);
        return { success: true, data };
      }
      case 'getContractDetail': {
        const data = await getContractDetail(phone, event.id);
        return { success: true, data };
      }
      case 'confirmOnboard': {
        const data = await confirmOnboard(phone, event.id);
        return { success: true, data };
      }
      case 'getSigningUrl': {
        const data = await getSigningUrl(phone, event.id);
        return { success: true, data };
      }
      default:
        return { success: false, errMsg: 'unknown action' };
    }
  } catch (err) {
    console.error('[contractService] error:', err.message);
    return { success: false, errMsg: err.message || '服务异常' };
  }
};

