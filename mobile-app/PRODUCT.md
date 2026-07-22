# 安得家政 CRM Android App · 产品与代码地图

## 1. 产品定位

`mobile-app/` 是安得家政 CRM 的员工 Android 客户端，不是 Web CRM，也不是微信小程序。

- 应用名称：安得家政 CRM
- Android 包名：`com.andejiazheng.crm`
- 用户：内部员工及具备 CRM 权限的业务人员
- 线上下载页：<https://crm.andejiazheng.com/app/>
- 服务端：复用本仓库 `backend/` 的 CRM API

## 2. 技术与运行形态

| 项目 | 说明 |
| --- | --- |
| Web UI | React 19 + TypeScript + Vite + antd-mobile |
| 原生容器 | Capacitor 8 Android |
| 路由 | React Router HashRouter，模块按需加载 |
| 状态与请求 | Zustand、TanStack Query、Axios |
| 构建目录 | `dist/`，随后同步至 `android/` |
| 签名 APK | `android/app/build/outputs/apk/release/app-release.apk` |

## 3. 业务范围

高频底部入口为：首页、客户、合同、工作台、我的。工作台承载审批、简历、接单大厅、保险、背调、培训、电子签、支付/收款等权限模块。

保险是当前重点移动端能力，包含：

- 保单列表与详情；
- 新建投保、阿姨库快速填充；
- 微信 Native 二维码支付与支付状态同步；
- 未生效保单注销、已生效保单申请退保；
- 换人、批增，以及从阿姨库搜索后自动填充被保险人资料。

## 4. 代码定位表

| 需求 | 文件或目录 |
| --- | --- |
| 启动、鉴权恢复、全局更新检查 | `src/App.tsx` |
| 路由、模块、权限入口 | `src/router/navConfig.tsx` |
| 登录 | `src/pages/Login.tsx`、`src/stores/auth.ts` |
| 保险业务 | `src/pages/Insurance.tsx`、`src/services/modules.ts` |
| 合同/阿姨库查询 | `src/services/contractService.ts` |
| App 更新面板 | `src/services/updateService.tsx` |
| 原生桥接插件 | `src/plugins/`、`android/app/src/main/` |
| Android 应用版本 | `android/app/build.gradle` |
| 下载页及更新清单草稿（Git 源头） | `release-draft/index.html`、`release-draft/version.json` |
| 下载页及更新清单线上产物（仅 publish 写入，Git 忽略） | `distribution/index.html`、`distribution/version.json` |

## 5. 开发操作

在本目录执行：

| 目的 | 命令 |
| --- | --- |
| 本地 Web 开发 | `npm run dev` |
| 类型检查与生产 Web 构建 | `npm run build` |
| lint | `npm run lint` |
| 同步 Web 资源到 Android | `npm run build:android` |
| 构建已签名 Release APK | `npm run build:android:release` |
| 打开 Android Studio | `npm run open:android` |

构建或修改 Capacitor 资源后，应使用 `npm run build:android` 或完整 Release 命令，不要手工复制 `dist/` 到 Android assets。

## 6. 发版流程

1. 修改功能并运行 `npm run build`、`npm run lint`。
2. 在 `android/app/build.gradle` 递增版本号。
3. 执行 `npm run build:android:release`，校验 APK 签名和版本元数据。
4. 仅在用户明确批准发布后，更新 `distribution/app-release.apk`、`distribution/version.json` 与 `distribution/index.html`。
5. 从 `https://crm.andejiazheng.com/app/` 重新下载并校验版本、哈希与签名。

详细步骤见 [BUILD_ANDROID.md](BUILD_ANDROID.md) 和 [TEST_AND_DISTRIBUTION.md](TEST_AND_DISTRIBUTION.md)。

## 7. AI 协作约定

- 用户说“App、安卓、APK、移动端”时，首先阅读本文件和 `src/router/navConfig.tsx`。
- 用户说“保险”时，首先检查 `src/pages/Insurance.tsx`、`src/services/modules.ts` 及后端保险模块。
- 不把 App 需求误改到 `frontend/` 或 `miniprogram-pages/`。
- 不读取或输出签名材料、凭据、令牌和环境变量中的真实值。