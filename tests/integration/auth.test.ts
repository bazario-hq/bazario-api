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
  });

  describe('login', () => {
  });

  describe('profile', () => {
  });
});
