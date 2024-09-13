import { describe, expect, it } from 'vitest';
import { generateRefreshToken, hashToken, signAccessToken, verifyAccessToken } from '../../src/lib/tokens.js';

describe('tokens', () => {
  it('round-trips access token claims', () => {
    const token = signAccessToken({ sub: 42, role: 'seller', sellerId: 7 });
    expect(verifyAccessToken(token)).toMatchObject({ sub: 42, role: 'seller', sellerId: 7 });
  });

  it('rejects tampered tokens', () => {
    const token = signAccessToken({ sub: 1, role: 'buyer' });
    const [h, p, s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), role: 'admin' })).toString('base64url');
    expect(() => verifyAccessToken(`${h}.${forged}.${s}`)).toThrow();
  });

  it('generates unique refresh tokens and hashes them deterministically', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(a);
  });
});
