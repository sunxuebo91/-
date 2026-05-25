/**
 * 临时测试：mock wx.* 后加载 login/index.js 的 onGetPhoneNumber
 * 验证 CRM register 返回不同状态时：
 *   1) 是否弹出"登录成功"
 *   2) 是否调用 navigateBack / switchTab（自动跳转）
 *   3) 409 时是否弹出对应冲突提示
 * 用法：node scripts/_test_login_register_flow.js
 */
const path = require('path');

const SCENARIOS = [
  {
    name: '200 success → 弹"登录成功"并跳转',
    response: { statusCode: 200, data: { success: true, data: { _id: 'u1', token: 'jwt' } } },
    expect: { successToast: true, navigated: true, conflictToast: false },
  },
  {
    name: '409 DUPLICATE_PHONE → 弹冲突提示，不"登录成功"、不跳转',
    response: { statusCode: 409, data: { success: false, code: 'DUPLICATE_PHONE', message: 'E11000...' } },
    expect: { successToast: false, navigated: false, conflictToast: true },
  },
  {
    name: '500 unknown → 仍走降级"登录成功"并跳转',
    response: { statusCode: 500, data: { success: false, code: 'INTERNAL', message: 'oops' } },
    expect: { successToast: true, navigated: true, conflictToast: false },
  },
  {
    name: '网络异常进 catch → 仍走降级"登录成功"并跳转',
    response: '__NETWORK_FAIL__',
    expect: { successToast: true, navigated: true, conflictToast: false },
  },
];

async function runOne(scenario) {
  const loginPath = path.resolve(__dirname, '../miniprogram/pages/login/index.js');
  delete require.cache[loginPath];

  const toasts = [];
  let navigated = false;
  let pageConfig = null;

  // 拦截 setTimeout，让跳转回调立刻执行
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => { fn(); return 0; };

  global.Page = (config) => { pageConfig = config; };
  global.getApp = () => ({ globalData: {} });
  global.getCurrentPages = () => [{}, {}];  // length>1 → 走 navigateBack
  global.console = { log: () => {}, warn: () => {}, error: () => {} };
  global.wx = {
    showLoading: () => {}, hideLoading: () => {},
    showToast: ({ title }) => { toasts.push(title); },
    navigateBack: () => { navigated = true; },
    switchTab: () => { navigated = true; },
    setStorageSync: () => {},
    getStorageSync: () => null,
    cloud: {
      uploadFile: async () => ({ fileID: 'cloud://mock' }),
      callFunction: async ({ data }) => {
        // loginByPhone → 模拟成功返回 openid/phone
        if (data?.action === 'loginByPhone') {
          return { result: { success: true, data: { _openid: 'mockid', phone: '13800000000' } } };
        }
        return { result: { data: {} } };
      },
    },
    request: ({ url, success, fail }) => {
      if (scenario.response === '__NETWORK_FAIL__' && url.includes('register')) {
        return fail({ errMsg: 'request:fail timeout' });
      }
      if (url.includes('/api/miniprogram-users/register')) {
        return success(scenario.response);
      }
      if (url.includes('/api/resumes/staff/info')) {
        return success({ statusCode: 404, data: { success: false } });
      }
      success({ statusCode: 200, data: {} });
    },
  };

  // 加载并取出 onGetPhoneNumber
  require(loginPath);
  const ctx = { data: { agreed: true, nickname: '测试', avatarUrl: '' }, setData: () => {} };
  await pageConfig.onGetPhoneNumber.call(ctx, {
    detail: { errMsg: 'getPhoneNumber:ok', code: 'phonecode' },
  });

  global.setTimeout = realSetTimeout;

  const successToast  = toasts.some(t => t.includes('登录成功'));
  const conflictToast = toasts.some(t => t.includes('手机号已绑定') || t.includes('账号冲突') || t.includes('已被占用') || t.includes('已绑定其他记录'));

  const pass =
    successToast  === scenario.expect.successToast &&
    navigated     === scenario.expect.navigated &&
    conflictToast === scenario.expect.conflictToast;

  return { name: scenario.name, pass, toasts, navigated, successToast, conflictToast };
}

(async () => {
  process.stdout.write('▶ 测试 onGetPhoneNumber（含 crmConflict 修复）\n\n');
  let allPass = true;
  for (const sc of SCENARIOS) {
    const r = await runOne(sc);
    allPass = allPass && r.pass;
    const tag = r.pass ? '✅' : '❌';
    process.stdout.write(`${tag} ${r.name}\n`);
    if (!r.pass) {
      process.stdout.write(`   期望: ${JSON.stringify(sc.expect)}\n`);
      process.stdout.write(`   实际: successToast=${r.successToast} navigated=${r.navigated} conflictToast=${r.conflictToast}\n`);
      process.stdout.write(`   toasts: ${JSON.stringify(r.toasts)}\n`);
    }
  }
  process.stdout.write(`\n${allPass ? '🎉 全部通过' : '❗ 有用例未通过'}\n`);
  process.exit(allPass ? 0 : 1);
})();
