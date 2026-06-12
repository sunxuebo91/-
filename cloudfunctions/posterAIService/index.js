const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 用于快速确认"云函数是否已重新部署/生效"
const VERSION = '2026-06-12-posterAIService-v1';

// ⚠️ 密钥读取策略：
//   首选：在微信云开发控制台 → 云函数 → posterAIService → 配置 → 环境变量
//         设置 DOUBAO_API_KEY=xxx（推荐，密钥不入仓库）。
//   兜底：把下面 FALLBACK_API_KEY 替换成新 key 再部署（不推荐，源码会进仓库历史）。
//   轮换：火山引擎方舟控制台 → API Key 管理 → 作废旧 key，新建后写入上面任一来源。
const FALLBACK_API_KEY = '<<REPLACE_WITH_NEW_ARK_KEY_OR_USE_ENV_VAR>>';
const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY || FALLBACK_API_KEY;

const DOUBAO_IMG_MODEL = 'doubao-seedream-5-0-260128';
const DOUBAO_TXT_MODEL = 'doubao-seed-2-0-mini-260215';
const ARK_HOST = 'ark.cn-beijing.volces.com';

/** 向 ARK 发 POST 请求，返回 { statusCode, raw, json } */
function arkRequest(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: ARK_HOST,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${DOUBAO_API_KEY}`,
      },
      timeout: 90000,
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (e) { /* 非 JSON 错误页保留 raw */ }
        resolve({ statusCode: res.statusCode, raw, json });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('ARK_TIMEOUT')));
    req.write(payload);
    req.end();
  });
}

/** 把 ARK / HTTP 错误码映射成给小程序用户的友好文案 */
function mapArkError(code, statusCode) {
  switch (code) {
    case 'AccountOverdueError':
    case 'InsufficientBalance':
      return '海报服务暂不可用，请联系管理员（账户余额不足）';
    case 'RateLimitExceeded':
    case 'TooManyRequests':
      return '生成的人太多了，请稍后再试';
    case 'InvalidApiKey':
    case 'AuthenticationError':
    case 'Unauthorized':
      return '海报服务密钥失效，请联系管理员';
    case 'ContentFilter':
    case 'SensitiveContentDetected':
      return '内容不符合规范，请换一条文案重试';
    default:
      if (statusCode === 429) return '生成的人太多了，请稍后再试';
      if (statusCode >= 500) return '海报服务繁忙，请稍后再试';
      return '生成失败，请重试';
  }
}

async function generateImage(event) {
  const prompt = event && event.prompt;
  if (!prompt) return { success: false, error: 'MISSING_PROMPT', userMessage: '画面描述为空' };
  const { statusCode, json, raw } = await arkRequest('/api/v3/images/generations', {
    model: DOUBAO_IMG_MODEL,
    prompt,
    response_format: 'url',
    size: '2k',
    watermark: false,
    seed: Math.floor(Math.random() * 2147483647),
  });
  const url = json && json.data && json.data[0] && json.data[0].url;
  if (url) return { success: true, url };
  const code = (json && json.error && json.error.code) || '';
  console.warn('[posterAIService] image fail:', statusCode, code, raw && raw.slice(0, 200));
  return {
    success: false,
    statusCode,
    error: code || 'NO_IMAGE',
    userMessage: mapArkError(code, statusCode),
  };
}

async function generateText(event) {
  const messages = event && event.messages;
  if (!Array.isArray(messages) || !messages.length) {
    return { success: false, error: 'MISSING_MESSAGES', userMessage: '请求参数错误' };
  }
  const { statusCode, json, raw } = await arkRequest('/api/v3/chat/completions', {
    model: DOUBAO_TXT_MODEL,
    messages,
    temperature: Number(event.temperature) || 0.85,
    max_tokens: Number(event.max_tokens) || 200,
    thinking: { type: 'disabled' },
  });
  const content = json && json.choices && json.choices[0]
    && json.choices[0].message && json.choices[0].message.content;
  if (typeof content === 'string' && content) return { success: true, content };
  const code = (json && json.error && json.error.code) || '';
  console.warn('[posterAIService] text fail:', statusCode, code, raw && raw.slice(0, 200));
  return {
    success: false,
    statusCode,
    error: code || 'NO_CONTENT',
    userMessage: mapArkError(code, statusCode),
  };
}

exports.main = async (event = {}) => {
  const action = event.action || '';
  try {
    if (action === 'generateImage') return await generateImage(event);
    if (action === 'generateText')  return await generateText(event);
    if (action === 'version')       return { success: true, VERSION };
    return { success: false, error: 'UNKNOWN_ACTION', userMessage: `未知操作: ${action}` };
  } catch (err) {
    console.error('[posterAIService] internal error:', err);
    return {
      success: false,
      error: (err && err.message) || 'INTERNAL_ERROR',
      userMessage: '海报服务异常，请稍后再试',
      VERSION,
    };
  }
};
