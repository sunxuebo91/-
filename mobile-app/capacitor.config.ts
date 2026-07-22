import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.andejiazheng.crm',
  appName: '安得家政CRM',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      // 原生层必须自动关闭启动页；即使 WebView 的登录态恢复或网络初始化异常，
      // 用户也不会永久停留在启动图。正常情况下 App.tsx 仍会更早主动关闭它。
      launchShowDuration: 1000,
      launchAutoHide: true,
      backgroundColor: '#123C36',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#123C36',
      overlaysWebView: false,
    },
  },
};

export default config;
