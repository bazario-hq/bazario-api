import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import { api, useTestDb } from '../support/app.js';
import {
  createAdmin,
  createCategory,
  createOrder,
  createProduct,
  createReview,
  createSeller,
  createUser,
  PASSWORD,
} from '../support/factories.js';

describe('admin', () => {
  useTestDb();

  describe('users', () => {
  });

  describe('sellers', () => {
  });
});
