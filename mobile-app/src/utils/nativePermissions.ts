/**
 * 安卓运行时权限统一封装（Android 6.0+ 动态权限）。
 *
 * 说明：
 * - 相机 / 相册权限走 @capacitor/camera 插件（原生弹窗）。
 * - 推送通知权限走 @capacitor/push-notifications 插件（Android 13+ 需 POST_NOTIFICATIONS）。
 * - 麦克风 / 相机+麦克风走 WebView 的 getUserMedia，Capacitor 会自动代理成
 *   Android 运行时权限请求（前提：AndroidManifest 已声明 CAMERA / RECORD_AUDIO）。
 * - Web 环境下相机/相册权限视为始终可用（浏览器 file input / getUserMedia 自行处理）。
 *
 * 对外主入口：requestPermission(type) / checkPermission(type)。
 */
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import type { CameraPermissionState } from '@capacitor/camera';
import { PushNotifications } from '@capacitor/push-notifications';

/** 统一权限类型 */
export type NativePermissionType =
  | 'camera'
  | 'photos'
  | 'microphone'
  | 'notifications'
  | 'camera-microphone';

/**
 * 统一权限结果：
 * - granted：已授权
 * - denied：被拒绝
 * - prompt：尚未决定（可再次申请）
 * - limited：受限授权（如 iOS 部分相册）
 * - unavailable：当前平台/环境不支持
 */
export type NativePermissionResult =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'limited'
  | 'unavailable';

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/** 将 Capacitor PermissionState 映射为统一结果 */
const mapState = (state?: CameraPermissionState): NativePermissionResult => {
  switch (state) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'limited':
      return 'limited';
    case 'prompt':
    case 'prompt-with-rationale':
      return 'prompt';
    default:
      return 'prompt';
  }
};

/** 通过 getUserMedia 触发 WebView 媒体权限（相机/麦克风） */
const requestMediaViaWebView = async (
  constraints: MediaStreamConstraints,
): Promise<NativePermissionResult> => {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!md || typeof md.getUserMedia !== 'function') {
    return 'unavailable';
  }
  try {
    const stream = await md.getUserMedia(constraints);
    // 立即释放，避免占用摄像头/麦克风
    stream.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
    if (name === 'NotFoundError' || name === 'NotSupportedError') return 'unavailable';
    return 'denied';
  }
};

/**
 * 检查权限状态（不弹窗）。
 * 注意：麦克风在多数浏览器无法静默查询，返回 'prompt'。
 */
export const checkPermission = async (
  type: NativePermissionType,
): Promise<NativePermissionResult> => {
  switch (type) {
    case 'camera':
    case 'camera-microphone': {
      if (!isNative()) return 'granted';
      const status = await Camera.checkPermissions();
      return mapState(status.camera);
    }
    case 'photos': {
      if (!isNative()) return 'granted';
      const status = await Camera.checkPermissions();
      return mapState(status.photos);
    }
    case 'notifications': {
      if (!isNative()) return 'unavailable';
      const status = await PushNotifications.checkPermissions();
      return mapState(status.receive as CameraPermissionState);
    }
    case 'microphone':
      return 'prompt';
    default:
      return 'prompt';
  }
};

/**
 * 统一权限申请入口（Android 会弹出原生运行时权限对话框）。
 * @param type 权限类型
 * @returns 统一权限结果
 */
export const requestPermission = async (
  type: NativePermissionType,
): Promise<NativePermissionResult> => {
  switch (type) {
    case 'camera': {
      if (!isNative()) return 'granted';
      const status = await Camera.requestPermissions({ permissions: ['camera'] });
      return mapState(status.camera);
    }
    case 'photos': {
      if (!isNative()) return 'granted';
      const status = await Camera.requestPermissions({ permissions: ['photos'] });
      return mapState(status.photos);
    }
    case 'notifications': {
      if (!isNative()) return 'unavailable';
      const status = await PushNotifications.requestPermissions();
      return mapState(status.receive as CameraPermissionState);
    }
    case 'microphone':
      return requestMediaViaWebView({ audio: true });
    case 'camera-microphone':
      return requestMediaViaWebView({ video: true, audio: true });
    default:
      return 'prompt';
  }
};

/** 语义化便捷方法：确保相机权限，返回是否已授权 */
export const ensureCameraPermission = async (): Promise<boolean> =>
  (await requestPermission('camera')) === 'granted';

/** 语义化便捷方法：确保相册权限，返回是否已授权（含 limited） */
export const ensurePhotosPermission = async (): Promise<boolean> => {
  const r = await requestPermission('photos');
  return r === 'granted' || r === 'limited';
};

/** 语义化便捷方法：确保麦克风权限 */
export const ensureMicrophonePermission = async (): Promise<boolean> =>
  (await requestPermission('microphone')) === 'granted';

/**
 * 语义化便捷方法：确保音视频权限。
 * 同时申请相机与麦克风，任一失败返回 false。
 */
export const ensureMediaPermissions = async (): Promise<boolean> =>
  (await requestPermission('camera-microphone')) === 'granted';
