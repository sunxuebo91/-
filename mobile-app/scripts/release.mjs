#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const mobileRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const repoRoot = resolve(mobileRoot, '..');
const defaultReleaseRoot = resolve(process.env.APP_RELEASE_ROOT || join(repoRoot, 'releases', 'mobile-app'));
const defaultLiveRoot = resolve(process.env.APP_RELEASE_LIVE_ROOT || mobileRoot);
const apkOutput = join(mobileRoot, 'android/app/build/outputs/apk/release/app-release.apk');
// Git 跟踪的"发布草稿"目录：prepare 只写这里，绝不直接触碰 distribution/（nginx 直接对外提供的
// 线上目录）。distribution/version.json、distribution/index.html 与 app-release.apk 一样，只由
// publish 从已校验的不可变归档写入——避免 prepare 之后、publish 成功之前的失败窗口期里，公网
// 元数据（宣称的新版本）与实际线上 APK（仍是旧版本）不一致。
const draftRoot = join(mobileRoot, 'release-draft');

function fail(message) { console.error(`发布失败：${message}`); process.exit(1); }
function info(message) { console.log(`✓ ${message}`); }
function run(command, args, cwd = repoRoot, env = {}) {
  return execFileSync(command, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}
function args() {
  const [, , command, ...raw] = process.argv;
  const options = {};
  for (let i = 0; i < raw.length; i += 1) {
    if (!raw[i].startsWith('--')) fail(`未知参数：${raw[i]}`);
    const key = raw[i].slice(2);
    if (key === 'dry-run') options.dryRun = true;
    else if (raw[i + 1]) options[key] = raw[++i];
    else fail(`参数 --${key} 缺少值`);
  }
  return { command, options };
}
function sha256(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function escapeHtml(value) {
  return value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}
function readVersion() {
  const gradle = join(mobileRoot, 'android/app/build.gradle');
  const content = readFileSync(gradle, 'utf8');
  const code = Number(content.match(/versionCode\s+(\d+)/)?.[1]);
  const name = content.match(/versionName\s+"([^"]+)"/)?.[1];
  if (!Number.isInteger(code) || !name) fail('无法读取 android/app/build.gradle 的版本信息');
  return { code, name, gradle, content };
}
function readManifest(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { fail(`无法读取版本清单：${file}`); }
}
function assertVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail('版本号必须为 x.y.z 格式');
}
function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
function assertCleanTag(version) {
  if (run('git', ['status', '--porcelain', '--', 'mobile-app'])) fail('mobile-app 发布源不干净；请先提交本次版本配置和代码');
  const tag = `app-v${version}`;
  const tags = run('git', ['tag', '--points-at', 'HEAD']).split('\n');
  if (!tags.includes(tag)) fail(`HEAD 未标记为 ${tag}；请提交后创建并推送该 Tag`);
  return { tag, commit: run('git', ['rev-parse', 'HEAD']) };
}
function buildFingerprint(version, tag, commit) {
  return createHash('sha256').update(`crm-mobile-app:${version.code}:${version.name}:${tag}:${commit}`).digest('hex').slice(0, 16);
}
function assertBundleFingerprint(directory, fingerprint, label) {
  const entries = readdirSync(directory, { recursive: true, withFileTypes: true });
  const found = entries.some(entry => entry.isFile() && readFileSync(join(entry.parentPath, entry.name), 'utf8').includes(fingerprint));
  if (!found) fail(`${label} 未嵌入构建指纹`);
}
function publicMobileUrl(publicUrl) {
  const url = new URL(publicUrl);
  url.pathname = url.pathname.replace(/\/app\/?$/, '/mobile/');
  return url.toString();
}
function getWechatOpenAppId() {
  const configured = process.env.WECHAT_OPEN_APP_ID?.trim();
  if (configured) return configured;

  const configFile = process.env.APP_WECHAT_CONFIG_FILE;
  if (!configFile || !existsSync(configFile)) {
    fail('缺少微信开放平台 AppID：请设置 WECHAT_OPEN_APP_ID 或 APP_WECHAT_CONFIG_FILE');
  }
  const match = readFileSync(configFile, 'utf8').match(/^(?:WECHAT_OPEN_APP_ID|wechatOpenAppId)\s*=\s*([^\r\n#]+)\s*$/m);
  const appId = match?.[1].trim().replace(/^['"]|['"]$/g, '');
  if (!appId) fail('受保护配置中缺少 WECHAT_OPEN_APP_ID');
  return appId;
}
function verifyInputs() {
  const version = readVersion();
  const manifest = readManifest(join(draftRoot, 'version.json'));
  if (manifest.versionCode !== version.code || manifest.versionName !== version.name) {
    fail('build.gradle 与 release-draft/version.json 的版本不一致');
  }
  return { version, manifest };
}
function updateStaticPage(version, notes) {
  const page = join(draftRoot, 'index.html');
  const list = notes.map(note => `        <li>${escapeHtml(note)}</li>`).join('\n');
  let content = readFileSync(page, 'utf8');
  content = content.replace(/版本 v\d+\.\d+\.\d+/, `版本 v${version}`);
  content = content.replace(/下载 APK 安装包（v\d+\.\d+\.\d+）/, `下载 APK 安装包（v${version}）`);
  content = content.replace(/(<span class="rel-tag" id="rel-tag">)v\d+\.\d+\.\d+(<\/span>)/, `$1v${version}$2`);
  content = content.replace(/(<ul class="changelog" id="changelog">)[\s\S]*?(<\/ul>)/, `$1\n${list}\n      $2`);
  writeFileSync(page, content);
}
function prepare(options) {
  const target = options.version;
  const notesFile = options['notes-file'];
  if (!target || !notesFile) fail('用法：prepare --version x.y.z --notes-file <文件>');
  assertVersion(target);
  if (!existsSync(notesFile)) fail(`更新说明文件不存在：${notesFile}`);
  const { code, name, gradle, content } = readVersion();
  if (compareVersions(target, name) <= 0) fail('目标版本必须高于当前版本');
  const notes = readFileSync(notesFile, 'utf8').split('\n').map(line => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  if (!notes.length) fail('更新说明不能为空');
  const nextCode = code + 1;
  writeFileSync(gradle, content.replace(/versionCode\s+\d+/, `versionCode ${nextCode}`).replace(/versionName\s+"[^"]+"/, `versionName "${target}"`));
  mkdirSync(draftRoot, { recursive: true });
  writeFileSync(join(draftRoot, 'version.json'), `${JSON.stringify({
    versionCode: nextCode,
    versionName: target,
    url: 'https://crm.andejiazheng.com/app/app-release.apk',
    notes: notes.map((note, index) => `${index + 1}. ${note}`).join('\n'),
  }, null, 2)}\n`);
  updateStaticPage(target, notes);
  info(`已准备 ${target}（versionCode ${nextCode}）；草稿写入 release-draft/，线上 distribution/ 未改动`);
  console.log(`下一步：git add mobile-app && git commit -m "release(app): v${target}" && git tag -a app-v${target} -m "App v${target}"`);
}
function copyContents(source, destination, last = []) {
  mkdirSync(destination, { recursive: true });
  const entries = readdirSync(source);
  for (const name of [...entries.filter(name => !last.includes(name)), ...last.filter(name => entries.includes(name))]) {
    cpSync(join(source, name), join(destination, name), { recursive: true, force: true });
  }
}
function archive(options) {
  const { version, manifest } = verifyInputs();
  const apk = resolve(options.apk || apkOutput);
  if (!existsSync(apk)) fail(`APK 不存在：${apk}`);
  const releaseRoot = resolve(options['release-root'] || defaultReleaseRoot);
  const target = join(releaseRoot, version.name);
  if (existsSync(target)) fail(`不可变版本包已存在：${target}`);
  const { tag, commit } = assertCleanTag(version.name);
  const fingerprint = buildFingerprint(version, tag, commit);
  assertBundleFingerprint(join(mobileRoot, 'dist'), fingerprint, '待归档 Web bundle');
  run('jarsigner', ['-verify', apk], mobileRoot);
  const staging = mkdtempSync(join(tmpdir(), `app-release-${version.name}-`));
  try {
    mkdirSync(releaseRoot, { recursive: true });
    cpSync(apk, join(staging, 'app-release.apk'));
    cpSync(join(mobileRoot, 'dist'), join(staging, 'mobile'), { recursive: true });
    cpSync(join(draftRoot, 'index.html'), join(staging, 'index.html'));
    cpSync(join(draftRoot, 'version.json'), join(staging, 'version.json'));
    writeFileSync(join(staging, 'release.json'), `${JSON.stringify({
      versionCode: version.code,
      versionName: version.name,
      gitTag: tag,
      gitCommit: commit,
      apkSha256: sha256(apk),
      apkBytes: statSync(apk).size,
      webBundleFingerprint: fingerprint,
      createdAt: new Date().toISOString(),
    }, null, 2)}\n`);
    renameSync(staging, target);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  info(`不可变版本包已归档：${target}`);
  return { releaseRoot, version: version.name, manifest };
}
function getRelease(releaseRoot, version) {
  const dir = join(releaseRoot, version);
  const record = readManifest(join(dir, 'release.json'));
  const manifest = readManifest(join(dir, 'version.json'));
  if (record.versionCode !== manifest.versionCode || record.versionName !== manifest.versionName) fail('归档元数据与版本清单不一致');
  if (sha256(join(dir, 'app-release.apk')) !== record.apkSha256) fail('归档 APK 哈希不匹配');
  if (!/^[a-f0-9]{16}$/i.test(record.webBundleFingerprint || '')) fail('归档缺少有效 Web bundle 构建指纹');
  assertBundleFingerprint(join(dir, 'mobile'), record.webBundleFingerprint, '归档 Web bundle');
  return { dir, record, manifest };
}
function snapshot(liveRoot, releaseRoot) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = join(releaseRoot, 'snapshots', stamp);
  mkdirSync(destination, { recursive: true });
  for (const [from, to] of [['dist', 'mobile'], ['distribution', 'distribution']]) {
    const source = join(liveRoot, from);
    if (existsSync(source)) cpSync(source, join(destination, to), { recursive: true });
  }
  return destination;
}
async function publish(options, rollback = false) {
  const version = options.version;
  if (!version) fail('用法：publish --version x.y.z');
  const releaseRoot = resolve(options['release-root'] || defaultReleaseRoot);
  const liveRoot = resolve(options['live-root'] || defaultLiveRoot);
  const release = getRelease(releaseRoot, version);
  const liveManifestFile = join(liveRoot, 'distribution/version.json');
  if (existsSync(liveManifestFile)) {
    const current = readManifest(liveManifestFile);
    if (release.record.versionCode <= current.versionCode) {
      fail(`目标 versionCode ${release.record.versionCode} 不高于线上 ${current.versionCode}。Android 不支持降级覆盖；请从旧 Git Tag 重建一个更高的新版本后再发布。`);
    }
  }
  if (options.dryRun) return info(`演练通过：将${rollback ? '回滚/修复' : '发布'} ${version} 到 ${liveRoot}`);
  const backup = snapshot(liveRoot, releaseRoot);
  copyContents(join(release.dir, 'mobile'), join(liveRoot, 'dist'), ['index.html']);
  const distribution = join(liveRoot, 'distribution');
  mkdirSync(distribution, { recursive: true });
  cpSync(join(release.dir, 'app-release.apk'), join(distribution, 'app-release.apk'), { force: true });
  cpSync(join(release.dir, 'index.html'), join(distribution, 'index.html'), { force: true });
  cpSync(join(release.dir, 'version.json'), join(distribution, 'version.json'), { force: true });
  if (sha256(join(distribution, 'app-release.apk')) !== release.record.apkSha256) fail('发布后 APK 校验失败');
  assertBundleFingerprint(join(liveRoot, 'dist'), release.record.webBundleFingerprint, '发布 Web bundle');
  const published = readManifest(join(distribution, 'version.json'));
  if (published.versionCode !== release.record.versionCode) fail('发布后 version.json 校验失败');
  writeFileSync(join(releaseRoot, 'current.json'), `${JSON.stringify({ ...release.record, activatedAt: new Date().toISOString(), backup }, null, 2)}\n`);
  await verify({ version, 'release-root': releaseRoot, 'live-root': liveRoot });
  info(`${version} 已发布；发布前快照：${backup}`);
}
async function verify(options) {
  const version = options.version;
  if (!version) fail('用法：verify --version x.y.z [--public-url https://.../app]');
  const releaseRoot = resolve(options['release-root'] || defaultReleaseRoot);
  const liveRoot = resolve(options['live-root'] || defaultLiveRoot);
  const release = getRelease(releaseRoot, version);
  const liveManifest = readManifest(join(liveRoot, 'distribution/version.json'));
  if (liveManifest.versionCode !== release.record.versionCode || liveManifest.versionName !== release.record.versionName) fail('本地激活版本与归档不一致');
  if (sha256(join(liveRoot, 'distribution/app-release.apk')) !== release.record.apkSha256) fail('本地激活 APK 与归档不一致');
  assertBundleFingerprint(join(liveRoot, 'dist'), release.record.webBundleFingerprint, '本地激活 Web bundle');
  if (options['public-url']) {
    const base = options['public-url'].replace(/\/$/, '');
    const manifestResponse = await fetch(`${base}/version.json`, { signal: AbortSignal.timeout(30_000) });
    if (!manifestResponse.ok) fail(`公开 version.json 请求失败：${manifestResponse.status}`);
    const publicManifest = await manifestResponse.json();
    if (publicManifest.versionCode !== release.record.versionCode || publicManifest.versionName !== release.record.versionName) fail('公开版本清单与归档不一致');
    const apkResponse = await fetch(`${base}/app-release.apk`, { signal: AbortSignal.timeout(90_000) });
    if (!apkResponse.ok) fail(`公开 APK 请求失败：${apkResponse.status}`);
    const publicHash = createHash('sha256').update(Buffer.from(await apkResponse.arrayBuffer())).digest('hex');
    if (publicHash !== release.record.apkSha256) fail('公开 APK 与归档哈希不一致');
    const mobileResponse = await fetch(options['public-mobile-url'] || publicMobileUrl(base), { signal: AbortSignal.timeout(30_000) });
    if (!mobileResponse.ok) fail(`公开 mobile 页面请求失败：${mobileResponse.status}`);
    if (!(await mobileResponse.text()).includes(release.record.webBundleFingerprint)) fail('公开 mobile 页面未嵌入归档构建指纹');
  }
  info(`${version} 发布校验通过${options['public-url'] ? '（含公开地址）' : ''}`);
}
function verifyTag(options) {
  const { version } = verifyInputs();
  const tag = options.tag || `app-v${version.name}`;
  if (tag !== `app-v${version.name}`) fail(`Tag ${tag} 与版本 ${version.name} 不匹配`);
  info(`Tag 与版本一致：${tag}`);
}
function stopGradleDaemon() {
  try {
    run('./gradlew', ['--stop'], join(mobileRoot, 'android'));
    info('Gradle daemon 已停止');
  } catch (error) {
    // 构建产物已完成时，无法停止空闲 daemon 不应掩盖真实发布结果。
    console.warn(`⚠ 无法停止 Gradle daemon：${error instanceof Error ? error.message : String(error)}`);
  }
}
function build(options) {
  const { version } = verifyInputs();
  const { tag, commit } = assertCleanTag(version.name);
  const fingerprint = buildFingerprint(version, tag, commit);
  const wechatOpenAppId = getWechatOpenAppId();
  try {
    const buildEnv = {
      WECHAT_OPEN_APP_ID: wechatOpenAppId,
      APP_BUILD_FINGERPRINT: fingerprint,
      VITE_BUILD_FINGERPRINT: fingerprint,
    };
    run('npm', ['run', 'build'], mobileRoot, buildEnv);
    run('npm', ['run', 'lint'], mobileRoot, buildEnv);
    run('npm', ['run', 'build:android:release'], mobileRoot, buildEnv);
    return archive(options);
  } finally {
    stopGradleDaemon();
  }
}
async function main() {
  const { command, options } = args();
  if (command === 'prepare') return prepare(options);
  if (command === 'verify-tag') return verifyTag(options);
  if (command === 'archive') return archive(options);
  if (command === 'build') return build(options);
  if (command === 'publish') return publish(options);
  if (command === 'verify') return verify(options);
  if (command === 'ship') {
    const { version } = verifyInputs();
    if (options.version && options.version !== version.name) fail('--version 与当前版本不一致');
    build(options);
    return await publish({ ...options, version: version.name });
  }
  if (command === 'rollback') return publish(options, true);
  fail('可用命令：prepare、verify-tag、build、archive、publish、verify、ship、rollback');
}

main().catch(error => fail(error instanceof Error ? error.message : String(error)));