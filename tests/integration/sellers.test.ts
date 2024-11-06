import { describe, expect, it } from 'vitest';
import { Storefront } from '../../src/modules/sellers/sellers.schemas.js';
import { api, useTestDb } from '../support/app.js';
import { createCategory, createProduct, createReview, createSeller, createUser } from '../support/factories.js';
import { expectSchema } from '../support/schema.js';

describe('sellers', () => {
  useTestDb();

  it('lets a buyer apply for a seller account', async () => {
    const user = await createUser();
    const res = await api()
      .post('/api/sellers/apply')
      .set(user.auth)
      .send({ storeName: 'Ceylon Tea Corner', description: 'Single-estate teas', supportEmail: 'help@tea.example.test' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ storeName: 'Ceylon Tea Corner', slug: 'ceylon-tea-corner', status: 'pending' });

    expect((await api().post('/api/sellers/apply').set(user.auth).send({ storeName: 'Again' })).status).toBe(409);
  });

  it('makes store slugs unique', async () => {
    const a = await createUser();
    const b = await createUser();
    await api().post('/api/sellers/apply').set(a.auth).send({ storeName: 'Spice Box' });
    const res = await api().post('/api/sellers/apply').set(b.auth).send({ storeName: 'Spice Box' });
    expect(res.body.slug).toMatch(/^spice-box-[a-z0-9]+$/);
  });
});
