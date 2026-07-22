import { registerPlugin } from '@capacitor/core';

export interface AppUpdaterPlugin {
  installApk(options: { uri: string }): Promise<{ started: boolean }>;
}

export const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');