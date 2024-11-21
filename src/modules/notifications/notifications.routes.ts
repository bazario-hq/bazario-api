import { Router } from 'express';
import { registry } from '../../openapi/registry.js';
import { z } from '../../openapi/zod.js';
import { route } from '../../lib/route.js';
import { IdParams, PageMeta } from '../common/schemas.js';
import { notificationsService } from './notifications.service.js';

export const notificationsRouter = Router();
const mount = '/notifications';
const tags = ['Notifications'];

const NotificationSchema = registry.register(
  'Notification',
  z.object({
    id: z.number().int(),
    type: z.string(),
    title: z.string(),
    body: z.string(),
    link: z.string().nullable(),
    read: z.boolean(),
    createdAt: z.string(),
  }),
);

route(
  notificationsRouter,
  mount,
  {
    method: 'get',
    path: '',
    summary: 'Your notifications, newest first',
    tags,
    auth: 'required',
    query: z.object({
      unreadOnly: z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(20),
    }),
    responses: {
      200: {
        description: 'Notifications',
        schema: registry.register('NotificationList', z.object({ items: z.array(NotificationSchema), meta: PageMeta })),
      },
    },
  },
  ({ user, query }) => notificationsService.list(user.id, query),
);

route(
  notificationsRouter,
  mount,
  {
    method: 'get',
    path: '/unread-count',
    summary: 'Number of unread notifications (polled by the header badge)',
    tags,
    auth: 'required',
    responses: { 200: { description: 'Count', schema: z.object({ count: z.number().int() }) } },
  },
  async ({ user }) => ({ count: await notificationsService.unreadCount(user.id) }),
);

route(
  notificationsRouter,
  mount,
  {
    method: 'post',
    path: '/{id}/read',
    summary: 'Mark a notification as read',
    tags,
    auth: 'required',
    params: IdParams,
    responses: { 204: { description: 'Marked as read' } },
  },
  async ({ user, params }) => {
    await notificationsService.markRead(user.id, params.id);
  },
);

route(
  notificationsRouter,
  mount,
  {
    method: 'post',
    path: '/read-all',
    summary: 'Mark all notifications as read',
    tags,
    auth: 'required',
    responses: { 200: { description: 'Updated count', schema: z.object({ updated: z.number().int() }) } },
  },
  async ({ user }) => ({ updated: await notificationsService.markAllRead(user.id) }),
);
