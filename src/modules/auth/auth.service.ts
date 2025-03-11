import { config } from '../../config.js';
import type { User } from '../../db/types.js';
import { conflict, forbidden, notFound, unauthorized } from '../../lib/errors.js';
import { sendMail } from '../../lib/mailer.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { generateRefreshToken, hashToken, signAccessToken } from '../../lib/tokens.js';
import { refreshTokensRepository, usersRepository } from './users.repository.js';

async function toMe(user: User) {
  const seller = await usersRepository.sellerForUser(user.id);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.created_at.toISOString(),
    seller: seller ? { id: seller.id, storeName: seller.store_name, slug: seller.slug, status: seller.status } : null,
  };
}

async function issueTokens(user: User, userAgent: string | null) {
  const me = await toMe(user);
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    sellerId: me.seller?.status === 'active' ? me.seller.id : null,
  });
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await refreshTokensRepository.create(user.id, hashToken(refreshToken), expiresAt, userAgent);
  return { accessToken, refreshToken, expiresIn: config.JWT_ACCESS_TTL, user: me };
}

export const authService = {
  async signup(input: { email: string; password: string; name: string }, userAgent: string | null) {
    const existing = await usersRepository.findByEmail(input.email);
    if (existing) throw conflict('An account with this email already exists');

    const user = await usersRepository.create({
      email: input.email,
      name: input.name,
      password_hash: hashPassword(input.password),
    });

    await sendMail({
      to: user.email,
      subject: 'Welcome to Bazario',
      text: `Hi ${user.name},\n\nThanks for joining Bazario. Happy shopping!\n\nThe Bazario team`,
    });

    return issueTokens(user, userAgent);
  },

  async login(input: { email: string; password: string }, userAgent: string | null) {
    const user = await usersRepository.findByEmail(input.email);
    if (!user || !verifyPassword(input.password, user.password_hash)) {
      throw unauthorized('Invalid email or password');
    }
    if (user.status !== 'active') throw forbidden('This account has been suspended');

    const updated = await usersRepository.update(user.id, { last_login_at: new Date() });
    return issueTokens(updated, userAgent);
  },

  async refresh(refreshToken: string, userAgent: string | null) {
    const tokenHash = hashToken(refreshToken);
    const stored = await refreshTokensRepository.findActive(tokenHash);
    if (!stored) throw unauthorized('Invalid refresh token');

    const user = await usersRepository.findById(stored.user_id);
    if (!user || user.status !== 'active') throw unauthorized('Invalid refresh token');

    const revoked = await refreshTokensRepository.revoke(tokenHash);
    if (Number(revoked.numUpdatedRows) === 0) throw unauthorized('Invalid refresh token');
    return issueTokens(user, userAgent);
  },

  async logout(refreshToken: string) {
    await refreshTokensRepository.revoke(hashToken(refreshToken));
  },

  async me(userId: number) {
    const user = await usersRepository.findById(userId);
    if (!user) throw notFound('User');
    return toMe(user);
  },

  async updateMe(userId: number, input: { name: string }) {
    const user = await usersRepository.update(userId, { name: input.name });
    return toMe(user);
  },

  async changePassword(userId: number, input: { currentPassword: string; newPassword: string }) {
    const user = await usersRepository.findById(userId);
    if (!user) throw notFound('User');
    if (!verifyPassword(input.currentPassword, user.password_hash)) {
      throw unauthorized('Current password is incorrect');
    }
    await usersRepository.update(userId, { password_hash: hashPassword(input.newPassword) });
    await refreshTokensRepository.revokeAllForUser(userId);
    await sendMail({
      to: user.email,
      subject: 'Your Bazario password was changed',
      text: `Hi ${user.name},\n\nYour password was just changed. If this wasn't you, contact support right away.`,
    });
  },
};
