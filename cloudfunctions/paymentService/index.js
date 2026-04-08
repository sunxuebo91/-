/**
 * paymentService — 收钱吧支付云函数
 *
 * 集合依赖：sqb_terminals、payments
 * actions：activate / checkin / precreate / queryPayment / refund / getPaymentByContract
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const VERSION = '1.0.0';

// ─── 收钱吧常量 ───
const SQB = {
  API_DOMAIN: 'https://vsi-api.shouqianba.com',
  VENDOR_SN: '91803277',
  VENDOR_KEY: '8740db8e9790eecbbc861443cda99807',
  APP_ID: '2026040200010986',
  WX_APPID: 'wx9144012a42975120',
  DEVICE_ID: 'andebaobeimini-pay-01', // 品牌名+场景
  ACTIVATE_CODE: '76295386',       // 激活码
};

// CRM 通知（支付成功后回写）
const CRM_HOSTNAME = 'crm.andejiazheng.com';
const CRM_SERVICE_SECRET = process.env.CRM_SERVICE_SECRET || '270a1997eeebe6bfca45e9cb9bc2e602ed708a1b3663119cfe6fcb2112976093';

const https = require('https');
const crypto = require('crypto');

// ═══════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════

/** MD5 签名：sign = MD5(bodyStr + key) */
function md5Sign(bodyStr, key) {
  return crypto.createHash('md5').update(bodyStr + key, 'utf8').digest('hex');
}

/** 通用 HTTPS JSON 请求 */
function httpsRequest(method, hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const opts = {
      hostname, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    if (bodyStr) opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/** 向收钱吧发请求（自动签名） */
async function sqbRequest(apiPath, body, { sn, key }) {
  const bodyStr = JSON.stringify(body);
  const sign = md5Sign(bodyStr, key);
  const url = new URL(apiPath, SQB.API_DOMAIN);
  return httpsRequest('POST', url.hostname, url.pathname, body, {
    Authorization: `${sn} ${sign}`,
  });
}

/** 生成商户订单号：ADBP-{时间戳}-{随机4位} */
function generateClientSn() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `ADBP-${ts}-${rand}`;
}

/** 通知 CRM 支付已完成 */
function notifyCRM(contractId, phone, amount, sqbSn, paidAt) {
  return httpsRequest('POST', CRM_HOSTNAME, `/api/miniprogram/contracts/${contractId}/payment-confirm`, {
    phone, amount, sqb_sn: sqbSn, paidAt,
  }, {
    'X-Service-Secret': CRM_SERVICE_SECRET,
    'X-Client-Type': 'miniprogram',
  }).catch(err => {
    // CRM 通知失败不阻塞用户，记录日志即可
    console.error('[paymentService] CRM notify failed:', err.message);
  });
}

// ═══════════════════════════════════════
// 终端管理
// ═══════════════════════════════════════

const TERMINAL_DOC_ID = 'default';

/** 获取已激活的终端凭证 */
async function getTerminal() {
  try {
    const r = await db.collection('sqb_terminals').doc(TERMINAL_DOC_ID).get();
    return r.data || null;
  } catch (e) { return null; }
}

/** 自动签到（terminal_key 超 20 小时未更新时触发） */
async function ensureCheckin(terminal) {
  if (!terminal) throw new Error('终端未激活，请先调用 activate');
  const TWENTY_HOURS = 20 * 60 * 60 * 1000;
  const lastCheckin = terminal.lastCheckinAt ? new Date(terminal.lastCheckinAt).getTime() : 0;
  if (Date.now() - lastCheckin < TWENTY_HOURS) return terminal;

  console.log('[paymentService] 执行自动签到...');
  const body = { terminal_sn: terminal.terminal_sn, device_id: SQB.DEVICE_ID };
  const res = await sqbRequest('/terminal/checkin', body, {
    sn: terminal.terminal_sn, key: terminal.terminal_key,
  });
  if (res.result_code !== '200') {
    throw new Error('签到失败: ' + JSON.stringify(res));
  }

  const newKey = res.biz_response.terminal_key;
  await db.collection('sqb_terminals').doc(TERMINAL_DOC_ID).update({
    data: { terminal_key: newKey, lastCheckinAt: db.serverDate(), updatedAt: db.serverDate() },
  });
  return { ...terminal, terminal_key: newKey };
}

// ═══════════════════════════════════════
// Actions
// ═══════════════════════════════════════

/** 激活终端（仅需执行一次） */
async function activate(event) {
  const code = event.code || SQB.ACTIVATE_CODE;
  if (!code) throw new Error('缺少激活码 code');

  const body = { app_id: SQB.APP_ID, code, device_id: SQB.DEVICE_ID };
  const res = await sqbRequest('/terminal/activate', body, {
    sn: SQB.VENDOR_SN, key: SQB.VENDOR_KEY,
  });
  if (res.result_code !== '200') {
    throw new Error('激活失败: ' + JSON.stringify(res));
  }

  const { terminal_sn, terminal_key } = res.biz_response;
  // upsert 终端记录
  const existing = await getTerminal();
  const doc = {
    terminal_sn, terminal_key,
    app_id: SQB.APP_ID, device_id: SQB.DEVICE_ID,
    activatedAt: db.serverDate(), lastCheckinAt: db.serverDate(), updatedAt: db.serverDate(),
  };
  if (existing) {
    await db.collection('sqb_terminals').doc(TERMINAL_DOC_ID).update({ data: doc });
  } else {
    await db.collection('sqb_terminals').add({ data: { _id: TERMINAL_DOC_ID, ...doc } });
  }
  return { terminal_sn };
}

/** 手动签到 */
async function checkin() {
  const terminal = await getTerminal();
  if (!terminal) throw new Error('终端未激活');
  const body = { terminal_sn: terminal.terminal_sn, device_id: SQB.DEVICE_ID };
  const res = await sqbRequest('/terminal/checkin', body, {
    sn: terminal.terminal_sn, key: terminal.terminal_key,
  });
  if (res.result_code !== '200') {
    throw new Error('签到失败: ' + JSON.stringify(res));
  }
  const newKey = res.biz_response.terminal_key;
  await db.collection('sqb_terminals').doc(TERMINAL_DOC_ID).update({
    data: { terminal_key: newKey, lastCheckinAt: db.serverDate(), updatedAt: db.serverDate() },
  });
  return { success: true };
}

/**
 * 预下单（小程序支付）
 * event: { contractId, phone, openid }
 * 金额从 CRM 合同 serviceFee 读取，不信任客户端
 */
async function precreate(event, openid) {
  const { contractId, phone } = event;
  if (!contractId) throw new Error('缺少 contractId');
  if (!phone) throw new Error('缺少 phone');
  if (!openid) throw new Error('缺少 openid');

  // ── 防重复支付：查已有记录 ──
  const existCheck = await db.collection('payments').where({
    contractId,
    paymentStatus: _.in(['pending', 'paid']),
  }).limit(1).get();

  if (existCheck.data.length > 0) {
    const existing = existCheck.data[0];
    if (existing.paymentStatus === 'paid') {
      throw new Error('该合同已支付，请勿重复支付');
    }
    // pending 状态：先去查一下收钱吧，可能已经支付了
    if (existing.paymentStatus === 'pending' && existing.sqb_sn) {
      const terminal = await getTerminal();
      const t = await ensureCheckin(terminal);
      const qr = await sqbRequest('/upay/v2/query', {
        terminal_sn: t.terminal_sn, sn: existing.sqb_sn,
      }, { sn: t.terminal_sn, key: t.terminal_key });

      const orderStatus = qr?.biz_response?.data?.order_status;
      if (orderStatus === 'PAID') {
        // 已支付，同步状态
        await db.collection('payments').doc(existing._id).update({
          data: { paymentStatus: 'paid', paidAt: db.serverDate(), updatedAt: db.serverDate() },
        });
        notifyCRM(contractId, phone, existing.amount, existing.sqb_sn, new Date().toISOString());
        throw new Error('该合同已支付，请勿重复支付');
      }
      if (orderStatus === 'CREATED' || orderStatus === 'IN_PROG') {
        throw new Error('上一笔支付仍在进行中，请稍候再试');
      }
      // PAY_CANCELED / 其他终态 → 标记失败，允许重新支付
      await db.collection('payments').doc(existing._id).update({
        data: { paymentStatus: 'failed', updatedAt: db.serverDate() },
      });
    }
  }

  // ── 从 CRM 获取合同金额（GET 接口，金额以服务端为准） ──
  const contractRes = await httpsRequest('GET', CRM_HOSTNAME,
    `/api/miniprogram/contracts/${contractId}?phone=${encodeURIComponent(phone)}`, null, {
      'X-Service-Secret': CRM_SERVICE_SECRET,
      'X-Client-Type': 'miniprogram',
    }).catch(() => null);

  let serviceFee = 0;
  if (contractRes && contractRes.data) {
    serviceFee = contractRes.data.customerServiceFee || contractRes.data.serviceFee || 0;
  }
  if (!serviceFee || serviceFee <= 0) {
    throw new Error('合同服务费为 0 或获取失败，无法发起支付');
  }

  // 金额转为分
  const amountInCents = Math.round(Number(serviceFee) * 100);
  if (amountInCents <= 0 || amountInCents > 10000000) {
    throw new Error('支付金额异常: ' + serviceFee);
  }

  // ── 获取终端并确保签到 ──
  const terminal = await getTerminal();
  const t = await ensureCheckin(terminal);

  // ── 生成订单号并创建支付记录 ──
  const clientSn = generateClientSn();
  const paymentDoc = {
    contractId, phone, openid,
    amount: amountInCents,
    client_sn: clientSn,
    sqb_sn: '',
    paymentStatus: 'pending',
    paidAt: null,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };
  const addRes = await db.collection('payments').add({ data: paymentDoc });
  const paymentId = addRes._id;

  // ── 调用收钱吧预下单 ──
  const preBody = {
    terminal_sn: t.terminal_sn,
    client_sn: clientSn,
    total_amount: String(amountInCents),
    payway: '3',        // 微信
    sub_payway: '4',    // 小程序
    payer_uid: openid,
    subject: '安得褓贝-服务费',
    operator: 'miniprogram',
    extended: { sub_appid: SQB.WX_APPID },
  };

  console.log('===== 收钱吧预下单请求 =====');
  console.log('请求地址: https://vsi-api.shouqianba.com/upay/v2/precreate');
  console.log('terminal_sn:', t.terminal_sn);
  console.log('请求参数:', JSON.stringify(preBody, null, 2));

  const res = await sqbRequest('/upay/v2/precreate', preBody, {
    sn: t.terminal_sn, key: t.terminal_key,
  });

  console.log('===== 收钱吧预下单响应 =====');
  console.log('响应内容:', JSON.stringify(res, null, 2));

  if (res.result_code !== '200' || !res.biz_response) {
    console.error('预下单通讯层失败, result_code:', res.result_code);
    await db.collection('payments').doc(paymentId).update({
      data: { paymentStatus: 'failed', updatedAt: db.serverDate(), sqbRawResponse: res },
    });
    throw new Error('预下单失败: ' + JSON.stringify(res));
  }

  const biz = res.biz_response;
  if (biz.result_code !== 'PRECREATE_SUCCESS') {
    console.error('预下单业务失败, biz result_code:', biz.result_code, 'error_code:', biz.error_code, 'error_message:', biz.error_message);
    await db.collection('payments').doc(paymentId).update({
      data: { paymentStatus: 'failed', updatedAt: db.serverDate(), sqbRawResponse: res },
    });
    throw new Error('预下单业务失败: ' + JSON.stringify(res));
  }

  const sqbSn = biz.data?.sn || '';
  const wapPayRequest = biz.data?.wap_pay_request || '';

  await db.collection('payments').doc(paymentId).update({
    data: { sqb_sn: sqbSn, updatedAt: db.serverDate(), sqbRawResponse: res },
  });

  // wap_pay_request 是 JSON 字符串，前端解析后传给 wx.requestPayment
  return { paymentId, clientSn, sqbSn, wapPayRequest };
}

/**
 * 查询支付结果（轮询用）
 * event: { paymentId } 或 { contractId }
 */
async function queryPayment(event) {
  let payment;
  if (event.paymentId) {
    const r = await db.collection('payments').doc(event.paymentId).get();
    payment = r.data;
  } else if (event.contractId) {
    const r = await db.collection('payments').where({
      contractId: event.contractId,
      paymentStatus: _.in(['pending', 'paid']),
    }).orderBy('createdAt', 'desc').limit(1).get();
    payment = r.data?.[0];
  }
  if (!payment) throw new Error('未找到支付记录');

  // 已经是终态
  if (payment.paymentStatus === 'paid') {
    return { paymentStatus: 'paid', paidAt: payment.paidAt };
  }
  if (payment.paymentStatus === 'failed' || payment.paymentStatus === 'refunded') {
    return { paymentStatus: payment.paymentStatus };
  }

  // pending → 去收钱吧查最新状态
  if (!payment.sqb_sn) {
    return { paymentStatus: 'pending' };
  }

  const terminal = await getTerminal();
  const t = await ensureCheckin(terminal);
  const res = await sqbRequest('/upay/v2/query', {
    terminal_sn: t.terminal_sn, sn: payment.sqb_sn,
  }, { sn: t.terminal_sn, key: t.terminal_key });

  const orderStatus = res?.biz_response?.data?.order_status;

  if (orderStatus === 'PAID') {
    await db.collection('payments').doc(payment._id).update({
      data: { paymentStatus: 'paid', paidAt: db.serverDate(), updatedAt: db.serverDate() },
    });
    // 异步通知 CRM
    notifyCRM(payment.contractId, payment.phone, payment.amount, payment.sqb_sn, new Date().toISOString());
    return { paymentStatus: 'paid', paidAt: new Date().toISOString() };
  }
  if (orderStatus === 'PAY_CANCELED' || orderStatus === 'CANCELED') {
    await db.collection('payments').doc(payment._id).update({
      data: { paymentStatus: 'failed', updatedAt: db.serverDate() },
    });
    return { paymentStatus: 'failed' };
  }

  return { paymentStatus: 'pending', orderStatus };
}

/**
 * 根据合同ID查支付记录（详情页用）
 */
async function getPaymentByContract(event) {
  const { contractId } = event;
  if (!contractId) throw new Error('缺少 contractId');
  const r = await db.collection('payments').where({
    contractId,
    paymentStatus: _.in(['pending', 'paid']),
  }).orderBy('createdAt', 'desc').limit(1).get();

  const payment = r.data?.[0];
  if (!payment) return { paymentStatus: 'unpaid' };

  // pending 的自动去查一下
  if (payment.paymentStatus === 'pending' && payment.sqb_sn) {
    try {
      const result = await queryPayment({ paymentId: payment._id });
      return result;
    } catch (e) { /* ignore */ }
  }

  return {
    paymentStatus: payment.paymentStatus,
    paidAt: payment.paidAt || null,
    amount: payment.amount,
  };
}

/**
 * 退款
 * event: { contractId, phone, refundAmount? }
 */
async function refund(event) {
  const { contractId, phone } = event;
  if (!contractId || !phone) throw new Error('缺少参数');

  const r = await db.collection('payments').where({
    contractId, paymentStatus: 'paid',
  }).limit(1).get();
  const payment = r.data?.[0];
  if (!payment) throw new Error('未找到已支付记录');

  const refundAmount = event.refundAmount
    ? Math.round(Number(event.refundAmount) * 100)
    : payment.amount;

  const terminal = await getTerminal();
  const t = await ensureCheckin(terminal);

  const refundSn = generateClientSn();
  const body = {
    terminal_sn: t.terminal_sn,
    sn: payment.sqb_sn,
    refund_amount: String(refundAmount),
    refund_request_no: refundSn,
    operator: 'miniprogram',
  };

  const res = await sqbRequest('/upay/v2/refund', body, {
    sn: t.terminal_sn, key: t.terminal_key,
  });

  const orderStatus = res?.biz_response?.data?.order_status;
  if (orderStatus === 'REFUNDED' || orderStatus === 'PARTIAL_REFUNDED') {
    await db.collection('payments').doc(payment._id).update({
      data: { paymentStatus: 'refunded', updatedAt: db.serverDate() },
    });
    return { success: true, orderStatus };
  }

  return { success: false, raw: res };
}

// ═══════════════════════════════════════
// 入口
// ═══════════════════════════════════════
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action;

  console.log('[paymentService]', VERSION, 'action=', action);

  try {
    switch (action) {
      case 'activate':
        return { success: true, data: await activate(event) };
      case 'checkin':
        return { success: true, data: await checkin() };
      case 'precreate':
        return { success: true, data: await precreate(event, openid) };
      case 'queryPayment':
        return { success: true, data: await queryPayment(event) };
      case 'getPaymentByContract':
        return { success: true, data: await getPaymentByContract(event) };
      case 'refund':
        return { success: true, data: await refund(event) };
      default:
        return { success: false, errMsg: 'unknown action: ' + action };
    }
  } catch (err) {
    console.error('[paymentService] error:', err.message, err.stack);
    return { success: false, errMsg: err.message || '服务异常' };
  }
};
