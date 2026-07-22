# 移动 App 标准发布与回滚

本流程使用主仓库 Git，不拆分 App 仓库。每个 App 版本必须有一个对应的
`app-v<versionName>` Tag，例如 `app-v1.3.77`。

## 目标

- 源码可追溯：每个发布包关联唯一 Git commit 与 Tag。
- 产物可回滚：签名 APK、移动 H5、版本清单、SHA-256 作为不可变版本包归档。
- 发布可验证：发布前构建、lint、APK 签名校验；发布后校验本地和公开地址。
- 安全失败：未提交代码、无匹配 Tag、版本不一致、APK 被改动或 Android 降级均拒绝发布。

版本包默认保存在仓库外部语义的、Git 忽略的 `releases/mobile-app/`：

```
releases/mobile-app/
├── 1.3.77/
│   ├── app-release.apk
│   ├── mobile/             # 移动 H5 dist
│   ├── index.html          # App 下载页
│   ├── version.json
│   └── release.json        # Tag、commit、SHA-256、构建时间
├── snapshots/              # 每次激活前自动快照线上静态文件
└── current.json            # 当前激活版本记录
```

`releases/` 不进 Git；Git 负责源码、版本配置与 Tag，归档负责可直接部署的二进制产物。

`mobile-app/distribution/` 是 Nginx 直接对外提供的线上分发目录，其中
`app-release.apk`、`version.json`、`index.html` 三者都是**发布产物**、都被 Git 忽略、
都不能用 `git add -f` 提交。它们只应由 `release:publish` / `release:ship` 从已校验的
不可变归档写入线上目录；GitHub Release 和 CI Artifact 保存远程副本。

版本配置的 Git 源头改在 `mobile-app/release-draft/`（`version.json`、`index.html`
草稿，随源码一起提交）。`release:prepare` 只更新 `android/app/build.gradle` 和
`release-draft/`，绝不直接改动线上的 `distribution/`；`release:archive` 把
`release-draft/` 的内容连同签名 APK 一起封入不可变归档；`release:publish` 才把归档
内容原子地写入 `distribution/`。这样即使 `prepare` 之后、`publish` 成功之前的步骤
失败，线上公开的 `version.json` 也不会被提前改写成一个 APK 还未就位的新版本。

## 常规发版

### 1. 准备版本配置

创建更新说明文件（每行一条），然后执行：

```bash
cd mobile-app
npm run release:prepare -- --version 1.3.77 --notes-file /path/to/release-notes.txt
```

该命令会自动：

- 将 `versionCode` 加一；
- 更新 `android/app/build.gradle` 的 `versionName`；
- 更新 `release-draft/version.json`（草稿，不是线上文件）；
- 更新 `release-draft/index.html` 的静态版本和更新说明（草稿，不是线上文件）。

此步骤**不会**改动 `distribution/` 下任何文件；线上分发页和更新清单在此阶段保持不变。

### 2. 提交并打 App Tag

审核变更、完成测试后执行：

```bash
git add mobile-app
git commit -m "release(app): v1.3.77"
git tag -a app-v1.3.77 -m "App v1.3.77"
git push origin main --follow-tags
```

Tag 必须和 `versionName` 完全匹配。脚本拒绝脏工作区或错误 Tag。

### 3. 一键构建、归档、发布

在拥有 Android SDK、JDK 21 和受保护签名材料的发布机执行：

```bash
cd mobile-app
npm run release:ship
```

它会顺序执行：构建 H5 → lint → 签名 APK → 签名校验 → 创建不可变归档
→ 快照当前线上静态文件 → 发布 H5/APK/下载页 → 发布后本地校验。

Nginx 已将 `/mobile/` 映射至 `mobile-app/dist/`，`/app/` 映射至
`mobile-app/distribution/`，静态发布不需要重启 Nginx。`version.json` 最后写入，避免
客户端先看到新版本而 APK 尚未就位。

### 4. 公网校验

```bash
npm run release:verify -- --version 1.3.77 --public-url https://crm.andejiazheng.com/app
```

这会核对公开 `version.json` 和 APK SHA-256 是否与不可变归档一致。

## 代码同步与当前 APK 保留

生产目录只能在 Git 工作区干净、PR 已合并且已完成备份时同步 `main`。由于 APK 不再由
Git 跟踪，同步前必须确认当前 APK 已存在于 `releases/mobile-app/<version>/` 或 GitHub
Release；同步后使用 `release:publish` 恢复/激活该已验证归档，并运行 `release:verify`。

不要在生产目录使用 `git stash` 来绕过未提交改动，也不要直接 `git reset --hard`。部署脚本
会在检测到工作区不干净或无法 fast-forward 到 `origin/main` 时停止，以防覆盖线上文件。

## CI 出包

推送 `app-v1.3.77` 会触发 **Android Release APK** 工作流。工作流会：

1. 校验 Tag 与 `build.gradle`、`version.json` 一致；
2. 从 GitHub Secrets 临时注入签名材料并签名；
3. 上传 APK 与包含 H5/清单/哈希的不可变发布包 Artifact；
4. 创建对应 GitHub Release。

手动触发工作流时也必须填写一个已经存在的 `app-v*` Tag。签名密钥和口令始终只存
在发布机或 GitHub Secrets，绝不能提交到 Git。

## 回滚规则（Android 的关键限制）

Android 不能把已安装的高 `versionCode` 覆盖降级为低 `versionCode`。因此 **不能直接把
1.3.77 的 APK 换回 1.3.76**；脚本会拒绝这种操作，防止员工无法更新或出现版本混乱。

正确回滚是以旧 Tag 的源码重新发布为一个更高版本：

1. 从稳定 Tag 建立修复分支，例如 `app-v1.3.76`；
2. 运行 `release:prepare` 生成新版本，例如 `1.3.78`（其 `versionCode` 必须高于线上）；
3. 提交、创建 `app-v1.3.78` Tag；
4. 运行 `npm run release:ship`。

这样功能回到稳定版本，而所有 1.3.77 用户都能收到合法的覆盖更新。每次发布前的静态
快照保留在 `releases/mobile-app/snapshots/`，用于紧急排查与恢复下载页/H5 文件。

## 可选路径

发布机目录不同可显式设置：

```bash
APP_RELEASE_ROOT=/srv/crm-releases/mobile-app \
APP_RELEASE_LIVE_ROOT=/home/ubuntu/andejiazhengcrm/mobile-app \
npm run release:ship
```

后端接口如有同版本变更，仍须按后端标准部署流程一起发布；App Tag 记录了与该 APK
匹配的源码基线，便于联动回滚。