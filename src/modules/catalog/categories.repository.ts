import { db } from '../../db/index.js';

export const categoriesRepository = {
  all() {
    return db.selectFrom('categories').selectAll().orderBy('position').orderBy('name').execute();
  },

  findBySlug(slug: string) {
    return db.selectFrom('categories').selectAll().where('slug', '=', slug).executeTakeFirst();
  },

  findById(id: number) {
    return db.selectFrom('categories').selectAll().where('id', '=', id).executeTakeFirst();
  },
};
