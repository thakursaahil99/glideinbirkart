/** Indian identifier formats shared by API validators, web forms and the mobile app. */

export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;
export const PHONE_REGEX = /^[6-9][0-9]{9}$/;
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const BANK_ACCOUNT_REGEX = /^[0-9]{9,18}$/;

export const isPincode = (v: string) => PINCODE_REGEX.test(v);
export const isIndianMobile = (v: string) => PHONE_REGEX.test(normalizePhone(v));
export const isGstin = (v: string) => GSTIN_REGEX.test(v.toUpperCase());
export const isPan = (v: string) => PAN_REGEX.test(v.toUpperCase());
export const isIfsc = (v: string) => IFSC_REGEX.test(v.toUpperCase());

/** "+91 98765-43210" → "9876543210" */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export function maskPhone(phone: string): string {
  return phone.length < 4 ? phone : `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`;
}
