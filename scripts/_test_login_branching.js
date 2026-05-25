/**
 * 临时测试：mock wx.* 后加载 app.js，验证 autoLogin 在 4 种 CRM 响应下的分支行为
 * 用法：node scripts/_test_login_branching.js
 */
const path = require('path');

// ===== 用例：模拟 wx.request 返回的不同 CRM 响应 =====
const SCENARIOS = [
  {
    name: '200 success',
    response: { statusCode: 200, data: { success: true, data: { _openid: 'mockid', isStaff: false } } },
    expect: { storageSaved: true, tokenAttempted: true, logIncludes: '自动登录成功' },
  },
  {
    name: '404 USER_NOT_REGISTERED',
    response: { statusCode: 404, data: { success: false, code: 'USER_NOT_REGISTERED', message: '未注册' } },
    expect: { storageSaved: false, tokenAttempted: false, logIncludes: '尚未在 CRM 注册' },
  },
  {
    name: '409 DUPLICATE_PHONE',
    response: { statusCode: 409, data: { success: false, code: 'DUPLICATE_PHONE', message: 'E11000...' } },
    expect: { storageSaved: false, tokenAttempted: false, logIncludes: 'CRM 登录冲突' },
  },
  {
    name: '500 unknown error',
    response: { statusCode: 500, data: { success: false, code: 'INTERNAL_ERROR', message: 'oops' } },
    expect: { storageSaved: false, tokenAttempted: false, logIncludes: 'CRM 登录接口异常' },
  },
];

// ===== 跑单个用例 =====
async function runOne(scenario) {
  // 重置模块缓存
  delete require.cache[require.resolve(path.resolve(__dirname, '../miniprogram/app.js'))];

  const logs = [];
  const storageWrites = {};
  let tokenRequestCount = 0;
  let appConfig = null;

  // ---- mock 全局 ----
  global.App = (config) => { appConfig = config; };
  global.getApp = () => ({ globalData: appConfig?.globalData || {} });
  global.getCurrentPages = () => [];
  global.console = {
    log:   (...a) => logs.push(['log',   a.join(' ')]),
    warn:  (...a) => logs.push(['warn',  a.join(' ')]),
    error: (...a) => logs.push(['error', a.join(' ')]),
  };
  global.wx = {
    cloud: {
      init: () => {},
      callFunction: async ({ data }) => {
        // getOrCreateMe → 返回 mock openid
        if (data?.action === 'getOrCreateMe') {
          return { result: { data: { _openid: 'mockid' } } };
        }
        return { result: { data: {} } };
      },
    },
    login: ({ success }) => success({ code: 'mockcode' }),
    request: ({ url, success }) => {
      if (url.includes('/api/miniprogram-users/login')) {
        success(scenario.response);
      } else if (url.includes('/api/auth/miniprogram/login')) {
        tokenRequestCount++;
        success({ statusCode: 200, data: { data: { token: 'jwt-mock' } } });
      } else {
        success({ statusCode: 200, data: {} });
      }
    },
    getStorageSync: (k) => storageWrites[k] || (k === 'salary_sharer_reset_v1' ? 1 : null),
    setStorageSync: (k, v) => { storageWrites[k] = v; },
    removeStorageSync: () => {},
    getUpdateManager: null,
  };

  // ---- 加载 app.js（执行 App({...})）----
  require(path.resolve(__dirname, '../miniprogram/app.js'));

  // 手动建 this 上下文：globalData 在源码里是 onLaunch 内动态赋值，这里手工初始化
  const ctx = {
    globalData: { env: 'mock', userInfo: null },
    refreshMessageBadge: () => {},
    checkForUpdates: () => {},
    calcSubscribeReminder: () => {},
  };
  await appConfig.autoLogin.call(ctx);

  // 等一拍让异步 setStorageSync 完成
  await new Promise(r => setTimeout(r, 10));

  // ---- 断言 ----
  const allLogs = logs.map(([_, m]) => m).join('\n');
  const storageSaved = !!storageWrites['crmUserInfo'];
  const tokenAttempted = tokenRequestCount > 0;
  const logIncludes = allLogs.includes(scenario.expect.logIncludes);

  const pass =
    storageSaved   === scenario.expect.storageSaved &&
    tokenAttempted === scenario.expect.tokenAttempted &&
    logIncludes;

  return { name: scenario.name, pass, storageSaved, tokenAttempted, logIncludes, allLogs };
}

(async () => {
  process.stdout.write('▶ 测试 autoLogin 响应分支\n\n');
  let allPass = true;
  for (const sc of SCENARIOS) {
    const r = await runOne(sc);
    allPass = allPass && r.pass;
    const tag = r.pass ? '✅' : '❌';
    process.stdout.write(`${tag} ${r.name}\n`);
    if (!r.pass) {
      process.stdout.write(`   期望: ${JSON.stringify(sc.expect)}\n`);
      process.stdout.write(`   实际: storageSaved=${r.storageSaved} tokenAttempted=${r.tokenAttempted} logIncludes=${r.logIncludes}\n`);
      process.stdout.write(`   ---捕获的日志---\n${r.allLogs}\n   ----------------\n`);
    }
  }
  process.stdout.write(`\n${allPass ? '🎉 全部通过' : '❗ 有用例未通过'}\n`);
  process.exit(allPass ? 0 : 1);
})();
