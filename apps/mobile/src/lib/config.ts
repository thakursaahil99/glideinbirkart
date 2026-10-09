import Constants from 'expo-constants';

/**
 * API base URL. In dev the Expo dev-server host (your computer LAN IP) is reused so a physical phone
 * running Expo Go reaches the NestJS API on :4000 without any configuration.
 */
function resolveApiUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:4000/api/v1`;
}

export const API_URL = resolveApiUrl();
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? 'https://glideinbirkart.in').replace(
  /\/$/,
  '',
);
export const EAS_PROJECT_ID: string | undefined =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
  (Constants.expoConfig?.extra?.eas?.projectId as string | undefined);
