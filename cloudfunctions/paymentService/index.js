/**
 * paymentService — 收钱吧支付云函数
 *
 * 集合依赖：sqb_terminals、payments
 * actions：activate / checkin / precreate / queryPayment / refund / getPaymentByContract / getPaymentProgress
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const VERSION = '1.0.1';

let QRCodeLib;
try {
  // 可选依赖：用于生成二维码图片上传到云存储
  // 部署前请在 cloudfunctions/paymentService 下 npm install qrcode
  QRCodeLib = require('qrcode');
} catch (e) {
  QRCodeLib = null;
  console.warn('[paymentService] qrcode 包未安装，二维码生成将不可用');
}

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

// 小程序"用支付宝支付"返程 URL（客户付完跳回的 H5 页）
// 用 example.com 作为占位：客户付完跳过去（不报错），自己切回微信小程序，
// onShow 会触发轮询检测支付状态。pay-return.html 不是核心链路必须的，
// 后续想加可以单独部署到静态托管，不阻塞当前支付流程。
const ALIPAY_RETURN_URL = 'https://example.com/';

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

/** 通知 CRM 家政合同支付已完成 */
function notifyCRM(contractId, phone, amount, sqbSn, paidAt, paymentSequenceNo, channel, payway) {
  const url = `/api/miniprogram/contracts/${contractId}/payment-confirm`;
  const body = { phone, amount, sqb_sn: sqbSn, paidAt };
  if (paymentSequenceNo) body.paymentSequenceNo = paymentSequenceNo;
  if (channel) body.channel = channel;
  if (payway) body.payway = payway;
  console.log('[paymentService] notifyCRM →', url, 'body:', JSON.stringify(body));
  return httpsRequest('POST', CRM_HOSTNAME, url, body, {
    'X-Service-Secret': CRM_SERVICE_SECRET,
    'X-Client-Type': 'miniprogram',
  }).then(res => {
    console.log('[paymentService] notifyCRM ← response:', JSON.stringify(res));
    return res;
  }).catch(err => {
    console.error('[paymentService] notifyCRM ✗ failed:', err.message, 'url:', url);
    return null;
  });
}

/** 通知 CRM 职培订单支付已完成 */
function notifyTrainingCRM(contractId, phone, amount, sqbSn, paidAt, channel, payway) {
  const url = `/api/miniprogram/training-orders/baobei/${contractId}/payment-confirm`;
  const body = { phone, amount, sqb_sn: sqbSn, paidAt };
  if (channel) body.channel = channel;
  if (payway) body.payway = payway;
  console.log('[paymentService] notifyTrainingCRM →', url, 'body:', JSON.stringify(body));
  return httpsRequest('POST', CRM_HOSTNAME, url, body, {
    'X-Service-Secret': CRM_SERVICE_SECRET,
    'X-Client-Type': 'miniprogram',
  }).then(res => {
    console.log('[paymentService] notifyTrainingCRM ← response:', JSON.stringify(res));
    return res;
  }).catch(err => {
    console.error('[paymentService] notifyTrainingCRM ✗ failed:', err.message, 'url:', url);
    return null;
  });
}

/** 把收钱吧 payway/sub_payway 翻译成业务渠道标识 */
function resolveChannel(payway, subPayway) {
  // payway: 1=支付宝 2=银联 3=微信
  // sub_payway(微信): 1=H5 2=公众号 3=APP 4=小程序 5=扫码 6=刷脸
  // sub_payway(支付宝): 1=H5 2=APP 3=小程序 4=扫码 5=刷脸
  if (String(payway) === '3') {
    const subMap = { 1: 'wechat_h5', 2: 'wechat_mp', 3: 'wechat_app', 4: 'wechat_mini', 5: 'wechat_scan', 6: 'wechat_face' };
    return subMap[subPayway] || 'wechat';
  }
  if (String(payway) === '1') {
    const subMap = { 1: 'alipay_h5', 2: 'alipay_app', 3: 'alipay_mini', 4: 'alipay_scan', 5: 'alipay_face' };
    return subMap[subPayway] || 'alipay';
  }
  if (String(payway) === '2') return 'unionpay';
  return 'unknown';
}

/** 从预下单响应或查询响应里抽 payway/sub_payway 出来 */
function extractChannelInfo(payment, queryRes) {
  // 优先看预下单原始响应（v1 微信原生：payway=3 sub_payway=4）
  const preRaw = payment && payment.sqbRawResponse && payment.sqbRawResponse.biz_response && payment.sqbRawResponse.biz_response.data;
  if (preRaw) {
    const pw = preRaw.payway || (preRaw.trade_info && preRaw.trade_info.payway);
    const sp = preRaw.sub_payway || (preRaw.trade_info && preRaw.trade_info.sub_payway);
    if (pw) {
      return { payway: String(pw), subPayway: sp ? String(sp) : null, channel: resolveChannel(pw, sp) };
    }
  }
  // 其次看查询响应
  const qData = queryRes && queryRes.biz_response && queryRes.biz_response.data;
  if (qData) {
    const pw = qData.payway || (qData.trade_info && qData.trade_info.payway);
    const sp = qData.sub_payway || (qData.trade_info && qData.trade_info.sub_payway);
    if (pw) {
      return { payway: String(pw), subPayway: sp ? String(sp) : null, channel: resolveChannel(pw, sp) };
    }
  }
  // 兜底：根据 payMode 推断
  if (payment && payment.payMode === 'wechat_mp') {
    return { payway: '3', subPayway: '4', channel: 'wechat_mini' };
  }
  return null;
}

/** 按支付记录的 orderCategory 分发到对应 CRM 通知通道（老记录默认家政） */
function notifyCRMByCategory(payment, paidAt, channelInfo) {
  const cat = payment.orderCategory || 'housekeeping';
  const channel = channelInfo ? channelInfo.channel : null;
  const payway  = channelInfo ? channelInfo.payway  : null;
  if (cat === 'training') {
    return notifyTrainingCRM(payment.contractId, payment.phone, payment.amount, payment.sqb_sn, paidAt, channel, payway);
  }
  return notifyCRM(payment.contractId, payment.phone, payment.amount, payment.sqb_sn, paidAt, payment.paymentSequenceNo, channel, payway);
}

/**
 * 生成付款二维码 PNG 并上传到云存储，返回 fileID
 * 失败返回 null（前端可降级为只展示链接）
 */
async function generateQrCodeFile(text, clientSn) {
  if (!QRCodeLib) return null;
  try {
    const buffer = await QRCodeLib.toBuffer(text, {
      type: 'png',
      width: 480,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    const uploadRes = await cloud.uploadFile({
      cloudPath: `payment_qr/${clientSn}.png`,
      fileContent: buffer,
    });
    return uploadRes.fileID;
  } catch (e) {
    console.warn('[paymentService] 生成二维码失败:', e.message);
    return null;
  }
}

/**
 * 按合同号+笔次拉取应付金额（单位：分），返回 { amountInCents, subject }
 * isV2=true: 从 CRM payment-progress 接口取对应 sequenceNo 的金额
 * isV2=false: 从 CRM 合同详情取 customerServiceFee/serviceFee
 */
async function fetchAmountAndSubject({ contractId, phone, paymentSequenceNo }) {
  const isV2 = !!paymentSequenceNo;
  let amountInCents;
  let subject;

  if (isV2) {
    const progressRes = await httpsRequest('GET', CRM_HOSTNAME,
      `/api/miniprogram/contracts/${contractId}/payment-progress?phone=${encodeURIComponent(phone)}`, null, {
        'X-Service-Secret': CRM_SERVICE_SECRET,
        'X-Client-Type': 'miniprogram',
      });
    const payments = progressRes && progressRes.data && progressRes.data.payments;
    if (!Array.isArray(payments)) throw new Error('获取支付进度失败');
    const targetPayment = payments.find(p => String(p.sequenceNo) === String(paymentSequenceNo));
    if (!targetPayment || targetPayment.status !== 'pending') {
      throw new Error('该笔支付不可用或已支付');
    }
    amountInCents = Math.round(Number(targetPayment.amount) * 100);
    if (amountInCents <= 0 || amountInCents > 10000000) {
      throw new Error('支付金额异常: ' + targetPayment.amount);
    }
    subject = `安得褓贝-合同支付(第${paymentSequenceNo}笔-${targetPayment.label})`;
  } else {
    const contractRes = await httpsRequest('GET', CRM_HOSTNAME,
      `/api/miniprogram/contracts/${contractId}?phone=${encodeURIComponent(phone)}`, null, {
        'X-Service-Secret': CRM_SERVICE_SECRET,
        'X-Client-Type': 'miniprogram',
      }).catch(() => null);
    const data = contractRes && contractRes.data;
    // V1 应付金额 = 客户服务费 + 家政员首月工资（住家/月子/育儿嫂合同的常见组合）
    // 月嫂合同：workerSalary=0，直接用 customerServiceFee（一次性服务费即定金/全款）
    const customerServiceFee = Number(data?.customerServiceFee || data?.serviceFee || 0);
    const workerSalary       = Number(data?.workerSalary || 0);
    const contractType       = String(data?.contractType || '');
    const totalFee = (/月嫂/i.test(contractType) || workerSalary === 0)
      ? customerServiceFee
      : (customerServiceFee + workerSalary);

    if (!totalFee || totalFee <= 0) throw new Error('合同服务费为 0 或获取失败，无法发起支付');
    amountInCents = Math.round(totalFee * 100);
    if (amountInCents <= 0 || amountInCents > 10000000) {
      throw new Error('支付金额异常: ' + totalFee);
    }
    subject = workerSalary > 0
      ? '安得褓贝-服务费+首月工资'
      : '安得褓贝-服务费';
  }
  return { amountInCents, subject, isV2 };
}

/**
 * 检测到 PAID 时统一处理：更新本地记录 + 通知 CRM
 * 给 queryPayment 和 settleExistingPending 复用
 */
async function markPaidAndNotifyCRM(payment, sqbResponse) {
  const channelInfo = extractChannelInfo(payment, sqbResponse);
  // 收钱吧内部订单号（wap2 订单预下单时没 sn，查询时才返回；通知 CRM 需要它）
  const querySn = sqbResponse?.biz_response?.data?.sn || payment.sqb_sn || '';
  await db.collection('payments').doc(payment._id).update({
    data: {
      paymentStatus: 'paid',
      paidAt: db.serverDate(),
      updatedAt: db.serverDate(),
      channel: channelInfo ? channelInfo.channel : null,
      payway:  channelInfo ? channelInfo.payway  : null,
      subPayway: channelInfo ? channelInfo.subPayway : null,
      sqb_sn: querySn,
    },
  });
  // 更新本地引用，notifyCRM 时拿到最新 sn
  payment.channel = channelInfo ? channelInfo.channel : null;
  payment.payway  = channelInfo ? channelInfo.payway  : null;
  payment.sqb_sn = querySn;
  notifyCRMByCategory(payment, new Date().toISOString(), channelInfo);
  return channelInfo;
}

/**
 * 检查并处理同合同/同笔次的已有支付记录
 * - 已 paid：抛错让前端停止
 * - pending + 已支付：同步状态 + 通知 CRM 后抛错
 * - pending + 未支付：标记 failed，开放新订单
 * 返回 existing（可能是 null）
 */
async function settleExistingPending({ contractId, paymentSequenceNo, isV2, terminal }) {
  const dupWhere = { contractId, paymentStatus: _.in(['pending', 'paid']) };
  if (isV2) dupWhere.paymentSequenceNo = paymentSequenceNo;
  const existCheck = await db.collection('payments').where(dupWhere).limit(1).get();
  if (existCheck.data.length === 0) return null;

  const existing = existCheck.data[0];
  if (existing.paymentStatus === 'paid') {
    throw new Error(isV2 ? '该笔支付已完成，请勿重复支付' : '该合同已支付，请勿重复支付');
  }
  if (existing.paymentStatus === 'pending') {
    // 有 sqb_sn 用 sn 查；否则用 client_sn 查（wap2 订单只有 client_sn）
    const t = terminal;
    const queryBody = { terminal_sn: t.terminal_sn };
    if (existing.sqb_sn) queryBody.sn = existing.sqb_sn;
    else if (existing.client_sn) queryBody.client_sn = existing.client_sn;
    else {
      // 既没 sqb_sn 也没 client_sn → 没法查收钱吧，按"未支付"放行
      return existing;
    }
    const qr = await sqbRequest('/upay/v2/query', queryBody, {
      sn: t.terminal_sn, key: t.terminal_key,
    });
    const orderStatus = qr?.biz_response?.data?.order_status;
    if (orderStatus === 'PAID') {
      // 已支付但本地未同步：更新本地 + 通知 CRM + 抛错
      await markPaidAndNotifyCRM(existing, qr);
      throw new Error(isV2 ? '该笔支付已完成，请勿重复支付' : '该合同已支付，请勿重复支付');
    }
    if (orderStatus === 'IN_PROG') {
      throw new Error('上一笔支付正在处理中，请稍候再试');
    }
    // CREATED/PAY_CANCELED/其他：标记 failed，开放新订单
    await db.collection('payments').doc(existing._id).update({
      data: { paymentStatus: 'failed', updatedAt: db.serverDate() },
    });
  }
  return existing;
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
 * event: { contractId, phone, openid, paymentSequenceNo?, useCheckout? }
 * V1: 金额从 CRM 合同 serviceFee 读取，不信任客户端
 * V2: 当 paymentSequenceNo 存在时，从 CRM 支付进度接口获取对应笔次的金额
 * useCheckout=true: 走收银台模式（不传 payway，返回 wap_url 让用户在小程序 webview 里自选渠道）
 */
async function precreate(event, openid) {
  const { contractId, phone, paymentSequenceNo, useCheckout } = event;
  if (!contractId) throw new Error('缺少 contractId');
  if (!phone) throw new Error('缺少 phone');
  if (!openid) throw new Error('缺少 openid');

  const isV2 = !!paymentSequenceNo;
  const isCheckout = !!useCheckout;

  // ── 防重复支付：查已有记录 ──
  const dupWhere = { contractId, paymentStatus: _.in(['pending', 'paid']) };
  if (isV2) dupWhere.paymentSequenceNo = paymentSequenceNo;

  const existCheck = await db.collection('payments').where(dupWhere).limit(1).get();

  if (existCheck.data.length > 0) {
    const existing = existCheck.data[0];
    if (existing.paymentStatus === 'paid') {
      throw new Error(isV2 ? '该笔支付已完成，请勿重复支付' : '该合同已支付，请勿重复支付');
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
        const channelInfo = extractChannelInfo(existing, qr);
        await db.collection('payments').doc(existing._id).update({
          data: {
            paymentStatus: 'paid',
            paidAt: db.serverDate(),
            updatedAt: db.serverDate(),
            channel: channelInfo ? channelInfo.channel : null,
            payway:  channelInfo ? channelInfo.payway  : null,
            subPayway: channelInfo ? channelInfo.subPayway : null,
          },
        });
        existing.channel = channelInfo ? channelInfo.channel : null;
        existing.payway  = channelInfo ? channelInfo.payway  : null;
        notifyCRM(contractId, phone, existing.amount, existing.sqb_sn, new Date().toISOString(), existing.paymentSequenceNo,
          channelInfo ? channelInfo.channel : null, channelInfo ? channelInfo.payway : null);
        throw new Error(isV2 ? '该笔支付已完成，请勿重复支付' : '该合同已支付，请勿重复支付');
      }
      // IN_PROG 是支付真正处理中的短暂状态，有重复扣款风险，必须拦截
      if (orderStatus === 'IN_PROG') {
        throw new Error('上一笔支付正在处理中，请稍候再试');
      }
      // CREATED（wx.requestPayment 取消或未完成）/ PAY_CANCELED / 其他终态
      // 一律标记为 failed 并继续创建新订单；旧的收钱吧订单会自行超时
      await db.collection('payments').doc(existing._id).update({
        data: { paymentStatus: 'failed', updatedAt: db.serverDate() },
      });
    }
  }

  let amountInCents;
  let subject;

  if (isV2) {
    // ── V2：从 CRM 支付进度接口获取对应笔次金额 ──
    const progressRes = await httpsRequest('GET', CRM_HOSTNAME,
      `/api/miniprogram/contracts/${contractId}/payment-progress?phone=${encodeURIComponent(phone)}`, null, {
        'X-Service-Secret': CRM_SERVICE_SECRET,
        'X-Client-Type': 'miniprogram',
      });

    const payments = progressRes && progressRes.data && progressRes.data.payments;
    if (!Array.isArray(payments)) {
      throw new Error('获取支付进度失败');
    }
    const targetPayment = payments.find(p => String(p.sequenceNo) === String(paymentSequenceNo));
    if (!targetPayment) {
      throw new Error('该笔支付不可用或已支付');
    }
    if (targetPayment.status !== 'pending') {
      throw new Error('该笔支付不可用或已支付');
    }
    // CRM 返回金额单位为元，转为分
    amountInCents = Math.round(Number(targetPayment.amount) * 100);
    if (amountInCents <= 0 || amountInCents > 10000000) {
      throw new Error('支付金额异常: ' + targetPayment.amount);
    }
    subject = `安得褓贝-合同支付(第${paymentSequenceNo}笔-${targetPayment.label})`;
  } else {
    // ── V1：从 CRM 获取合同金额（GET 接口，金额以服务端为准） ──
    const contractRes = await httpsRequest('GET', CRM_HOSTNAME,
      `/api/miniprogram/contracts/${contractId}?phone=${encodeURIComponent(phone)}`, null, {
        'X-Service-Secret': CRM_SERVICE_SECRET,
        'X-Client-Type': 'miniprogram',
      }).catch(() => null);

    // V1 应付金额 = 客户服务费 + 家政员首月工资（家政合同常见组合；月嫂除外）
    const v1Data = contractRes && contractRes.data;
    const customerServiceFee = Number(v1Data?.customerServiceFee || v1Data?.serviceFee || 0);
    const workerSalary       = Number(v1Data?.workerSalary || 0);
    const v1ContractType     = String(v1Data?.contractType || '');
    const totalFee = (/月嫂/i.test(v1ContractType) || workerSalary === 0)
      ? customerServiceFee
      : (customerServiceFee + workerSalary);

    if (!totalFee || totalFee <= 0) {
      throw new Error('合同服务费为 0 或获取失败，无法发起支付');
    }

    // 金额转为分
    amountInCents = Math.round(totalFee * 100);
    if (amountInCents <= 0 || amountInCents > 10000000) {
      throw new Error('支付金额异常: ' + totalFee);
    }
    subject = workerSalary > 0
      ? '安得褓贝-服务费+首月工资'
      : '安得褓贝-服务费';
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
  if (isV2) paymentDoc.paymentSequenceNo = paymentSequenceNo;

  const addRes = await db.collection('payments').add({ data: paymentDoc });
  const paymentId = addRes._id;

  // ── 调用收钱吧预下单 ──
  // payway 是必传整数（1=支付宝 3=微信 17=银联二维码 105=储值卡 等）
  // 收银台模式（useCheckout=true）：传 payway=3 sub_payway=3（微信 H5），
  //   收钱吧返回的是 H5 收银台 URL（用户在里面能选微信 H5/银联/储值卡等），
  //   **注意：收银台里如果选支付宝，微信小程序 webview 会拦截 alipays:// 协议**，
  //   所以小程序里实际可用渠道 = 微信 H5 / 银联 / 储值卡
  // 微信原生模式：payway=3 sub_payway=4，收钱吧返回 wap_pay_request（timeStamp/package 等）
  const preBody = {
    terminal_sn: t.terminal_sn,
    client_sn: clientSn,
    total_amount: String(amountInCents),
    subject,
    operator: 'miniprogram',
  };
  if (isCheckout) {
    // H5 收银台：用微信 H5（sub_payway=3），收钱吧返回 wap_url（不是 wap_pay_request）
    preBody.payway = '3';        // 微信
    preBody.sub_payway = '3';    // H5
    preBody.payer_uid = openid;  // 仍带上 openid，收钱吧做关联
    preBody.extended = { sub_appid: SQB.WX_APPID };
  } else {
    preBody.payway = '3';        // 微信
    preBody.sub_payway = '4';    // 小程序
    preBody.payer_uid = openid;
    preBody.extended = { sub_appid: SQB.WX_APPID };
  }

  console.log('===== 收钱吧预下单请求 =====');
  console.log('请求地址: https://vsi-api.shouqianba.com/upay/v2/precreate');
  console.log('terminal_sn:', t.terminal_sn);
  console.log('isCheckout:', isCheckout);
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
  // 收银台 URL 字段：不同版本收钱吧可能叫 wap_url / interact_url / h5_url
  const wapUrl = biz.data?.wap_url || biz.data?.interact_url || biz.data?.h5_url || '';

  await db.collection('payments').doc(paymentId).update({
    data: {
      sqb_sn: sqbSn,
      payMode: isCheckout ? 'checkout' : 'wechat_mp',
      updatedAt: db.serverDate(),
      sqbRawResponse: res,
    },
  });

  // 收银台模式：返回 wapUrl 让前端 webview 打开
  // 微信原生模式：返回 wapPayRequest 让前端调 wx.requestPayment
  if (isCheckout) {
    if (!wapUrl) {
      throw new Error('收银台模式预下单成功但未返回 wap_url，请联系收钱吧确认接口版本');
    }
    return { paymentId, clientSn, sqbSn, wapUrl, payMode: 'checkout' };
  }
  return { paymentId, clientSn, sqbSn, wapPayRequest, payMode: 'wechat_mp' };
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
  // 注：wap2 代客下单的订单只有 client_sn，没有 sn；预下单的订单才有 sn
  if (!payment.sqb_sn && !payment.client_sn) {
    return { paymentStatus: 'pending' };
  }

  const terminal = await getTerminal();
  const t = await ensureCheckin(terminal);
  const queryBody = { terminal_sn: t.terminal_sn };
  if (payment.sqb_sn) queryBody.sn = payment.sqb_sn;
  else if (payment.client_sn) queryBody.client_sn = payment.client_sn;
  const res = await sqbRequest('/upay/v2/query', queryBody, {
    sn: t.terminal_sn, key: t.terminal_key,
  });

  const orderStatus = res?.biz_response?.data?.order_status;

  if (orderStatus === 'PAID') {
    // 检测到 PAID：更新本地 + 通知 CRM（抽成共享函数，settleExistingPending 也复用）
    const channelInfo = await markPaidAndNotifyCRM(payment, res);
    return { paymentStatus: 'paid', paidAt: new Date().toISOString(), channel: channelInfo ? channelInfo.channel : null };
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
 * event.orderCategory 可选：'training' | 'housekeeping'，传入时按类别过滤，避免串数据
 */
async function getPaymentByContract(event) {
  const { contractId, orderCategory } = event;
  if (!contractId) throw new Error('缺少 contractId');
  const where = {
    contractId,
    paymentStatus: _.in(['pending', 'paid']),
  };
  if (orderCategory) where.orderCategory = orderCategory;
  const r = await db.collection('payments').where(where).orderBy('createdAt', 'desc').limit(1).get();

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

/**
 * 预下单（职培订单，小程序支付）
 * event: { contractId, phone, amount }  amount 单位为分，权威来源是 my-order 返回的 payableAmountCents
 * 与家政 precreate 的差异：金额由客户端传入（来自 my-order 的 payableAmountCents），
 * 服务端二次向 CRM 拉 my-order 核对 payableAmountCents 与 paymentEnabled，防客户端篡改
 */
async function precreateTraining(event, openid) {
  const { contractId, phone, amount } = event;
  if (!contractId) throw new Error('缺少 contractId');
  if (!phone)      throw new Error('缺少 phone');
  if (!openid)     throw new Error('缺少 openid');
  if (!amount || Number(amount) <= 0) throw new Error('缺少支付金额');

  const amountInCents = Math.round(Number(amount));
  if (amountInCents <= 0 || amountInCents > 10000000) {
    throw new Error('支付金额异常: ' + amount);
  }

  // ── 防重复：按 contractId + orderCategory=training 查 ──
  const existCheck = await db.collection('payments').where({
    contractId,
    orderCategory: 'training',
    paymentStatus: _.in(['pending', 'paid']),
  }).limit(1).get();

  if (existCheck.data.length > 0) {
    const existing = existCheck.data[0];
    if (existing.paymentStatus === 'paid') {
      throw new Error('该合同已支付，请勿重复支付');
    }
    if (existing.paymentStatus === 'pending' && existing.sqb_sn) {
      const terminal = await getTerminal();
      const t = await ensureCheckin(terminal);
      const qr = await sqbRequest('/upay/v2/query', {
        terminal_sn: t.terminal_sn, sn: existing.sqb_sn,
      }, { sn: t.terminal_sn, key: t.terminal_key });
      const orderStatus = qr?.biz_response?.data?.order_status;
      if (orderStatus === 'PAID') {
        const channelInfo = extractChannelInfo(existing, qr);
        await db.collection('payments').doc(existing._id).update({
          data: {
            paymentStatus: 'paid',
            paidAt: db.serverDate(),
            updatedAt: db.serverDate(),
            channel: channelInfo ? channelInfo.channel : null,
            payway:  channelInfo ? channelInfo.payway  : null,
            subPayway: channelInfo ? channelInfo.subPayway : null,
          },
        });
        existing.channel = channelInfo ? channelInfo.channel : null;
        existing.payway  = channelInfo ? channelInfo.payway  : null;
        notifyTrainingCRM(contractId, phone, existing.amount, existing.sqb_sn, new Date().toISOString(),
          channelInfo ? channelInfo.channel : null, channelInfo ? channelInfo.payway : null);
        throw new Error('该合同已支付，请勿重复支付');
      }
      // IN_PROG 是支付真正处理中的短暂状态，有重复扣款风险，必须拦截
      if (orderStatus === 'IN_PROG') {
        throw new Error('上一笔支付正在处理中，请稍候再试');
      }
      // CREATED（wx.requestPayment 取消或未完成）/ PAY_CANCELED / 其他终态
      // 一律标记为 failed 并继续创建新订单；旧的收钱吧订单会自行超时
      await db.collection('payments').doc(existing._id).update({
        data: { paymentStatus: 'failed', updatedAt: db.serverDate() },
      });
    }
  }

  // ── 二次校验：向 CRM 拉 my-order，核对金额与 paymentEnabled，防客户端篡改 ──
  const verifyRes = await httpsRequest('GET', CRM_HOSTNAME,
    `/api/miniprogram/training-orders/baobei/my-order?phone=${encodeURIComponent(phone)}`, null, {
      'X-Service-Secret': CRM_SERVICE_SECRET,
      'X-Client-Type': 'miniprogram',
    }).catch(() => null);

  const contracts = verifyRes && verifyRes.data && verifyRes.data.contracts;
  const target = Array.isArray(contracts)
    ? contracts.find(c => String(c.id) === String(contractId))
    : null;
  if (!target) throw new Error('合同不存在或无权访问');
  if (!target.paymentEnabled) throw new Error('该合同当前不可支付');
  if (target.paymentStatus === 'paid') throw new Error('该合同已支付，请勿重复支付');
  // 用应付金额（payableAmountCents）做防篡改比对；paymentAmount 是实付金额，未支付时为 null
  if (Number(target.payableAmountCents) !== amountInCents) {
    throw new Error(`支付金额不匹配（期望 ${target.payableAmountCents} 分）`);
  }

  // ── 获取终端并确保签到 ──
  const terminal = await getTerminal();
  const t = await ensureCheckin(terminal);

  // ── 生成订单号并创建支付记录 ──
  const clientSn = generateClientSn();
  const paymentDoc = {
    contractId, phone, openid,
    orderCategory: 'training',
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
    subject: '安得褓贝-职培订单',
    operator: 'miniprogram',
    extended: { sub_appid: SQB.WX_APPID },
  };

  console.log('===== 收钱吧预下单请求（职培） =====');
  console.log('terminal_sn:', t.terminal_sn);
  console.log('请求参数:', JSON.stringify(preBody, null, 2));

  const res = await sqbRequest('/upay/v2/precreate', preBody, {
    sn: t.terminal_sn, key: t.terminal_key,
  });

  console.log('===== 收钱吧预下单响应（职培） =====');
  console.log('响应内容:', JSON.stringify(res, null, 2));

  if (res.result_code !== '200' || !res.biz_response) {
    await db.collection('payments').doc(paymentId).update({
      data: { paymentStatus: 'failed', updatedAt: db.serverDate(), sqbRawResponse: res },
    });
    throw new Error('预下单失败: ' + JSON.stringify(res));
  }

  const biz = res.biz_response;
  if (biz.result_code !== 'PRECREATE_SUCCESS') {
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

  return { paymentId, clientSn, sqbSn, wapPayRequest };
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
      case 'precreateTraining':
        return { success: true, data: await precreateTraining(event, openid) };
      case 'queryPayment':
        return { success: true, data: await queryPayment(event) };
      case 'getPaymentByContract':
        return { success: true, data: await getPaymentByContract(event) };
      case 'refund':
        return { success: true, data: await refund(event) };
      case 'getPaymentProgress': {
        const { contractId, phone } = event;
        if (!contractId) return { success: false, errMsg: '缺少 contractId' };
        if (!phone) return { success: false, errMsg: '缺少 phone' };

        const crmHeaders = {
          'X-Service-Secret': CRM_SERVICE_SECRET,
          'X-Client-Type': 'miniprogram',
        };

        // ① 获取支付进度（totalAmount / receivedAmount）
        const progressRes = await httpsRequest('GET', CRM_HOSTNAME,
          `/api/miniprogram/contracts/${contractId}/payment-progress?phone=${encodeURIComponent(phone)}`,
          null, crmHeaders
        );

        // 兼容 CRM 多种响应结构
        let data = progressRes;
        if (data && data.data && typeof data.data === 'object') data = data.data;
        if (data && data.data && typeof data.data === 'object') data = data.data;
        if (!data || typeof data !== 'object') data = {};

        console.log('[paymentService] getPaymentProgress progress keys:', Object.keys(data));

        // ② 如果 progress 接口缺少 payments 数组，从合同详情补充
        //    （未来 CRM 升级返回 payments 后，此分支自动跳过）
        if (!Array.isArray(data.payments)) {
          try {
            const contractRes = await httpsRequest('GET', CRM_HOSTNAME,
              `/api/miniprogram/contracts/${contractId}?phone=${encodeURIComponent(phone)}`,
              null, crmHeaders
            );
            let contractData = contractRes;
            if (contractData && contractData.data && typeof contractData.data === 'object') contractData = contractData.data;
            if (contractData && contractData.data && typeof contractData.data === 'object') contractData = contractData.data;

            if (contractData && Array.isArray(contractData.payments)) {
              data.payments = contractData.payments;
              console.log('[paymentService] supplemented payments from contract detail, count:', data.payments.length);
            }
          } catch (e) {
            console.warn('[paymentService] failed to fetch contract detail for payments:', e.message);
          }
        }

        // ③ 安全网：用 receivedAmount 交叉校验付款状态，确保 nextPayment 正确
        if (Array.isArray(data.payments) && data.payments.length > 0) {
          // 先归一化所有状态：只认 CRM 明确返回的 'paid'
          data.payments.forEach(p => {
            if (p.status !== 'paid') {
              p.status = 'pending';
            }
          });

          // 用 receivedAmount 校准（仅在有实际收款时）
          const receivedAmount = Number(data.receivedAmount || 0);
          if (receivedAmount > 0) {
            let remaining = receivedAmount;
            data.payments.forEach(p => {
              const amt = Number(p.amount || 0);
              if (remaining >= amt && amt > 0) {
                p.status = 'paid';
                remaining -= amt;
              } else {
                p.status = 'pending';
              }
            });
          }

          // 确保 nextPayment 存在（取第一个非 paid 的项）
          if (!data.nextPayment) {
            data.nextPayment = data.payments.find(p => p.status !== 'paid') || null;
          }
          // 补充 totalAmount（如果不存在）
          if (data.totalAmount === undefined) {
            data.totalAmount = data.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
          }
          // 补充 receivedAmount（如果不存在，用校准后的数据计算）
          if (data.receivedAmount === undefined) {
            data.receivedAmount = data.payments
              .filter(p => p.status === 'paid')
              .reduce((sum, p) => sum + Number(p.amount || 0), 0);
          }
        }

        console.log('[paymentService] getPaymentProgress final:',
          'hasPayments:', Array.isArray(data.payments),
          'paymentsLen:', data.payments?.length,
          'hasNextPayment:', !!data.nextPayment,
          'nextPaymentSeq:', data.nextPayment?.sequenceNo);

        return { success: true, data };
      }
case 'buildGatewayUrl': {
        // CRM 端调用：生成收钱吧 wap2 聚合收款 URL（payway 不传，按扫码方 UA 自动选渠道）
        // 入参: { contractId, amount, subject, operator, returnUrl, notifyUrl, clientSn? }
        // 出参: { gatewayUrl, clientSn, amount, expiresAt, terminalSn }
        const { contractId, amount, subject, operator, returnUrl, notifyUrl, clientSn: inputClientSn } = event;
        if (!amount || Number(amount) <= 0) return { success: false, errMsg: '缺少 amount' };
        if (!returnUrl) return { success: false, errMsg: '缺少 returnUrl' };
        if (!notifyUrl) return { success: false, errMsg: '缺少 notifyUrl' };
        if (!subject) return { success: false, errMsg: '缺少 subject' };

        const amountInCents = Math.round(Number(amount));
        if (amountInCents <= 0 || amountInCents > 10000000) {
          return { success: false, errMsg: '支付金额异常: ' + amount };
        }

        // 获取终端并确保签到
        const terminal = await getTerminal();
        const t = await ensureCheckin(terminal);

        // 订单号：CRM 端可以传自己的 clientSn 过来（带 contractId 便于回查）
        const clientSn = inputClientSn || generateClientSn();

        // 写一条 pending 支付记录（query/callback 时更新状态）
        // payMode=gateway 标识是聚合收款码（区别于 wechat_mp / checkout）
        const paymentDoc = {
          contractId: contractId || null,
          phone: event.phone || null,
          client_sn: clientSn,
          sqb_sn: '',
          amount: amountInCents,
          paymentStatus: 'pending',
          paidAt: null,
          payMode: 'gateway',
          createdBy: 'crm_qr',
          openid: '',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        };
        const addRes = await db.collection('payments').add({ data: paymentDoc });
        const paymentId = addRes._id;

        // 拼 wap2 网关 URL 参数（payway 故意不传 → 按扫码方 UA 自动选渠道）
        const params = {
          terminal_sn: t.terminal_sn,
          client_sn: clientSn,
          total_amount: String(amountInCents),
          subject: String(subject).slice(0, 64),
          operator: (operator || 'crm').slice(0, 32),
          return_url: returnUrl,
          notify_url: notifyUrl,
        };
        if (event.reflect) params.reflect = String(event.reflect).slice(0, 64);

        // 签名：参数按 ASCII 升序排序，拼接成 stringA，拼 key，MD5 转大写
        const sortedKeys = Object.keys(params).sort();
        const stringA = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
        const stringSignTemp = `${stringA}&key=${t.terminal_key}`;
        const sign = crypto.createHash('md5').update(stringSignTemp, 'utf8').digest('hex').toUpperCase();

        // 完整 URL：https://qr.shouqianba.com/gateway?{stringA}&sign={sign}
        const gatewayUrl = `https://qr.shouqianba.com/gateway?${stringA}&sign=${sign}`;

        // 5 分钟过期（防呆，过期后 CRM 端需重新生成）
        const expiresAt = Date.now() + 5 * 60 * 1000;

        await db.collection('payments').doc(paymentId).update({
          data: { gatewayUrl, expiresAt, updatedAt: db.serverDate() },
        });

        console.log('[paymentService] buildGatewayUrl:', { paymentId, clientSn, amount: amountInCents, terminalSn: t.terminal_sn });

        return {
          success: true,
          data: {
            paymentId,
            clientSn,
            amount: amountInCents,
            gatewayUrl,
            terminalSn: t.terminal_sn,
            expiresAt,
          },
        };
      }
      case 'precreateGateway': {
        // 小程序前端调用：生成 wap2 聚合收款 URL（payway 不传，按扫码方 UA 自选微信/支付宝）
        // 用于"用支付宝支付"按钮。客户扫码后跳出小程序去支付宝/微信完成支付，
        // 支付结果通过轮询 queryPayment 检测。
        // 入参: { contractId, phone, paymentSequenceNo? }
        // 出参: { paymentId, clientSn, gatewayUrl, qrCodeFileId, amount, subject, expiresAt }
        const { contractId, phone, paymentSequenceNo } = event;
        if (!contractId) return { success: false, errMsg: '缺少 contractId' };
        if (!phone) return { success: false, errMsg: '缺少 phone' };
        if (!openid) return { success: false, errMsg: '缺少 openid' };

        const isV2 = !!paymentSequenceNo;

        // 1) 获取终端并签到
        const terminal = await getTerminal();
        const t = await ensureCheckin(terminal);

        // 2) 防重复 + 同步已有 pending
        await settleExistingPending({ contractId, paymentSequenceNo, isV2, terminal: t });

        // 3) 拉金额（V2 从 payment-progress 取对应笔次，V1 从合同详情取 serviceFee）
        const { amountInCents, subject } = await fetchAmountAndSubject({
          contractId, phone, paymentSequenceNo,
        });

        // 4) 生成订单号 + 5 分钟过期时间
        const clientSn = generateClientSn();
        const expiresAt = Date.now() + 5 * 60 * 1000;

        // 5) 先写一条 pending 支付记录（拿到真实 paymentId，用于 return_url）
        const paymentDoc = {
          contractId,
          phone,
          openid,
          orderCategory: 'housekeeping',
          client_sn: clientSn,
          sqb_sn: '',
          amount: amountInCents,
          paymentStatus: 'pending',
          paidAt: null,
          payMode: 'gateway_alipay',  // 区分 CRM 端 buildGatewayUrl（payMode='gateway'）
          createdBy: 'miniprogram',
          expiresAt,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        };
        if (isV2) paymentDoc.paymentSequenceNo = paymentSequenceNo;
        const addRes = await db.collection('payments').add({ data: paymentDoc });
        const paymentId = addRes._id;

        // 6) 拼 wap2 网关 URL 参数（payway 故意不传 → 按扫码方 UA 自动选渠道）
        // 注意：notify_url 不要传（空字符串会被收钱吧网关当作"参数错误"返回 418）
        const params = {
          terminal_sn: t.terminal_sn,
          client_sn: clientSn,
          total_amount: String(amountInCents),
          subject: String(subject).slice(0, 64),
          operator: 'miniprogram',
          return_url: ALIPAY_RETURN_URL,  // 简化：去掉 query string，避免网关校验失败
        };

        // 7) 签名：参数按 ASCII 升序排序，拼 stringA + &key= → MD5 大写
        const sortedKeys = Object.keys(params).sort();
        const stringA = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
        const stringSignTemp = `${stringA}&key=${t.terminal_key}`;
        const sign = crypto.createHash('md5').update(stringSignTemp, 'utf8').digest('hex').toUpperCase();
        const gatewayUrl = `https://qr.shouqianba.com/gateway?${stringA}&sign=${sign}`;

        // 8) 生成二维码 PNG → 上传到云存储（失败也不阻塞主流程）
        const qrCodeFileId = await generateQrCodeFile(gatewayUrl, clientSn);

        // 9) 把 gatewayUrl + qrCodeFileId 回写到 payments 记录
        await db.collection('payments').doc(paymentId).update({
          data: { gatewayUrl, qrCodeFileId, updatedAt: db.serverDate() },
        });

        console.log('[paymentService] precreateGateway:', {
          paymentId, clientSn, amount: amountInCents, terminalSn: t.terminal_sn,
          qrCodeFileId: qrCodeFileId || '(生成失败)',
        });

        return {
          success: true,
          data: {
            paymentId,
            clientSn,
            gatewayUrl,
            qrCodeFileId,  // 前端用 <image src="{{cloudFileId}}"> 直接展示
            amount: amountInCents,
            subject,
            expiresAt,
          },
        };
      }
      default:
        return { success: false, errMsg: 'unknown action: ' + action };
    }
  } catch (err) {
    console.error('[paymentService] error:', err.message, err.stack);
    return { success: false, errMsg: err.message || '服务异常' };
  }
};
