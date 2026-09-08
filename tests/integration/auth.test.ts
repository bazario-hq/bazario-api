import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import { sentMail } from '../../src/lib/mailer.js';
import { AuthResponse, MeSchema } from '../../src/modules/auth/auth.schemas.js';
import { api, useTestDb } from '../support/app.js';
import { createSeller, createUser, PASSWORD } from '../support/factories.js';
import { expectSchema } from '../support/schema.js';

describe('auth', () => {
  useTestDb();

  describe('signup', () => {
    it('creates a buyer account, returns tokens and sends a welcome email', async () => {
      const res = await api()
        .post('/api/auth/signup')
        .send({ email: 'New.Person@Example.test', password: 'long-enough-pw', name: 'New Person' });

      expect(res.status).toBe(201);
      expectSchema(AuthResponse, res.body);
      expect(res.body.user).toMatchObject({ email: 'new.person@example.test', role: 'buyer', seller: null });
      expect(sentMail.map((m) => m.subject)).toContain('Welcome to Bazario');

      const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.name).toBe('New Person');
    });

    it('rejects a duplicate email regardless of case', async () => {
      await createUser({ email: 'taken@example.test' });
      const res = await api()
        .post('/api/auth/signup')
        .send({ email: 'TAKEN@example.test', password: 'long-enough-pw', name: 'Someone' });
      expect(res.status).toBe(409);
    });

    it('validates input', async () => {
      const res = await api().post('/api/auth/signup').send({ email: 'not-an-email', password: 'short', name: '' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('bad_request');
      expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(
        expect.arrayContaining(['email', 'password', 'name']),
      );
    });

    it('does not store the plain password', async () => {
      await api().post('/api/auth/signup').send({ email: 'hash@example.test', password: 'long-enough-pw', name: 'H' });
      const row = await db.selectFrom('users').select('password_hash').where('email', '=', 'hash@example.test').executeTakeFirstOrThrow();
      expect(row.password_hash).not.toContain('long-enough-pw');
      expect(row.password_hash).toMatch(/^\$2[aby]\$/);
    });
  });

  describe('login', () => {
    it('logs in with the right password and records last login', async () => {
      const user = await createUser();
      const res = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });
      expect(res.status).toBe(200);
      expectSchema(AuthResponse, res.body);

      const row = await db.selectFrom('users').select('last_login_at').where('id', '=', user.id).executeTakeFirstOrThrow();
      expect(row.last_login_at).not.toBeNull();
    });

    it('rejects a wrong password with a generic message', async () => {
      const user = await createUser();
      const res = await api().post('/api/auth/login').send({ email: user.email, password: 'nope-nope' });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid email or password');

      const unknown = await api().post('/api/auth/login').send({ email: 'ghost@example.test', password: 'nope-nope' });
      expect(unknown.status).toBe(401);
      expect(unknown.body.error.message).toBe('Invalid email or password');
    });

    it('refuses suspended accounts', async () => {
      const user = await createUser({ status: 'suspended' });
      const res = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });
      expect(res.status).toBe(403);
    });

    it('includes the seller account in the profile of a seller', async () => {
      const { user, seller } = await createSeller();
      const res = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });
      expect(res.body.user.seller).toMatchObject({ id: seller.id, status: 'active' });
    });
  });

  describe('refresh tokens', () => {
    it('rotates the refresh token and rejects reuse of the old one', async () => {
      const user = await createUser();
      const login = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });
      const first = login.body.refreshToken;

      const refreshed = await api().post('/api/auth/refresh').send({ refreshToken: first });
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.refreshToken).not.toBe(first);

      const reused = await api().post('/api/auth/refresh').send({ refreshToken: first });
      expect(reused.status).toBe(401);

      const again = await api().post('/api/auth/refresh').send({ refreshToken: refreshed.body.refreshToken });
      expect(again.status).toBe(200);
    });

    it('logout revokes the refresh token', async () => {
      const user = await createUser();
      const login = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });
      const out = await api().post('/api/auth/logout').send({ refreshToken: login.body.refreshToken });
      expect(out.status).toBe(204);
      const res = await api().post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
      expect(res.status).toBe(401);
    });

    it('rejects an unknown refresh token', async () => {
      const res = await api().post('/api/auth/refresh').send({ refreshToken: 'definitely-not-a-real-token' });
      expect(res.status).toBe(401);
    });
  });

  describe('profile', () => {
    it('requires a valid access token', async () => {
      expect((await api().get('/api/auth/me')).status).toBe(401);
      expect((await api().get('/api/auth/me').set('Authorization', 'Bearer garbage')).status).toBe(401);
    });

    it('updates the display name', async () => {
      const user = await createUser();
      const res = await api().patch('/api/auth/me').set(user.auth).send({ name: '  Renamed  ' });
      expect(res.status).toBe(200);
      expectSchema(MeSchema, res.body);
      expect(res.body.name).toBe('Renamed');
    });

    it('changes the password, signs out other sessions and emails the user', async () => {
      const user = await createUser();
      const login = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });

      const wrong = await api()
        .post('/api/auth/password')
        .set(user.auth)
        .send({ currentPassword: 'wrong-one', newPassword: 'brand-new-password' });
      expect(wrong.status).toBe(401);

      const res = await api()
        .post('/api/auth/password')
        .set(user.auth)
        .send({ currentPassword: PASSWORD, newPassword: 'brand-new-password' });
      expect(res.status).toBe(204);

      expect((await api().post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken })).status).toBe(401);
      expect((await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD })).status).toBe(401);
      expect((await api().post('/api/auth/login').send({ email: user.email, password: 'brand-new-password' })).status).toBe(200);
      expect(sentMail.some((m) => m.to === user.email && m.subject.includes('password was changed'))).toBe(true);
    });
  });
});
