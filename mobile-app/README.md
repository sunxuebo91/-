# 安得家政 CRM Android App

这是安得家政内部员工使用的 CRM Android 客户端，基于 React、Vite、antd-mobile 和 Capacitor Android 构建。

## 移动端 H5 网页入口

移动端 App 也提供无需安装、可直接在浏览器打开的 H5 版本：

- **移动端 H5 登录：** https://crm.andejiazheng.com/mobile/#/login
- 移动端 H5 首页：https://crm.andejiazheng.com/mobile/
- APK 下载页：https://crm.andejiazheng.com/app/

注意：移动端使用 `HashRouter`，登录地址中的 `#/login` 不能省略。不要将移动端 H5 登录地址与 CRM 网页版登录 `https://crm.andejiazheng.com/login` 混淆。

## 首先阅读

- **[产品与代码地图](PRODUCT.md)**：产品范围、页面定位、API/原生代码入口和发版流程。
- [开发规范](DEVELOPMENT_STANDARDS.md)
- [UI 规范](UI_GUIDELINES.md)
- [Android 构建与分发](BUILD_ANDROID.md)
- [测试与分发清单](TEST_AND_DISTRIBUTION.md)

## 常用命令

```bash
npm run dev                   # 本地 Web 开发
npm run build                 # 类型检查与生产 Web 构建
npm run lint                  # 静态检查
npm run build:android         # 构建并同步到 Android 工程
npm run build:android:release # 构建签名 Release APK
```

## 核心入口

- 路由与权限：`src/router/navConfig.tsx`
- App 启动与更新检查：`src/App.tsx`
- 保险模块：`src/pages/Insurance.tsx`
- API 服务：`src/services/`
- Android 原生工程：`android/`
- 下载页与更新清单：`distribution/`

用户提到“App、安卓、APK、移动端”时，应优先在本目录处理，不要误改根目录的 `frontend/` 或 `miniprogram-pages/`。
