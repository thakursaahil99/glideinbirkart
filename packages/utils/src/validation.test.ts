import { describe, expect, it } from 'vitest';
import {
  isGstin,
  isIfsc,
  isIndianMobile,
  isPan,
  isPincode,
  maskEmail,
  maskPhone,
  normalizePhone,
} from './validation';
import { INDIAN_STATES, sameState, stateCodeFromName } from './india';
import { initials, pluralize, slugify, timeAgo, truncate } from './text';

describe('Indian identifiers', () => {
  it('validates PIN codes', () => {
    expect(isPincode('560001')).toBe(true);
    expect(isPincode('060001')).toBe(false);
    expect(isPincode('56001')).toBe(false);
  });
  it('validates mobiles including +91 and 0 prefixes', () => {
    expect(isIndianMobile('9876543210')).toBe(true);
    expect(isIndianMobile('+91 98765-43210')).toBe(true);
    expect(isIndianMobile('09876543210')).toBe(true);
    expect(isIndianMobile('5876543210')).toBe(false);
  });
  it('validates GSTIN, PAN and IFSC', () => {
    expect(isGstin('29ABCDE1234F1Z5')).toBe(true);
    expect(isGstin('29abcde1234f1z5')).toBe(true);
    expect(isGstin('29ABCDE1234F1X5')).toBe(false);
    expect(isPan('ABCDE1234F')).toBe(true);
    expect(isPan('ABCD1234F')).toBe(false);
    expect(isIfsc('HDFC0001234')).toBe(true);
    expect(isIfsc('HDFC1001234')).toBe(false);
  });
  it('normalises phone numbers', () => {
    expect(normalizePhone('+91-98765 43210')).toBe('9876543210');
  });
  it('masks PII', () => {
    expect(maskEmail('sahil@example.com')).toBe('sa***@example.com');
    expect(maskPhone('9876543210')).toBe('******3210');
  });
});

describe('states', () => {
  it('knows GST state codes', () => {
    expect(stateCodeFromName('Karnataka')).toBe('29');
    expect(stateCodeFromName('Atlantis')).toBeUndefined();
    expect(INDIAN_STATES.length).toBeGreaterThanOrEqual(36);
  });
  it('compares states case-insensitively', () => {
    expect(sameState('karnataka', 'Karnataka')).toBe(true);
    expect(sameState('Goa', 'Karnataka')).toBe(false);
    expect(sameState(null, 'Goa')).toBe(false);
  });
});

describe('text helpers', () => {
  it('slugifies', () => {
    expect(slugify('Mens T-Shirts & Polos!')).toBe('mens-t-shirts-and-polos');
    expect(slugify('  Café   Crème ')).toBe('cafe-creme');
  });
  it('truncates with an ellipsis', () => {
    expect(truncate('hello world', 20)).toBe('hello world');
    expect(truncate('hello world', 6)).toBe('hello…');
  });
  it('builds initials and plurals', () => {
    expect(initials('sahil kumar singh')).toBe('SK');
    expect(pluralize(1, 'item')).toBe('1 item');
    expect(pluralize(3, 'item')).toBe('3 items');
  });
  it('formats relative time', () => {
    const now = new Date('2026-01-10T12:00:00Z');
    expect(timeAgo('2026-01-10T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-01-10T11:00:00Z', now)).toBe('1h ago');
    expect(timeAgo('2026-01-07T12:00:00Z', now)).toBe('3d ago');
  });
});
