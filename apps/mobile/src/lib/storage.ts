import AsyncStorage from '@react-native-async-storage/async-storage';

export const storage = {
  get: (key: string) => AsyncStorage.getItem(key).catch(() => null),
  set: (key: string, value: string) => AsyncStorage.setItem(key, value).catch(() => undefined),
  remove: (key: string) => AsyncStorage.removeItem(key).catch(() => undefined),
  async getJson<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  setJson: (key: string, value: unknown) =>
    AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined),
};

// The guest cart id must be readable synchronously by the API client, so it is cached in memory after startup.
let guestId: string | null = null;
const uuid = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

export async function initGuestCartId(): Promise<void> {
  guestId = (await storage.get('gk_guest_cart')) ?? null;
  if (!guestId) {
    guestId = uuid();
    await storage.set('gk_guest_cart', guestId);
  }
}
export const getGuestCartId = () => guestId;
export async function resetGuestCartId() {
  guestId = uuid();
  await storage.set('gk_guest_cart', guestId);
}
export const peekGuestCartId = () => guestId;

export const recentSearches = {
  get: () => storage.getJson<string[]>('gk_recent_searches', []),
  async add(q: string) {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return;
    const cur = await recentSearches.get();
    await storage.setJson('gk_recent_searches', [t, ...cur.filter((x) => x !== t)].slice(0, 8));
  },
  clear: () => storage.setJson('gk_recent_searches', []),
};

export const viewedProducts = {
  get: () => storage.getJson<string[]>('gk_viewed', []),
  async add(id: string) {
    const cur = await viewedProducts.get();
    await storage.setJson('gk_viewed', [id, ...cur.filter((x) => x !== id)].slice(0, 20));
  },
};
