import { describe, expect, it } from 'vitest';
import { api, useTestDb } from '../support/app.js';

describe('infra endpoints', () => {
  useTestDb();

  it('reports healthy when the database is reachable', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('exposes prometheus metrics', async () => {
    await api().get('/api/categories');
    const res = await api().get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toContain('http_request_duration_seconds_bucket');
  });
});
