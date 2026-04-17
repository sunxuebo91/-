const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const https = require('https');

const CRM_SERVICE_SECRET = process.env.CRM_SERVICE_SECRET || '270a1997eeebe6bfca45e9cb9bc2e602ed708a1b3663119cfe6fcb2112976093';
const CRM_HOSTNAME = 'crm.andejiazheng.com';

/**
 * 用 X-Service-Secret 向 CRM 后端发请求（云函数服务端，不需要用户 JWT）
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

/**
 * 按 ID 获取单个客户需求（供推荐提交页展示关联订单使用）
 * CRM 端点：GET /api/miniprogram/customers/baobei/detail?id=<id>
 */
async function getCustomerById(event) {
  const id = String(event.id || '').trim();
  if (!id) throw new Error('缺少 id 参数');
  const res = await crmRequest('GET', `/api/miniprogram/customers/baobei/detail?id=${encodeURIComponent(id)}`);
  return { success: true, data: res.data || res };
}

/**
 * 获取客户列表（供推荐海报页使用）
 * CRM 端点：GET /api/miniprogram/customers/baobei/list
 */
async function getCustomerList(event) {
  const page     = Math.max(1, Number(event.page)  || 1);
  const limit    = Math.min(50, Math.max(1, Number(event.limit) || 20));
  const search   = event.search ? String(event.search).trim() : '';

  const phone = event.phone ? String(event.phone).trim() : '';
  if (!phone) throw new Error('缺少 phone 参数');

  let qs = `phone=${encodeURIComponent(phone)}&page=${page}&limit=${limit}`;
  if (search) qs += `&search=${encodeURIComponent(search)}`;

  const res = await crmRequest('GET', `/api/miniprogram/customers/baobei/list?${qs}`);
  return { success: true, data: res.data || res };
}

exports.main = async (event) => {
  const { action } = event;

  try {
    switch (action) {
      case 'getCustomerList':
        return await getCustomerList(event);
      case 'getCustomerById':
        return await getCustomerById(event);
      default:
        return { success: false, errMsg: `未知 action: ${action}` };
    }
  } catch (e) {
    console.error('[baobei] error:', e.message);
    return { success: false, errMsg: e.message };
  }
};
