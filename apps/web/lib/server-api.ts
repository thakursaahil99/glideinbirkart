import 'server-only';
import { createApi, createClient } from '@gk/api-client';

/** Anonymous API client for Server Components (SSR / ISR). Pass `{ next: { revalidate } }` per call. */
const API_ORIGIN = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export const serverApi = createApi(
  createClient({
    baseUrl: `${API_ORIGIN}/api/v1`,
    platform: 'web',
    tokens: { getAccessToken: () => null, setAccessToken: () => undefined },
  }),
);

export const revalidate = {
  short: { next: { revalidate: 60 } },
  medium: { next: { revalidate: 120 } },
  long: { next: { revalidate: 600 } },
} as const;

/** Run a server fetch and turn API failures into `null` (so pages can render fallbacks / notFound()). */
export async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
