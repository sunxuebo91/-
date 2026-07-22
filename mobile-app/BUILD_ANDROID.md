# 安卓 APK 构建与分发指南（BUILD_ANDROID.md）

> 适用工程：`mobile-app/`（Capacitor 8 + React 19 + Vite）。
> 本文档为交钥匙说明：在一台**有 Android SDK 且能联网**的机器上，按下述步骤即可产出已签名的 release APK。
>
> **正式发布请优先遵循 [RELEASE_RUNBOOK.md](RELEASE_RUNBOOK.md)**：它在本说明的底层出包命令之上，
> 增加 Git Tag、不可变版本包、发布前快照、线上哈希校验与 Android 安全回滚规则。

---

## 0. 当前环境结论（构建尝试留证）

在开发容器内执行 `cd android && ./gradlew assembleRelease` **失败**，原因为**外部环境阻塞（非代码问题）**：

- 无 Android SDK：`sdkmanager`、`adb` 均不存在；`ANDROID_HOME` / `ANDROID_SDK_ROOT` 为空；无 `android/local.properties`。
- 无外网：Gradle wrapper 需下载 `gradle-8.14.3-all.zip`（来自 `services.gradle.org`），只拿到不完整的分片：
  - `~/.gradle/wrapper/dists/gradle-8.14.3-all/.../gradle-8.14.3-all.zip.part`（约 48 MB，完整约 200 MB）
  - 关键报错：
    ```
    Exception in thread "main" java.lang.RuntimeException: Timeout of 120000 reached
    waiting for exclusive access to file: .../gradle-8.14.3-all/.../gradle-8.14.3-all.zip
        at org.gradle.wrapper.GradleWrapperMain.main(SourceFile:71)
    ```

同一环境下，Web 侧构建链路全部通过：
- `npm run build:android`（tsc + vite 打包 + `cap sync android`）✅
- `npx oxlint` → **0 warnings / 0 errors** ✅

因此，缺失的仅是「Android SDK + Gradle 发行版」这类外部依赖。补齐后即可直接出包。

---

## 1. 环境前置

### 1.1 JDK 21（Capacitor 8 要求）
> Capacitor 8 的 Android gradle 配置为 `sourceCompatibility/targetCompatibility = JavaVersion.VERSION_21`，
> 必须使用 **JDK 21**；用 JDK 17 会报 `Cannot find a Java installation matching {languageVersion=21}` 导致 `assembleRelease` 失败。
```bash
java -version        # 需为 21.x（JDK 21）
keytool -help        # 用于签名密钥
```

### 1.2 安装 Android SDK（cmdline-tools + platform + build-tools + platform-tools）
以 Linux 为例（macOS 类似，替换下载包名）：

```bash
# 1) 选定 SDK 根目录
export ANDROID_HOME="$HOME/Android/Sdk"
mkdir -p "$ANDROID_HOME/cmdline-tools"

# 2) 下载 commandline-tools 并解压到 cmdline-tools/latest
#    （从 https://developer.android.com/studio#command-line-tools-only 获取最新链接）
#    解压后目录结构须为：$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager
mv cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"

# 3) 配置 PATH（建议写入 ~/.bashrc）
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"

# 4) 安装本工程所需组件（本工程 compileSdk=36 / targetSdk=36 / minSdk=24）
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"

# 5) 校验
sdkmanager --list_installed
adb version
```

### 1.3 让 Gradle 找到 SDK
二选一：
- 设置环境变量 `ANDROID_HOME`（推荐，如上）；或
- 在 `mobile-app/android/local.properties` 写入（该文件已被 .gitignore 忽略）：
  ```properties
  sdk.dir=/home/<user>/Android/Sdk
  ```

### 1.4 Gradle 发行版
首次 `./gradlew` 会自动下载 `gradle-8.14.3-all.zip`（约 200 MB，需联网）。若离线，请预先把该 zip 放入
`~/.gradle/wrapper/dists/gradle-8.14.3-all/<hash>/` 并解压，或改用本机已安装的同版本 Gradle。

---

## 2. 签名密钥（keystore）

Release APK 必须使用已受保护的同一签名密钥；升级包使用不同密钥将无法覆盖安装旧版本。

### 凭据管理要求

- 密钥库文件和口令属于敏感凭据，**不得**提交到仓库、写入 Markdown、终端参数、工单或聊天记录。
- 将密钥库保存在受限权限的凭据管理系统或受保护的构建机目录；确保至少有一份加密离线备份。
- `android/keystore.properties` 仅允许存在于本机构建环境，且应由 `.gitignore` 排除。
- 换机构建时，由有权限的管理员通过安全渠道提供密钥库和本机凭据文件；不要复制到普通文档或源码目录。

### 本机配置

`android/app/build.gradle` 会从本机的 `android/keystore.properties` 读取签名配置。该文件应包含密钥库路径、别名和口令字段，但文档不记录真实值。

### 备份与轮换

- 密钥库丢失会导致无法继续为同一 Android 包名发布覆盖安装的升级包。
- 如怀疑凭据已经暴露，应立即轮换凭据、限制旧文件访问范围，并由发布负责人评估是否需要更换签名策略。

---

## 3. 出包命令序列

```bash
cd mobile-app

# 1) 构建 Web 产物并同步到 android（tsc + vite + cap sync）
npm run build:android

# 2) 生成已签名 release APK
cd android
./gradlew assembleRelease
```

### 一键出包（推荐）
以上两步已封装为一条脚本：
```bash
cd mobile-app
npm run build:android:release
```
> 等价于 `npm run build:android && cd android && ./gradlew assembleRelease`，产物同为下方 release APK 路径。

产物位置：
```
mobile-app/android/app/build/outputs/apk/release/app-release.apk
```

（如需 AAB 上架 Google Play：`./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`。）

---

## 4. 签名校验

```bash
cd mobile-app/android/app/build/outputs/apk/release

# 方式一：jarsigner（JDK 自带）
jarsigner -verify -verbose -certs app-release.apk

# 方式二：apksigner（Android SDK build-tools 自带，更权威）
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs app-release.apk
```
校验应确认 APK 可通过签名验证；证书指纹仅在受保护的发布凭据记录中核对。

---

## 5. 应用内版本检查与更新（version.json）

App 端已内置轻量「版本检查 + 更新提示」（零后端改动）：
- 实现：[updateService.tsx](file:///home/ubuntu/andejiazhengcrm/mobile-app/src/services/updateService.tsx)
- 启动静默检查：[App.tsx](file:///home/ubuntu/andejiazhengcrm/mobile-app/src/App.tsx)（登录态就绪后触发一次，未配置/失败均不打扰）
- 手动检查入口：[My.tsx](file:///home/ubuntu/andejiazhengcrm/mobile-app/src/pages/My.tsx)（「我的 → 关于 → 检查更新」，并展示当前版本号）

### 开关配置
在 `mobile-app/.env.production` 设置清单 URL（留空 = 关闭检查）：
```
VITE_UPDATE_MANIFEST_URL=https://crm.andejiazheng.com/app/version.json
```
> 该 URL 指向一个**静态 JSON 文件**（可放在任意 CDN / 静态托管 / Nginx 静态目录，无需新增后端接口）。

### version.json 格式
```json
{
  "versionCode": 2,
  "versionName": "1.0.1",
  "url": "https://crm.andejiazheng.com/app/app-release.apk",
  "notes": "本次更新内容说明……"
}
```
- `versionCode`：整数，与 `android/app/build.gradle` 中 `versionCode` 对齐。**当 `version.json.versionCode > 当前 App versionCode` 时提示更新。**每次发版必须**单调递增**（否则旧版无法感知新版）。
- `versionName`：字符串，**仅用于展示**（提示弹窗与「我的」页版本号），不参与比较。
- `url`：新版 APK 的**下载直链**；用户点「去下载」后由系统浏览器打开。
- `notes`：可选，更新说明文本，展示于更新提示弹窗。

### 清单模板：`version.json.example`
仓库已附带可直接参照的模板 [version.json.example](file:///home/ubuntu/andejiazhengcrm/mobile-app/version.json.example)（字段与 `UpdateManifest` 完全一致，示例为“下一个版本” versionCode=2 / 1.0.1）：
```json
{
  "versionCode": 2,
  "versionName": "1.0.1",
  "url": "https://crm.andejiazheng.com/app/app-release.apk",
  "notes": "示例:修复若干问题、优化体验。请替换为真实更新说明。"
}
```
> ⚠️ `version.json` 是**独立托管的静态文件，不随 App 打包**。因此以 `.example` 模板形式入库，
> 真实的 `version.json` 需手工部署到服务器 / CDN（即 `VITE_UPDATE_MANIFEST_URL` 指向的地址），切勿提交真实文件。

### 发新版完整流程
1. **提升版本号**：编辑 `android/app/build.gradle`，将 `versionCode` +1（如 1 → 2）、`versionName` 同步抬升（如 `1.0.0` → `1.0.1`）。
2. **重新构建签名 APK**（二选一）：
   - 本机出包：按 §3 执行（`npm run build:android` → `./gradlew assembleRelease`）；
   - CI 出包：按 §7 手动触发或推 `v*` tag，从 Actions 产物 / Release 下载 `app-release.apk`。
3. **上传 APK**：将新 `app-release.apk` 上传到分发位置（服务器 / CDN 静态目录），得到下载直链。
4. **更新托管的 `version.json`**：照 `version.json.example` 填入真实值（`versionCode`/`versionName`/`url`/`notes`），覆盖发布到 `VITE_UPDATE_MANIFEST_URL` 指向的地址。
5. **生效**：旧版本 App 启动（登录态就绪后静默检查）或在「我的 → 关于 → 检查更新」手动检查时，即收到「发现新版本」提示。

### 内部分发落地页（distribution/index.html）
仓库附带一个**纯静态、单文件、零外部依赖**的内部安装落地页 [distribution/index.html](file:///home/ubuntu/andejiazhengcrm/mobile-app/distribution/index.html)，
供员工扫码/打开链接后一键下载 APK 并按引导安装（含「允许安装未知应用」步骤、系统要求、登录说明）。

**托管方式**：把以下三个文件放到**同一个内部服务器 / CDN 目录**（示例目录 `https://crm.andejiazheng.com/app/`）：

| 文件 | 部署为 | 说明 |
| --- | --- | --- |
| `distribution/index.html` | `/app/`（即目录首页 index.html） | 分发/安装落地页 |
| `app-release.apk` | `/app/app-release.apk` | 已签名 APK（落地页按相对路径 `app-release.apk` 引用） |
| `version.json` | `/app/version.json` | 更新清单，照 [version.json.example](file:///home/ubuntu/andejiazhengcrm/mobile-app/version.json.example) 填真实值 |

然后把 `mobile-app/.env.production` 的 `VITE_UPDATE_MANIFEST_URL` 设为 `https://crm.andejiazheng.com/app/version.json`，**重新出包**（§3 或 §7），使 App 内更新检查指向该清单。

> ⚠️ 这三者都是**独立托管的静态文件，不随 App 打包，也不属于现有 CRM 前后端**（不经 backend/frontend/deploy.sh/nginx）。落地页对 APK 用相对路径引用，因此三文件同目录即可开箱即用。

---

## 6. 常见问题
- **`SDK location not found`**：未设置 `ANDROID_HOME` 或缺 `local.properties`，见 §1.3。
- **`Failed to install ... platform 36`**：未装 `platforms;android-36` / `build-tools;36.0.0`，见 §1.2。
- **release 未签名**：确认 `android/keystore.properties` 与 `andejiazheng-crm-release.jks` 均已就位。
- **wrapper 下载超时**：离线环境请预置 Gradle 发行版，见 §1.4。

---

## 7. CI 出包（GitHub Actions 自动产出签名 APK）

本仓库托管于 GitHub，已提供流水线 `.github/workflows/android-release.yml`，可在云端自动完成
「装环境 → 构建 Web → cap sync → assembleRelease → 上传签名 APK」，无需本机准备 Android 环境。

> 如仓库迁移到其它平台（GitLab CI / Jenkins / Gitee Go / Bitbucket Pipelines），
> 请按该 workflow 内注释的等价步骤迁移，核心逻辑一致。

### 7.1 需配置的 CI Secret（仓库 Settings → Secrets and variables → Actions）

签名密钥与口令**只放 CI Secret，切勿提交仓库**。共需 4 个 Secret：

| Secret 名称 | 含义 | 取值 |
| --- | --- | --- |
| `ANDROID_KEYSTORE_BASE64` | keystore(.jks) 的 base64 编码 | 见 7.2 生成 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 的 storePassword | 本项目为 `andejiazheng2026` |
| `ANDROID_KEY_ALIAS` | 密钥别名 | `andejiazheng-crm` |
| `ANDROID_KEY_PASSWORD` | 密钥 keyPassword | 本项目为 `andejiazheng2026` |

### 7.2 生成 keystore base64

在**本机** `mobile-app/android/` 目录下执行（`-w0` 确保不换行，便于粘贴到 Secret）：
```bash
cd mobile-app/android
base64 -w0 andejiazheng-crm-release.jks > keystore.base64.txt
```
打开 `keystore.base64.txt`，复制其全部内容作为 `ANDROID_KEYSTORE_BASE64` 的值。
> ⚠️ `keystore.base64.txt` 与 `.jks`、口令都**不要提交仓库**，用完即删。

CI 运行时会把该 base64 解码回 `ci-release.jks` 并自动生成 `android/keystore.properties`
（`storeFile=ci-release.jks`），口令由 GitHub 自动 mask，不会在日志明文出现；构建结束后临时密钥文件即被删除。

### 7.3 如何触发

- **手动触发**：仓库 → Actions → 选择「Android Release APK」→ Run workflow。
- **打 tag 触发**：推送形如 `app-v1.0.0` 的 tag（`git tag app-v1.0.0 && git push origin app-v1.0.0`），
  除产出 artifact 外还会自动创建 GitHub Release 并附上 APK。

### 7.4 产物在哪下载

- **Artifact**：进入对应的 workflow run 页面，底部 Artifacts 区域下载 `app-release-apk`（保留 30 天）。
- **Release 附件**（仅 tag 触发）：仓库 Releases 页面对应版本下直接下载 `app-release.apk`。

> 产物路径固定为 `android/app/build/outputs/apk/release/app-release.apk`，与本机出包一致。

### 7.5 Node 版本说明

workflow 默认使用 Node 24（与目标运行时一致）。若某 runner 暂不支持 Node 24，
可将 workflow 中 `node-version: '24'` 改为 `'22'` 或 `'20'`（LTS）后重跑。
