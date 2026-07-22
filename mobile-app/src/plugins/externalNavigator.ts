import { registerPlugin } from '@capacitor/core';

export interface ExternalNavigatorPlugin {
  openUrl(options: { url: string }): Promise<{ opened: boolean }>;
}

export const ExternalNavigator = registerPlugin<ExternalNavigatorPlugin>('ExternalNavigator');