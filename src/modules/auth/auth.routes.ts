import { Router } from 'express';
import { route } from '../../lib/route.js';
import {
  AuthResponse,
  ChangePasswordBody,
  LoginBody,
  MeSchema,
  RefreshBody,
  SignupBody,
  UpdateMeBody,
} from './auth.schemas.js';
import { db } from '../../db/index.js';
import type { NewUser, User } from '../../db/types.js';
import { config } from '../../config.js';
import { conflict, forbidden, notFound, unauthorized } from '../../lib/errors.js';
import { sendMail } from '../../lib/mailer.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { generateRefreshToken, hashToken, signAccessToken } from '../../lib/tokens.js';

const usersRepository = {
  findByEmail(email: string) {
    return db.selectFrom('users').selectAll().where('email', '=', email.toLowerCase()).executeTakeFirst();
  },

  findById(id: number) {
    return db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
  },

  create(user: NewUser) {
    return db
      .insertInto('users')
      .values({ ...user, email: user.email.toLowerCase() })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(id: number, values: { name?: string; password_hash?: string; last_login_at?: Date }) {
    return db
      .updateTable('users')
      .set({ ...values, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  sellerForUser(userId: number) {
    return db
      .selectFrom('sellers')
      .select(['id', 'store_name', 'slug', 'status'])
      .where('user_id', '=', userId)
      .executeTakeFirst();
  },
};

const refreshTokensRepository = {
  create(userId: number, tokenHash: string, expiresAt: Date, userAgent: string | null) {
    return db
      .insertInto('refresh_tokens')
      .values({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt, user_agent: userAgent })
      .execute();
  },

  findActive(tokenHash: string) {
    return db
      .selectFrom('refresh_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();
  },

  revoke(tokenHash: string) {
    return db
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date() })
      .where('token_hash', '=', tokenHash)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
  },

  revokeAllForUser(userId: number) {
    return db
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date() })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
  },
};

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

const authService = {
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

export const authRouter = Router();
const mount = '/auth';
const tags = ['Auth'];

route(
  authRouter,
  mount,
  {
    method: 'post',
    path: '/signup',
    summary: 'Create a buyer account',
    tags,
    body: SignupBody,
    status: 201,
    responses: { 201: { description: 'Account created', schema: AuthResponse }, 409: { description: 'Email taken' } },
  },
  ({ body, req }) => authService.signup(body, req.get('user-agent') ?? null),
);

route(
  authRouter,
  mount,
  {
    method: 'post',
    path: '/login',
    summary: 'Log in with email and password',
    tags,
    body: LoginBody,
    responses: { 200: { description: 'Logged in', schema: AuthResponse }, 401: { description: 'Bad credentials' } },
  },
  ({ body, req }) => authService.login(body, req.get('user-agent') ?? null),
);

route(
  authRouter,
  mount,
  {
    method: 'post',
    path: '/refresh',
    summary: 'Exchange a refresh token for a new token pair',
    tags,
    body: RefreshBody,
    responses: { 200: { description: 'New tokens', schema: AuthResponse }, 401: { description: 'Invalid token' } },
  },
  ({ body, req }) => authService.refresh(body.refreshToken, req.get('user-agent') ?? null),
);

route(
  authRouter,
  mount,
  {
    method: 'post',
    path: '/logout',
    summary: 'Revoke a refresh token',
    tags,
    body: RefreshBody,
    responses: { 204: { description: 'Logged out' } },
  },
  async ({ body }) => {
    await authService.logout(body.refreshToken);
  },
);

route(
  authRouter,
  mount,
  {
    method: 'get',
    path: '/me',
    summary: 'Current user profile',
    tags,
    auth: 'required',
    responses: { 200: { description: 'Profile', schema: MeSchema } },
  },
  ({ user }) => authService.me(user.id),
);

route(
  authRouter,
  mount,
  {
    method: 'patch',
    path: '/me',
    summary: 'Update profile',
    tags,
    auth: 'required',
    body: UpdateMeBody,
    responses: { 200: { description: 'Profile', schema: MeSchema } },
  },
  ({ user, body }) => authService.updateMe(user.id, body),
);

route(
  authRouter,
  mount,
  {
    method: 'post',
    path: '/password',
    summary: 'Change password (signs out other sessions)',
    tags,
    auth: 'required',
    body: ChangePasswordBody,
    responses: { 204: { description: 'Password changed' } },
  },
  async ({ user, body }) => {
    await authService.changePassword(user.id, body);
  },
);
