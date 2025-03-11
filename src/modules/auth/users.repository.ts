import { db } from '../../db/index.js';
import type { NewUser } from '../../db/types.js';

export const usersRepository = {
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

export const refreshTokensRepository = {
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
