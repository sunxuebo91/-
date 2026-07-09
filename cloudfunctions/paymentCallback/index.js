/**
 * paymentCallback — 收钱吧「微信小店代客下单」推送回调
 *
 * 触发方式：HTTP trigger（微信云函数 HTTP 触发器）
 * 入口：POST 请求，body 为 JSON
 *
 * 推送类型（PDF 第 20-25 页）：
 *   1. 订单推送：content 含 orderSn + orderStateCode
 *      0=已创建 10=已支付 35=已完成 40=已取消
 *   2. 退款推送：content 含 ticketSn + sourceState/targetState
 *      0=创建 10=退款中 15=退款完成 20=完成 30=取消退款
 *
 * 验签：SHA256WithRSA + PKCS#8 公钥
 *   原串 = eventId + timestamp + nonce + content
 *   公钥 = 来自环境变量 SQB_PREORDER_PUBLIC_KEY
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const crypto = require('crypto');

// ─── 配置 ───
const SQB_PREORDER_PUBLIC_KEY = process.env.SQB_PREORDER_PUBLIC_KEY || 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3Hlg887xrRWYxPqLDX53oimjsxfd7PDdhQ4zHUYA1eQP6PMyhAo+GU/oq4RQVpW6LrG0PWA6CoD7qva6T0NwsDWn5/fmWhmH+Ad6K5WG5jY9ZVjnys9R+HGeFyE7hSkhqSgiSlEMv9IBJD5p9ZqBZ0FAPotMS/RIBHANVA37J0Zlp9wakvUegcXb3hl9xp+aRsjikhS5h89qiPPXGkWq9dsQrbpDODP8RziqskxzIzu4tYtvLkUZ/Ak9LCRu63SSGX+yAj24mG9Q+4taWGX32AmuVFK9CGDoec0IYx8ouUtiGWVBqZz0dRteKbBbL6MtnPjUxT+wMc6rarPL8zj9vwIDAQAB';

const CRM_HOSTNAME = 'crm.andejiazheng.com';
const CRM_SERVICE_SECRET = process.env.CRM_SERVICE_SECRET || '270a1997eeebe6bfca45e9cb9bc2e602ed708a1b3663119cfe6fcb2112976093';

const https = require('https');

// ─── 工具函数 ───

function jsonHttpsPost(hostname, path, body, headers = {}) {
  const bodyStr = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('CRM JSON parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

/** SHA256WithRSA 验签（PDF 第 6 页） */
function verifySignature(eventId, timestamp, nonce, content, signatureBase64) {
  try {
    const plaintext = `${eventId}${timestamp}${nonce}${content}`;
    const pubKeyPem = `-----BEGIN PUBLIC KEY-----\n${SQB_PREORDER_PUBLIC_KEY.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
    const verify = crypto.createVerify('SHA256');
    verify.update(plaintext);
    verify.end();
    return verify.verify(pubKeyPem, signatureBase64, 'base64');
  } catch (e) {
    console.error('[paymentCallback] verifySignature error:', e.message);
    return false;
  }
}

/** 调 CRM payment-confirm（4 字段：phone/amount/sqb_sn/paidAt） */
async function notifyCRMPaymentConfirm(contractId, phone, amount, sqbSn, paidAt, orderCategory) {
  const path = orderCategory === 'training'
    ? `/api/miniprogram/training-orders/baobei/${contractId}/payment-confirm`
    : `/api/miniprogram/contracts/${contractId}/payment-confirm`;
  const body = { phone, amount, sqb_sn: sqbSn, paidAt };
  console.log('[paymentCallback] notifyCRMPaymentConfirm →', path, 'body:', JSON.stringify(body));
  try {
    const res = await jsonHttpsPost(CRM_HOSTNAME, path, body, {
      'X-Service-Secret': CRM_SERVICE_SECRET,
      'X-Client-Type': 'miniprogram',
    });
    console.log('[paymentCallback] notifyCRMPaymentConfirm ←', JSON.stringify(res).slice(0, 300));
    return res;
  } catch (e) {
    console.error('[paymentCallback] notifyCRMPaymentConfirm ✗ failed:', e.message);
    return null;
  }
}

/** 调 CRM refund-confirm */
async function notifyCRMRefundConfirm(contractId, orderCategory, body) {
  const path = orderCategory === 'training'
    ? `/api/miniprogram/training-orders/baobei/${contractId}/refund-confirm`
    : `/api/miniprogram/contracts/${contractId}/refund-confirm`;
  console.log('[paymentCallback] notifyCRMRefundConfirm →', path);
  try {
    const res = await jsonHttpsPost(CRM_HOSTNAME, path, body, {
      'X-Service-Secret': CRM_SERVICE_SECRET,
      'X-Client-Type': 'miniprogram',
    });
    console.log('[paymentCallback] notifyCRMRefundConfirm ←', JSON.stringify(res).slice(0, 300));
    return res;
  } catch (e) {
    console.error('[paymentCallback] notifyCRMRefundConfirm ✗ failed:', e.message);
    return null;
  }
}

/** 处理订单推送：content.orderSn + content.orderStateCode */
async function handleOrderPush(content) {
  const { orderSn, orderStateCode, orderAmount, preOrderList = [] } = content;

  // 状态码非支付成功 → 不处理（让业务超时清理）
  if (![10, 35].includes(orderStateCode)) {
    console.log('[paymentCallback] orderStateCode=', orderStateCode, '非已支付/已完成，跳过');
    return { code: 0, message: 'ignored: not paid' };
  }

  // 通过 preOrderId 反查 baobei payments
  const preOrderId = preOrderList[0]?.preOrderId;
  if (!preOrderId) {
    console.warn('[paymentCallback] orderPush 缺 preOrderId, content=', JSON.stringify(content).slice(0, 300));
    return { code: 0, message: 'ignored: no preOrderId' };
  }

  const payRes = await db.collection('payments').where({ preOrderId }).limit(1).get();
  if (!payRes.data.length) {
    console.warn('[paymentCallback] baobei payments 找不到 preOrderId=', preOrderId);
    return { code: 0, message: 'ignored: preOrderId not found' };
  }
  const payment = payRes.data[0];

  // 幂等：已 paid 的不重复处理
  if (payment.paymentStatus === 'paid') {
    console.log('[paymentCallback] paymentId=', payment._id, '已是 paid 状态，幂等跳过');
    return { code: 0, message: 'already paid' };
  }

  // 1) 落库 baobei payments
  await db.collection('payments').doc(payment._id).update({
    data: {
      paymentStatus: 'paid',
      paidAt: db.serverDate(),
      sqbOrderSn: orderSn,
      orderAmountCents: orderAmount,  // SQB 返回单位是分
      updatedAt: db.serverDate(),
    },
  });

  // 2) 推 CRM payment-confirm
  await notifyCRMPaymentConfirm(
    payment.contractId,
    payment.phone,
    payment.amount,
    orderSn,
    new Date().toISOString(),
    payment.orderCategory,
  );

  return { code: 0, message: 'paid processed', paymentId: payment._id };
}

/** 处理退款推送：content.ticketSn + content.targetState */
async function handleRefundPush(content) {
  const { orderSn, ticketSn, sourceState, targetState, applyAmount } = content;

  // 仅处理退款完成（targetState=15）
  if (targetState !== 15) {
    console.log('[paymentCallback] refundPush targetState=', targetState, '非退款完成，跳过');
    return { code: 0, message: 'ignored: refund not completed' };
  }

  // 通过 sqbOrderSn 反查 baobei payments
  const payRes = await db.collection('payments').where({ sqbOrderSn: orderSn }).limit(1).get();
  if (!payRes.data.length) {
    console.warn('[paymentCallback] baobei payments 找不到 sqbOrderSn=', orderSn);
    return { code: 0, message: 'ignored: orderSn not found' };
  }
  const payment = payRes.data[0];

  // 幂等
  if (payment.paymentStatus === 'refunded') {
    console.log('[paymentCallback] paymentId=', payment._id, '已是 refunded 状态，幂等跳过');
    return { code: 0, message: 'already refunded' };
  }

  // 1) 落库 baobei payments
  await db.collection('payments').doc(payment._id).update({
    data: {
      paymentStatus: 'refunded',
      refundedAt: db.serverDate(),
      sqbRefundSn: ticketSn,
      refundAmountCents: applyAmount,  // 单位：分
      updatedAt: db.serverDate(),
    },
  });

  // 2) 推 CRM refund-confirm
  await notifyCRMRefundConfirm(
    payment.contractId,
    payment.orderCategory,
    {
      phone: payment.phone,
      paymentRecordId: payment.crmRecordId || null,
      sqbRefundSn: ticketSn,
      refundAmountCents: applyAmount,
      refundedAt: new Date().toISOString(),
    },
  );

  return { code: 0, message: 'refund processed', paymentId: payment._id };
}

// ═══════════════════════════════════════
// HTTP trigger 入口
// ═══════════════════════════════════════

exports.main = async (event) => {
  console.log('[paymentCallback] 收到推送 event keys:', Object.keys(event));

  // HTTP trigger: body 是 string，需要 parse
  let payload = event;
  if (event.body && typeof event.body === 'string') {
    try { payload = JSON.parse(event.body); }
    catch (e) {
      console.error('[paymentCallback] body JSON 解析失败:', e.message);
      return { code: 400, message: 'body 格式错误' };
    }
  }

  const { eventId, timestamp, nonce, content, signature } = payload;

  if (!eventId || !timestamp || !nonce || !content || !signature) {
    console.error('[paymentCallback] 推送缺字段，payload=', JSON.stringify(payload).slice(0, 300));
    return { code: 400, message: '推送字段不完整' };
  }

  // 1) 验签
  const sigOk = verifySignature(eventId, timestamp, nonce, content, signature);
  if (!sigOk) {
    console.error('[paymentCallback] 验签失败 eventId=', eventId);
    return { code: 400, message: '验签失败' };
  }
  console.log('[paymentCallback] 验签通过 eventId=', eventId);

  // 2) 解析 content（JSON 字符串）
  let contentObj;
  try { contentObj = JSON.parse(content); }
  catch (e) {
    console.error('[paymentCallback] content JSON 解析失败:', e.message, 'content=', content.slice(0, 200));
    return { code: 400, message: 'content 格式错误' };
  }

  // 3) 区分订单 / 退款推送
  try {
    if (contentObj.orderSn && contentObj.orderStateCode !== undefined) {
      return await handleOrderPush(contentObj);
    } else if (contentObj.ticketSn) {
      return await handleRefundPush(contentObj);
    } else {
      console.warn('[paymentCallback] 未知推送类型, content=', JSON.stringify(contentObj).slice(0, 300));
      return { code: 0, message: 'unknown push type, ignored' };
    }
  } catch (e) {
    console.error('[paymentCallback] 处理失败:', e.message);
    return { code: 500, message: '内部错误: ' + e.message };
  }
};