import { describe, it, expect } from 'vitest';
import { signInErrorText } from './sign-in-errors';

const ADDR = 'SP3E4FJ49AJX139KVMVGDBB1F5ZYYAC4X54JEJE49';

describe('signInErrorText', () => {
  it('tells the user to switch to the connected account on address_mismatch', () => {
    const text = signInErrorText('address_mismatch', ADDR);
    expect(text).toContain('different account');
    expect(text).toContain('SP3E4F…JE49');
  });

  it('explains clock and expiry problems', () => {
    expect(signInErrorText('challenge_issued_in_future', ADDR)).toMatch(/clock/i);
    expect(signInErrorText('challenge_expired', ADDR)).toMatch(/expired/i);
  });

  it('keeps the code for anything unmapped, for support', () => {
    expect(signInErrorText('http_500', ADDR)).toBe('Please try again. (code: http_500)');
  });

  it('never uses words the caller treats as a user cancel', () => {
    for (const code of ['address_mismatch', 'challenge_expired', 'challenge_issued_in_future', 'nonce_already_used', 'invalid_signature', 'domain_not_allowed', 'http_500']) {
      expect(signInErrorText(code, ADDR).toLowerCase()).not.toMatch(/reject|cancel|denied|dismiss/);
    }
  });
});
