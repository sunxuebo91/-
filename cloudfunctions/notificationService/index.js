const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const https = require('https');

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

exports.main = async (event) => {
  const { action, phone, page = 1, pageSize = 20, id } = event;

  if (!phone) return { success: false, errMsg: '缺少 phone' };

  try {
    switch (action) {
      case 'getList': {
        const qs = `phone=${encodeURIComponent(phone)}&page=${page}&pageSize=${pageSize}`;
        const res = await crmRequest('GET', `/api/miniprogram/notifications?${qs}`);
        return { success: true, data: res.data };
      }
      case 'markRead': {
        if (!id) return { success: false, errMsg: '缺少通知 id' };
        await crmRequest('POST', `/api/miniprogram/notifications/${id}/read`, { phone });
        return { success: true };
      }
      case 'markAllRead': {
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
