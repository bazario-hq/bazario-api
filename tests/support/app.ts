import supertest from 'supertest';
import { afterAll, beforeEach } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDb } from '../../src/db/index.js';
import { sentMail } from '../../src/lib/mailer.js';
import { homeService } from '../../src/modules/catalog/home.service.js';
import { resetDb } from './factories.js';

export const app = createApp();
export const api = () => supertest(app);

/** Standard hooks for an integration test file: clean tables between tests. */
export function useTestDb() {
  beforeEach(async () => {
    await resetDb();
    sentMail.length = 0;
    homeService.clearCache();
  });
  afterAll(async () => {
    await closeDb();
  });
}
