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
  });

  describe('login', () => {
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
  });

  describe('profile', () => {
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
