import { db } from '../../db/index.js';

export const sellersRepository = {
  findById(id: number) {
    return db.selectFrom('sellers').selectAll().where('id', '=', id).executeTakeFirst();
  },

  findBySlug(slug: string) {
    return db.selectFrom('sellers').selectAll().where('slug', '=', slug).executeTakeFirst();
  },

  findByUserId(userId: number) {
    return db.selectFrom('sellers').selectAll().where('user_id', '=', userId).executeTakeFirst();
  },

  slugExists(slug: string) {
    return db.selectFrom('sellers').select('id').where('slug', '=', slug).executeTakeFirst();
  },

  create(values: { user_id: number; store_name: string; slug: string; description: string | null; support_email: string | null }) {
    return db.insertInto('sellers').values(values).returningAll().executeTakeFirstOrThrow();
  },

  update(id: number, values: { store_name?: string; description?: string | null; support_email?: string | null; logo_key?: string | null }) {
    return db
      .updateTable('sellers')
      .set({ ...values, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};
