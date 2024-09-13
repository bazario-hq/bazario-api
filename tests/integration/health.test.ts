import { describe, expect, it } from 'vitest';
import { api, useTestDb } from '../support/app.js';

describe('infra endpoints', () => {
  useTestDb();

  it('reports healthy when the database is reachable', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
