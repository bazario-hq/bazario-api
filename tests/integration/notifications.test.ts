import { beforeEach, describe, expect, it } from 'vitest';
import { notificationsService } from '../../src/modules/notifications/notifications.service.js';
import { api, useTestDb } from '../support/app.js';
import { createUser } from '../support/factories.js';

describe('notifications', () => {
  useTestDb();

  let user: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    user = await createUser();
    for (let i = 1; i <= 3; i++) {
      await notificationsService.notify(user.id, { type: 'test', title: `Note ${i}`, body: 'Hello', link: null });
    }
  });

  it('lists notifications newest first and counts unread ones', async () => {
    const res = await api().get('/api/notifications').set(user.auth);
    expect(res.status).toBe(200);
    expect(res.body.items.map((n: { title: string }) => n.title)).toEqual(['Note 3', 'Note 2', 'Note 1']);
    expect(res.body.meta.total).toBe(3);

    const count = await api().get('/api/notifications/unread-count').set(user.auth);
    expect(count.body).toEqual({ count: 3 });
  });

  it('marks one or all as read', async () => {
    const list = await api().get('/api/notifications').set(user.auth);
    const first = list.body.items[0].id;

    expect((await api().post(`/api/notifications/${first}/read`).set(user.auth)).status).toBe(204);
    expect((await api().get('/api/notifications/unread-count').set(user.auth)).body.count).toBe(2);

    const unread = await api().get('/api/notifications').query({ unreadOnly: 'true' }).set(user.auth);
    expect(unread.body.items).toHaveLength(2);

    const all = await api().post('/api/notifications/read-all').set(user.auth);
    expect(all.body).toEqual({ updated: 2 });
    expect((await api().get('/api/notifications/unread-count').set(user.auth)).body.count).toBe(0);
  });

  it("cannot touch another user's notifications", async () => {
    const other = await createUser();
    const list = await api().get('/api/notifications').set(user.auth);
    expect((await api().post(`/api/notifications/${list.body.items[0].id}/read`).set(other.auth)).status).toBe(404);
    expect((await api().get('/api/notifications').set(other.auth)).body.items).toEqual([]);
  });
});
