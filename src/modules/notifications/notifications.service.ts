import { sql } from 'kysely';
import { db } from '../../db/index.js';
import { notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/pagination.js';

export interface NotificationInput {
  type: string;
  title: string;
  body: string;
  link?: string | null;
}

function toNotification(n: {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: Date | null;
  created_at: Date;
}) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    read: n.read_at !== null,
    createdAt: n.created_at.toISOString(),
  };
}

export const notificationsService = {
  async notify(userId: number, input: NotificationInput) {
    await db
      .insertInto('notifications')
      .values({ user_id: userId, type: input.type, title: input.title, body: input.body, link: input.link ?? null })
      .execute();
  },

  async list(userId: number, opts: { unreadOnly: boolean; page: number; pageSize: number }) {
    let q = db.selectFrom('notifications').where('user_id', '=', userId);
    if (opts.unreadOnly) q = q.where('read_at', 'is', null);

    const rows = await q
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize)
      .execute();
    const { count } = await q.select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirstOrThrow();
    return { items: rows.map(toNotification), meta: pageMeta(opts.page, opts.pageSize, Number(count)) };
  },

  async unreadCount(userId: number) {
    const { count } = await db
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(count);
  },

  async markRead(userId: number, id: number) {
    const result = await db
      .updateTable('notifications')
      .set({ read_at: sql`coalesce(read_at, now())` })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) throw notFound('Notification');
  },

  async markAllRead(userId: number) {
    const result = await db
      .updateTable('notifications')
      .set({ read_at: new Date() })
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  },
};
