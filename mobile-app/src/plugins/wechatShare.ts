import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

// release.mjs 为 Web 与原生构建注入同一非敏感指纹，用于发布完整性校验。
const BUILD_FINGERPRINT = (import.meta.env.VITE_BUILD_FINGERPRINT as string | undefined)?.trim() || 'untracked';

interface WechatSharePlugin {
  isAvailable(): Promise<{ configured: boolean; installed: boolean }>;
  requestLogin(): Promise<{ requested: boolean }>;
  shareMiniProgram(options: {
    title: string;
    description: string;
    path: string;
    webpageUrl: string;
    buildFingerprint: string;
  }): Promise<{ requested: boolean }>;
  launchMiniProgram(options: {
    userName: string;
    path: string;
  }): Promise<{ requested: boolean }>;
  addListener(
    eventName: 'miniProgramPaymentResult' | 'wechatLoginResult',
    listenerFunc: (result: { data?: string; code?: string; errorCode?: number; errorMessage?: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const WechatShare = registerPlugin<WechatSharePlugin>('WechatShare');

export async function shareMiniProgramCard(options: {
  title: string;
  description: string;
  path: string;
  webpageUrl: string;
}): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('WechatShare')) {
    return false;
  }
  const availability = await WechatShare.isAvailable();
  if (!availability.configured) throw new Error('微信分享未配置，请联系管理员');
  if (!availability.installed) throw new Error('未检测到微信，请安装微信后重试');
  const result = await WechatShare.shareMiniProgram({ ...options, buildFingerprint: BUILD_FINGERPRINT });
  return result.requested === true;
}

export async function requestWechatLoginAuthorization(): Promise<string> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('WechatShare')) {
    throw new Error('请在安得家政 CRM App 中使用微信登录');
  }
  const availability = await WechatShare.isAvailable();
  if (!availability.configured) throw new Error('微信登录未配置，请联系管理员');
  if (!availability.installed) throw new Error('未检测到微信，请安装微信后重试');

  return new Promise<string>((resolve, reject) => {
    let listener: PluginListenerHandle | undefined;
    const timeout = window.setTimeout(() => {
      void listener?.remove();
      reject(new Error('微信授权超时，请重试'));
    }, 90_000);
    void (async () => {
      try {
        listener = await WechatShare.addListener('wechatLoginResult', (result) => {
          window.clearTimeout(timeout);
          void listener?.remove();
          if (result.errorCode !== 0) {
            reject(new Error(result.errorMessage || '已取消微信授权'));
            return;
          }
          if (!result.code) {
            reject(new Error('未获取到微信授权凭证，请重试'));
            return;
          }
          resolve(result.code);
        });
        const requested = await WechatShare.requestLogin();
        if (requested.requested) return;
        window.clearTimeout(timeout);
        await listener.remove();
        reject(new Error('微信未接受登录请求，请稍后重试'));
      } catch (error) {
        window.clearTimeout(timeout);
        await listener?.remove();
        reject(error);
      }
    })();
  });
}

const POLICY_PAY_MINIPROGRAM_ORIGINAL_ID = 'gh_d747ae3140b1';
const POLICY_PAY_PAGE = 'pages/policy-pay/index';

export async function launchPolicyPaymentMiniProgram(policyRef: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('WechatShare')) return false;
  const availability = await WechatShare.isAvailable();
  if (!availability.configured) throw new Error('微信支付跳转未配置，请联系管理员');
  if (!availability.installed) throw new Error('未检测到微信，请安装微信后重试');
  const result = await WechatShare.launchMiniProgram({
    userName: POLICY_PAY_MINIPROGRAM_ORIGINAL_ID,
    path: `${POLICY_PAY_PAGE}?policyRef=${encodeURIComponent(policyRef)}`,
  });
  return result.requested === true;
}

export async function onPolicyPaymentMiniProgramResult(
  listener: (result: { data?: string; errorCode?: number }) => void,
): Promise<PluginListenerHandle | null> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('WechatShare')) return null;
  return WechatShare.addListener('miniProgramPaymentResult', listener);
}