/**
 * 原生能力统一封装（底层，供业务页面调用）。
 *
 * 覆盖能力：
 * 1) 相机 / 相册：takePhoto() / pickFromGallery() / pickMultipleFromGallery()，
 *    统一返回可上传的 NativeFile（含 Blob / File / webPath 预览地址）。
 * 2) 上传辅助：toFormData() / appendFile()，直接对接 apiService.upload。
 * 3) 文件系统：saveTextFile / saveBinaryFile / readTextFile / readBinaryFile /
 *    deleteFile / getFileUri / cacheBlob（导出、缓存等场景）。
 * 4) 推送通知接入点：registerPush() / onNotification() 等骨架（可后续对接后端）。
 * 5) 媒体权限辅助：从 nativePermissions 复用。
 *
 * 平台适配：所有方法在 Web 与 Android WebView 下均可编译运行；
 * Web 端相机走浏览器 file input / PWA Elements，原生端走系统相机/相册。
 */
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import type { MediaResult } from '@capacitor/camera';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { PushNotifications } from '@capacitor/push-notifications';
import type { Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';

import {
  ensureCameraPermission,
  ensurePhotosPermission,
  ensureMediaPermissions,
  ensureMicrophonePermission,
} from '../utils/nativePermissions';

// ── 通用工具 ─────────────────────────────────────
const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/** 可直接上传的原生文件结果 */
export interface NativeFile {
  /** 原始二进制（编辑模式回填的历史文件无此字段，仅用于预览） */
  blob?: Blob;
  /** 包装后的 File（带文件名与 MIME），可直接 append 进 FormData（历史文件无此字段） */
  file?: File;
  /** 文件名，如 photo_1699999999999.jpeg */
  fileName: string;
  /** MIME 类型，如 image/jpeg */
  mimeType: string;
  /** 可用于 <img src> 预览的地址（原生为 capacitor 文件地址，Web 为 blob/dataURL） */
  webPath?: string;
  /** 文件大小（字节） */
  size: number;
  /** 已保存到后端的文件 URL（编辑模式回填的历史文件专用；有值则提交时跳过重复上传） */
  existingUrl?: string;
}

/** 拍照参数（映射相机插件常用项） */
export interface TakePhotoParams {
  /** 图片质量 0-100，默认 85 */
  quality?: number;
  /** 目标宽度（等比缩放） */
  targetWidth?: number;
  /** 目标高度（等比缩放） */
  targetHeight?: number;
  /** 是否允许在系统层编辑，默认 'no' */
  editable?: 'in-app' | 'external' | 'no';
  /** 是否同时保存到系统相册，默认 false */
  saveToGallery?: boolean;
}

/** 相册选择参数 */
export interface PickParams {
  /** 图片质量 0-100，默认 85 */
  quality?: number;
  targetWidth?: number;
  targetHeight?: number;
}

const DEFAULT_QUALITY = 85;

/** Capacitor/浏览器在用户主动退出相机或相册时返回的非业务错误。 */
const MEDIA_SELECTION_CANCELLED = /(?:user\s+(?:has\s+)?cancel+ed|cancel+ed\s+photos\s+app|未选择任何(?:图片|文件))/i;

/** 用户取消媒体选择不应被当作失败提示给用户。 */
export const isMediaSelectionCancelled = (error: unknown): boolean => {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  return MEDIA_SELECTION_CANCELLED.test(message);
};

/** base64（纯字符串，无前缀）-> Blob */
const base64ToBlob = (base64: string, mime = 'application/octet-stream'): Blob => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

const extFromMime = (mime: string): string => {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'application/pdf': 'pdf',
  };
  return map[mime] || 'bin';
};

/** 将相机/相册返回的 MediaResult 转为可上传的 Blob */
const mediaResultToBlob = async (result: MediaResult): Promise<Blob> => {
  // 1) 优先使用 webPath（原生：capacitor 文件地址；Web：blob URL）
  const candidatePaths: string[] = [];
  if (result.webPath) candidatePaths.push(result.webPath);
  if (result.uri) candidatePaths.push(Capacitor.convertFileSrc(result.uri));

  for (const path of candidatePaths) {
    try {
      const resp = await fetch(path);
      const blob = await resp.blob();
      if (blob && blob.size > 0) return blob;
    } catch {
      /* 尝试下一个来源 */
    }
  }

  // 2) 回退到 thumbnail（Web 端 Photo 会返回完整图 base64）
  if (result.thumbnail) {
    const fmt = result.metadata?.format || 'jpeg';
    return base64ToBlob(result.thumbnail, `image/${fmt === 'jpg' ? 'jpeg' : fmt}`);
  }

  throw new Error('无法从相机结果中读取文件数据');
};

/** MediaResult -> NativeFile */
export const mediaResultToNativeFile = async (
  result: MediaResult,
  namePrefix = 'photo',
): Promise<NativeFile> => {
  const blob = await mediaResultToBlob(result);
  const mimeType = blob.type || `image/${(result.metadata?.format || 'jpeg').replace('jpg', 'jpeg')}`;
  const ext = extFromMime(mimeType);
  const fileName = `${namePrefix}_${Date.now()}.${ext}`;
  const file = new File([blob], fileName, { type: mimeType });
  return {
    blob,
    file,
    fileName,
    mimeType,
    size: blob.size,
    webPath: result.webPath || (result.uri ? Capacitor.convertFileSrc(result.uri) : undefined),
  };
};

// ── 相机 / 相册 ──────────────────────────────────

/**
 * 拍照并返回可上传文件（自动申请相机权限）。
 * 适用场景：简历证件照 / 现场拍照上传。
 * @throws 权限被拒绝或用户取消时抛出错误
 */
export const takePhoto = async (params: TakePhotoParams = {}): Promise<NativeFile> => {
  const granted = await ensureCameraPermission();
  if (!granted) throw new Error('相机权限未授予');

  const result = await Camera.takePhoto({
    quality: params.quality ?? DEFAULT_QUALITY,
    targetWidth: params.targetWidth,
    targetHeight: params.targetHeight,
    editable: params.editable ?? 'no',
    saveToGallery: params.saveToGallery ?? false,
    correctOrientation: true,
  });
  return mediaResultToNativeFile(result, 'photo');
};

/**
 * 从相册选择单张图片并返回可上传文件。
 *
 * 说明：
 * Android 上 `@capacitor/camera` 的 `chooseFromGallery` 在部分机型上会出现
 * 权限请求挂起或系统相册 Activity 无返回，表现为"点击后完全无响应"。
 * 这里改走 WebView 原生 file input；Capacitor 会通过 onShowFileChooser 调起
 * 系统图片选择器，用户选完后直接拿到 File，链路更短且可复用视频选择的已验证路径。
 */
export const pickFromGallery = async (_params: PickParams = {}): Promise<NativeFile> => {
  const [file] = await pickFile({ accept: 'image/*' });
  return file;
};

/**
 * 从相册选择多张图片并返回可上传文件数组。
 * 与单图选择相同，避免 Android 端 Camera 相册选择挂起。
 */
export const pickMultipleFromGallery = async (
  _params: PickParams = {},
): Promise<NativeFile[]> => pickFile({ accept: 'image/*', multiple: true });

/**
 * 通过隐藏的 <input type="file"> 选择文件（支持视频、多选、指定 accept）。
 * Android App WebView 会走系统文件/图片选择器；Web 端走浏览器选择器。
 * @param accept MIME 过滤，如 'video/*' 或 'image/*'
 * @param multiple 是否允许多选
 */
export const pickFile = (
  { accept = 'image/*', multiple = false }: { accept?: string; multiple?: boolean } = {},
): Promise<NativeFile[]> =>
  new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    let focusTimer: number | undefined;
    const onWindowFocus = () => {
      // 部分 Android WebView 返回前台后既无 change 也无 cancel；
      // 回到页面时若仍无文件，按用户取消处理，避免 Promise 永久挂起。
      focusTimer = window.setTimeout(() => {
        if (!settled && !input.files?.length) fail('未选择任何文件');
      }, 300);
    };
    const cleanup = () => {
      if (focusTimer != null) window.clearTimeout(focusTimer);
      window.removeEventListener('focus', onWindowFocus);
      input.onchange = null;
      input.oncancel = null;
      input.remove();
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };
    const succeed = (files: File[]) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(
        files.map((file) => ({
          blob: file,
          file,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          webPath: URL.createObjectURL(file),
        })),
      );
    };

    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (files.length === 0) {
        fail('未选择任何文件');
        return;
      }
      succeed(files);
    };
    // 部分浏览器/Android WebView 在用户关闭选择器时触发 cancel。
    input.oncancel = () => fail('未选择任何文件');
    window.addEventListener('focus', onWindowFocus, { once: true });

    try {
      input.click();
    } catch {
      fail('无法打开系统文件选择器');
    }
  });

// ── 上传辅助（FormData） ─────────────────────────

/**
 * 将一个或多个 NativeFile 追加到 FormData。
 * @param formData 目标 FormData（不传则新建）
 * @param field 字段名，如 'personalPhoto' / 'certificates'
 * @param files 单个或多个 NativeFile
 */
export const appendFile = (
  formData: FormData,
  field: string,
  files: NativeFile | NativeFile[],
): FormData => {
  const list = Array.isArray(files) ? files : [files];
  list.forEach((f) => {
    if (f.file) formData.append(field, f.file, f.fileName);
  });
  return formData;
};

/**
 * 快速构建仅含文件的 FormData，直接对接 apiService.upload / resumeService。
 */
export const toFormData = (
  field: string,
  files: NativeFile | NativeFile[],
  extra?: Record<string, string | Blob>,
): FormData => {
  const fd = new FormData();
  if (extra) Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
  return appendFile(fd, field, files);
};

// ── 文件系统 ─────────────────────────────────────

/** 保存文本文件，返回文件 URI。默认存到 Cache 目录 */
export const saveTextFile = async (
  path: string,
  data: string,
  directory: Directory = Directory.Cache,
): Promise<string> => {
  const res = await Filesystem.writeFile({
    path,
    data,
    directory,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  return res.uri;
};

/**
 * 保存二进制文件（Blob 或 base64 字符串），返回文件 URI。
 * 适用：导出报表、缓存下载的图片/文件。
 */
export const saveBinaryFile = async (
  path: string,
  data: Blob | string,
  directory: Directory = Directory.Cache,
): Promise<string> => {
  const res = await Filesystem.writeFile({
    path,
    data,
    directory,
    recursive: true,
  });
  return res.uri;
};

/** 读取文本文件内容 */
export const readTextFile = async (
  path: string,
  directory: Directory = Directory.Cache,
): Promise<string> => {
  const res = await Filesystem.readFile({ path, directory, encoding: Encoding.UTF8 });
  return res.data as string;
};

/** 读取二进制文件，返回 base64 字符串（无 data: 前缀） */
export const readBinaryFile = async (
  path: string,
  directory: Directory = Directory.Cache,
): Promise<string> => {
  const res = await Filesystem.readFile({ path, directory });
  return res.data as string;
};

/** 删除文件 */
export const deleteFile = async (
  path: string,
  directory: Directory = Directory.Cache,
): Promise<void> => {
  await Filesystem.deleteFile({ path, directory });
};

/** 获取文件在设备上的可访问 URI（用于分享/预览） */
export const getFileUri = async (
  path: string,
  directory: Directory = Directory.Cache,
): Promise<string> => {
  const res = await Filesystem.getUri({ path, directory });
  return res.uri;
};

/**
 * 将 Blob 缓存到本地并返回可用于预览的 webPath。
 * 用于下载文件后本地预览/离线缓存。
 */
export const cacheBlob = async (
  path: string,
  blob: Blob,
  directory: Directory = Directory.Cache,
): Promise<{ uri: string; webPath: string }> => {
  const uri = await saveBinaryFile(path, blob, directory);
  return { uri, webPath: Capacitor.convertFileSrc(uri) };
};

// 直接透出文件系统目录枚举，便于业务侧指定存储位置
export { Directory as FilesystemDirectory, Encoding as FilesystemEncoding };

// ── 推送通知接入点（骨架，可后续对接后端） ──────────

/** 推送事件回调集合 */
export interface PushHandlers {
  /** 注册成功，拿到设备 token（需上报后端） */
  onToken?: (token: string) => void;
  /** 注册失败 */
  onError?: (error: unknown) => void;
  /** 收到通知（前台） */
  onReceived?: (notification: PushNotificationSchema) => void;
  /** 用户点击通知触发的动作 */
  onAction?: (action: ActionPerformed) => void;
}

const pushListeners: PluginListenerHandle[] = [];

/**
 * 注册推送通知（骨架）：申请权限 -> register() -> 绑定监听。
 * 后端 FCM 对接就绪后，业务侧通过 onToken 上报 token 即可端到端可用。
 * @returns 是否成功发起注册（权限被拒或非原生环境返回 false）
 */
export const registerPush = async (handlers: PushHandlers = {}): Promise<boolean> => {
  if (!isNative()) return false;

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return false;

  if (handlers.onToken) {
    pushListeners.push(
      await PushNotifications.addListener('registration', (token: Token) =>
        handlers.onToken?.(token.value),
      ),
    );
  }
  if (handlers.onError) {
    pushListeners.push(
      await PushNotifications.addListener('registrationError', (err) => handlers.onError?.(err)),
    );
  }
  if (handlers.onReceived) {
    pushListeners.push(
      await PushNotifications.addListener('pushNotificationReceived', (n) =>
        handlers.onReceived?.(n),
      ),
    );
  }
  if (handlers.onAction) {
    pushListeners.push(
      await PushNotifications.addListener('pushNotificationActionPerformed', (a) =>
        handlers.onAction?.(a),
      ),
    );
  }

  await PushNotifications.register();
  return true;
};

/**
 * 订阅“收到通知”事件（便捷方法）。返回可用于取消订阅的句柄。
 */
export const onNotification = async (
  cb: (notification: PushNotificationSchema) => void,
): Promise<PluginListenerHandle | null> => {
  if (!isNative()) return null;
  const handle = await PushNotifications.addListener('pushNotificationReceived', cb);
  pushListeners.push(handle);
  return handle;
};

/** 移除所有推送监听并清空已投递通知 */
export const removeAllPushListeners = async (): Promise<void> => {
  await Promise.all(pushListeners.splice(0).map((h) => h.remove()));
  if (isNative()) {
    try {
      await PushNotifications.removeAllDeliveredNotifications();
    } catch {
      /* ignore */
    }
  }
};

// ── 复用的权限辅助（音视频 / 相机 / 相册） ──────────
export {
  ensureCameraPermission,
  ensurePhotosPermission,
  ensureMicrophonePermission,
  ensureMediaPermissions,
};

/** 统一命名空间导出，便于 `import { native } from '@/services/native'` 风格调用 */
export const native = {
  takePhoto,
  pickFromGallery,
  pickMultipleFromGallery,
  mediaResultToNativeFile,
  appendFile,
  toFormData,
  saveTextFile,
  saveBinaryFile,
  readTextFile,
  readBinaryFile,
  deleteFile,
  getFileUri,
  cacheBlob,
  registerPush,
  onNotification,
  removeAllPushListeners,
  ensureCameraPermission,
  ensurePhotosPermission,
  ensureMicrophonePermission,
  ensureMediaPermissions,
};

export default native;
