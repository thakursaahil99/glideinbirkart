type ClassValue = string | false | null | undefined | 0;

/** Minimal className joiner (NativeWind resolves conflicts by order, so no tailwind-merge needed). */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
