import { Capacitor, registerPlugin } from '@capacitor/core';

interface ClipboardBridgePlugin {
  write(options: { text: string }): Promise<void>;
}

const ClipboardBridge = registerPlugin<ClipboardBridgePlugin>('ClipboardBridge');

/**
 * 统一复制文本：Android App 使用系统剪贴板，H5 使用浏览器能力并保留降级方案。
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (!text) throw new Error('复制内容不能为空');

  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('ClipboardBridge')) {
    await ClipboardBridge.write({ text });
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);
  if (!copied) throw new Error('浏览器不支持复制');
}
