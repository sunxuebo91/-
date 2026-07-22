import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Dialog } from 'antd-mobile';
import { useState } from 'react';
import { AppUpdater } from '../plugins/appUpdater';

// oxlint-disable react(only-export-components) -- 此文件通过 Dialog.show 呈现内部更新卡片。

/**
 * 应用内版本检查与更新提示（Task 8，零后端改动）。
 *
 * 机制：客户端读取一个「静态版本清单」URL（由 VITE_UPDATE_MANIFEST_URL 配置），
 * 与当前 App 的 versionCode 比较，有新版本时用 Dialog 提示并在 App 内下载 APK，
 * 下载完成后交给 Android 系统安装器覆盖更新。
 *
 * 清单格式（示例）：
 * {
 *   "versionCode": 2,
 *   "versionName": "1.0.1",
 *   "url": "https://.../app-release.apk",
 *   "notes": "本次更新内容……"
 * }
 *
 * 未配置 URL 或请求失败时静默不打扰（自动检查场景），不阻塞启动。
 */

// 正式环境的更新清单必须有兜底地址：独立 worktree / CI 缺少 .env.production 时，
// 仍可继续读取公开分发清单，避免打出无法检查更新的 APK。
const DEFAULT_MANIFEST_URL = 'https://crm.andejiazheng.com/app/version.json';
const MANIFEST_URL = (import.meta.env.VITE_UPDATE_MANIFEST_URL as string | undefined)?.trim() || DEFAULT_MANIFEST_URL;

export interface UpdateManifest {
  versionCode: number;
  versionName: string;
  url: string;
  notes?: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  manifest?: UpdateManifest;
  currentVersionCode: number;
  currentVersionName: string;
}

/** 手动检查时的诊断信息（用于给用户可见的明确提示） */
export interface UpdateCheckDiag {
  ok: boolean;
  result?: UpdateCheckResult;
  reason?: string;
}

/** 拉取版本清单（带 8s 超时；失败抛错，由上层静默处理） */
async function fetchManifest(url: string): Promise<UpdateManifest> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // 加时间戳避免 CDN/浏览器缓存旧清单
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}_t=${Date.now()}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`manifest http ${res.status}`);
    const json = (await res.json()) as UpdateManifest;
    if (typeof json?.versionCode !== 'number' || !json?.url) {
      throw new Error('manifest invalid');
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** 读取当前 App 版本信息（仅原生可用；web/失败返回 null） */
async function getCurrentVersion(): Promise<{ code: number; name: string } | null> {
  try {
    const info = await App.getInfo();
    return { code: Number(info.build) || 0, name: info.version || '' };
  } catch {
    // Web 环境或插件不可用
    return null;
  }
}

/**
 * 检查是否有新版本。未配置 URL / 非原生 / 请求失败时返回 null（静默）。
 */
export async function checkForUpdate(): Promise<UpdateCheckResult | null> {
  const diag = await checkForUpdateDiag();
  return diag.result ?? null;
}

/**
 * 带诊断信息的检查：返回失败的具体原因，供手动模式给用户明确提示。
 */
export async function checkForUpdateDiag(): Promise<UpdateCheckDiag> {
  if (!MANIFEST_URL) {
    return { ok: false, reason: '未配置更新地址（此包不支持检查更新，请手动到下载页更新一次）' };
  }
  const current = await getCurrentVersion();
  if (!current) {
    return { ok: false, reason: '无法读取当前版本（可能非 App 环境）' };
  }
  try {
    const manifest = await fetchManifest(MANIFEST_URL);
    return {
      ok: true,
      result: {
        hasUpdate: manifest.versionCode > current.code,
        manifest,
        currentVersionCode: current.code,
        currentVersionName: current.name,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `获取更新信息失败：${msg}` };
  }
}

/** 将 ArrayBuffer 转为 Filesystem.writeFile 所需的纯 base64，避免展开过大的参数列表。 */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function UpdateNotice({ title, description, onClose }: { title: string; description: string; onClose: () => void }) {
  return <div style={{ textAlign: 'center', padding: '8px 2px 2px' }}>
    <div style={{ width: 48, height: 48, margin: '0 auto 14px', borderRadius: 16, display: 'grid', placeItems: 'center', background: '#e8f6f3', color: '#158f82', fontSize: 23 }}>✓</div>
    <div style={{ color: '#20303b', fontSize: 19, fontWeight: 700 }}>{title}</div>
    <div style={{ margin: '10px 4px 20px', color: '#687384', fontSize: 14, lineHeight: 1.65 }}>{description}</div>
    <button type="button" onClick={onClose} style={{ width: '100%', height: 44, border: 'none', borderRadius: 12, background: '#158f82', color: '#fff', fontSize: 15, fontWeight: 600 }}>知道了</button>
  </div>;
}

function UpdatePanel({ manifest, currentVersionName, onClose, onInstall }: { manifest: UpdateManifest; currentVersionName: string; onClose: () => void; onInstall: (onProgress: (value: number | null) => void) => Promise<void> }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');
  const downloading = isDownloading || installing;
  const startInstall = async () => {
    if (downloading) return;
    setError('');
    setIsDownloading(true);
    try {
      await onInstall(setProgress);
      setIsDownloading(false);
      setInstalling(true);
    } catch (e) {
      setProgress(null);
      setIsDownloading(false);
      setInstalling(false);
      setError(e instanceof Error ? e.message : '下载更新失败，请稍后重试');
    }
  };
  const notes = (manifest.notes || '优化产品体验与稳定性。').split('\n').filter(Boolean);
  const progressText = installing ? '正在打开系统安装页面…' : progress === null ? '正在下载更新包…' : progress > 0 ? `正在下载更新包 ${progress}%` : '正在准备下载…';

  return <div style={{ overflow: 'hidden', borderRadius: 18, margin: '-12px -14px' }}>
    <div style={{ padding: '24px 22px 22px', background: 'linear-gradient(135deg, #0d766b 0%, #27aea0 100%)', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,.18)', display: 'grid', placeItems: 'center', fontSize: 23 }}>⇧</div>
        <div><div style={{ fontSize: 19, fontWeight: 700 }}>发现新版本</div><div style={{ marginTop: 4, fontSize: 12, opacity: .82 }}>安得家政 CRM · 更稳定的工作体验</div></div>
      </div>
    </div>
    <div style={{ padding: '20px 22px 22px', background: '#fff' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        <div style={{ padding: '10px 12px', borderRadius: 10, background: '#f6f8f9' }}><div style={{ color: '#8a94a3', fontSize: 11 }}>当前版本</div><div style={{ color: '#52606d', fontSize: 15, fontWeight: 600, marginTop: 4 }}>v{currentVersionName}</div></div>
        <div style={{ padding: '10px 12px', borderRadius: 10, background: '#eaf7f4' }}><div style={{ color: '#267167', fontSize: 11 }}>最新版本</div><div style={{ color: '#158f82', fontSize: 15, fontWeight: 700, marginTop: 4 }}>v{manifest.versionName}</div></div>
      </div>
      <div style={{ color: '#243040', fontSize: 14, fontWeight: 700, marginBottom: 9 }}>本次更新</div>
      <div style={{ padding: '11px 12px', borderRadius: 10, background: '#f7f9fa', color: '#687384', fontSize: 13, lineHeight: 1.7 }}>{notes.map((note, index) => <div key={index}>{note}</div>)}</div>
      {downloading ? <div style={{ marginTop: 16 }}><div style={{ height: 7, overflow: 'hidden', borderRadius: 99, background: '#e5eeec' }}><div style={{ width: installing ? '100%' : `${progress ?? 65}%`, height: '100%', borderRadius: 99, background: '#158f82', transition: 'width .2s ease' }} /></div><div style={{ marginTop: 7, color: '#267167', fontSize: 12, textAlign: 'center' }}>{progressText}</div></div> : null}
      {error ? <div style={{ marginTop: 12, color: '#c84a52', fontSize: 12, lineHeight: 1.5 }}>{error}</div> : null}
      <button type="button" onClick={() => { void startInstall(); }} disabled={downloading} style={{ width: '100%', height: 46, marginTop: 18, border: 'none', borderRadius: 12, background: downloading ? '#8bc9c1' : '#158f82', color: '#fff', fontSize: 15, fontWeight: 700 }}>{downloading ? '请勿退出 App' : '立即下载更新'}</button>
      {!downloading ? <button type="button" onClick={onClose} style={{ width: '100%', height: 36, marginTop: 6, border: 'none', background: 'transparent', color: '#8a94a3', fontSize: 14 }}>暂不更新</button> : null}
    </div>
  </div>;
}

function showUpdateNotice(title: string, description: string) {
  let handler: ReturnType<typeof Dialog.show>;
  handler = Dialog.show({
    content: <UpdateNotice title={title} description={description} onClose={() => handler.close()} />,
    closeOnMaskClick: true,
    style: { '--border-radius': '18px', '--max-width': '320px' },
    bodyStyle: { paddingTop: 0 },
  });
}

/** 在 App 内下载 APK，并唤起 Android 系统安装器。 */
async function downloadAndInstall(manifest: UpdateManifest, onProgress: (value: number | null) => void): Promise<void> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('AppUpdater')) {
    throw new Error('当前不是支持应用内安装的 Android App，请使用 Android 安装包更新');
  }

  onProgress(0);
  const response = await fetch(manifest.url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`下载更新包失败（HTTP ${response.status}）`);
  const total = Number(response.headers.get('content-length')) || 0;
  let buffer: ArrayBuffer;
  if (!response.body) {
    buffer = await response.arrayBuffer();
    onProgress(88);
  } else {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        onProgress(total ? Math.min(88, Math.max(1, Math.round(received / total * 88))) : null);
      }
    }
    const data = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    buffer = data.buffer;
    onProgress(88);
  }
  if (buffer.byteLength < 1024 * 1024) throw new Error('下载的更新包无效或不完整');

  const path = `updates/app-release-${manifest.versionCode}.apk`;
  await Filesystem.writeFile({ path, data: toBase64(buffer), directory: Directory.Cache, recursive: true });
  onProgress(96);
  const file = await Filesystem.getUri({ path, directory: Directory.Cache });
  onProgress(100);
  await AppUpdater.installApk({ uri: file.uri });
}

/**
 * 检查并在有新版本时弹窗提示。
 * @param opts.manual 手动触发（“检查更新”按钮）：无论成功/无更新/失败都用 Dialog 给出
 *   可见的明确提示（含具体失败原因）；自动触发（启动时）则全程静默。
 */
export async function promptUpdate(opts: { manual?: boolean } = {}): Promise<void> {
  const manual = !!opts.manual;

  const diag = await checkForUpdateDiag();

  // 手动检查保留可见反馈；采用与更新卡片一致的品牌化提示。
  if (!diag.ok || !diag.result) {
    if (manual) {
      showUpdateNotice('暂时无法检查更新', diag.reason || '请稍后再试。');
    }
    return;
  }

  const result = diag.result;

  if (!result.hasUpdate || !result.manifest) {
    if (manual) {
      showUpdateNotice('已是最新版本', `当前版本 v${result.currentVersionName}，感谢保持更新。`);
    }
    return;
  }

  const m = result.manifest;
  let handler: ReturnType<typeof Dialog.show>;
  handler = Dialog.show({
    content: <UpdatePanel manifest={m} currentVersionName={result.currentVersionName} onClose={() => handler.close()} onInstall={(onProgress) => downloadAndInstall(m, onProgress)} />,
    closeOnMaskClick: true,
    style: { '--border-radius': '18px', '--max-width': '340px' },
    bodyStyle: { paddingTop: 0 },
  });
}
