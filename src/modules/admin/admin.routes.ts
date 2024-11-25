import { Router } from 'express';
import { route } from '../../lib/route.js';
import { registry } from '../../openapi/registry.js';
import { z } from '../../openapi/zod.js';
import { IdParams, PageMeta } from '../common/schemas.js';
import type { Request } from 'express';
import { sql } from 'kysely';
import { db } from '../../db/index.js';
import type { ReviewStatus, SellerStatus, UserRole, UserStatus } from '../../db/types.js';
import { recordAudit } from '../../lib/audit.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { sendMail } from '../../lib/mailer.js';
import { pageMeta } from '../../lib/pagination.js';
import { iso } from '../common/serializers.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { reviewsRepository } from '../reviews/reviews.repository.js';

const adminService = {
  async listUsers(opts: { q?: string; role?: UserRole; status?: UserStatus; page: number; pageSize: number }) {
    let q = db.selectFrom('users');
    if (opts.q) {
      const term = `%${opts.q}%`;
      q = q.where((eb) => eb.or([eb('email', 'ilike', term), eb('name', 'ilike', term)]));
    }
    if (opts.role) q = q.where('role', '=', opts.role);
    if (opts.status) q = q.where('status', '=', opts.status);

    const rows = await q
      .select(['id', 'email', 'name', 'role', 'status', 'created_at', 'last_login_at'])
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize)
      .execute();
    const { count } = await q.select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirstOrThrow();

    return {
      items: rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        createdAt: u.created_at.toISOString(),
        lastLoginAt: iso(u.last_login_at),
      })),
      meta: pageMeta(opts.page, opts.pageSize, Number(count)),
    };
  },

  async updateUser(req: Request, id: number, input: { status?: UserStatus; role?: UserRole }) {
    if (id === req.user!.id) throw badRequest('You cannot change your own account here');
    const user = await db
      .updateTable('users')
      .set({ ...input, updated_at: new Date() })
      .where('id', '=', id)
      .returning(['id', 'email', 'name', 'role', 'status', 'created_at', 'last_login_at'])
      .executeTakeFirst();
    if (!user) throw notFound('User');

    await recordAudit(req, { action: 'admin.user.update', entityType: 'user', entityId: id, metadata: input });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      createdAt: user.created_at.toISOString(),
      lastLoginAt: iso(user.last_login_at),
    };
  },

  async listSellers(opts: { status?: SellerStatus; page: number; pageSize: number }) {
    let q = db.selectFrom('sellers').innerJoin('users', 'users.id', 'sellers.user_id');
    if (opts.status) q = q.where('sellers.status', '=', opts.status);

    const rows = await q
      .select([
        'sellers.id',
        'sellers.store_name',
        'sellers.slug',
        'sellers.status',
        'sellers.created_at',
        'sellers.approved_at',
        'users.email as owner_email',
        'users.name as owner_name',
        (eb) =>
          eb
            .selectFrom('products')
            .select(eb.fn.countAll<number>().as('n'))
            .whereRef('products.seller_id', '=', 'sellers.id')
            .where('products.status', '=', 'active')
            .as('product_count'),
      ])
      .orderBy('sellers.created_at', 'desc')
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize)
      .execute();
    const { count } = await q.select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirstOrThrow();

    return {
      items: rows.map((s) => ({
        id: s.id,
        storeName: s.store_name,
        slug: s.slug,
        status: s.status,
        ownerEmail: s.owner_email,
        ownerName: s.owner_name,
        productCount: Number(s.product_count ?? 0),
        createdAt: s.created_at.toISOString(),
        approvedAt: iso(s.approved_at),
      })),
      meta: pageMeta(opts.page, opts.pageSize, Number(count)),
    };
  },

  async updateSellerStatus(req: Request, id: number, status: SellerStatus) {
    const seller = await db.selectFrom('sellers').selectAll().where('id', '=', id).executeTakeFirst();
    if (!seller) throw notFound('Seller');

    await db
      .updateTable('sellers')
      .set({
        status,
        approved_at: status === 'active' && !seller.approved_at ? new Date() : undefined,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .execute();

    const owner = await db.selectFrom('users').select(['id', 'email', 'name', 'role']).where('id', '=', seller.user_id).executeTakeFirstOrThrow();
    if (status === 'active' && owner.role === 'buyer') {
      await db.updateTable('users').set({ role: 'seller', updated_at: new Date() }).where('id', '=', owner.id).execute();
    }

    if (status !== seller.status) {
      const message =
        status === 'active'
          ? `Your store ${seller.store_name} is live. Sign in again to open the seller dashboard.`
          : status === 'suspended'
            ? `Your store ${seller.store_name} has been suspended. Contact support for details.`
            : `Your store ${seller.store_name} is pending review.`;
      await notificationsService.notify(owner.id, { type: `seller.${status}`, title: 'Seller account update', body: message });
      await sendMail({ to: owner.email, subject: 'Your Bazario seller account', text: `Hi ${owner.name},\n\n${message}\n` });
    }

    await recordAudit(req, { action: 'admin.seller.status', entityType: 'seller', entityId: id, metadata: { from: seller.status, to: status } });
    return { id, status };
  },

  async auditLog(opts: { actorId?: number; entityType?: string; page: number; pageSize: number }) {
    let q = db.selectFrom('audit_log').leftJoin('users', 'users.id', 'audit_log.actor_id');
    if (opts.actorId) q = q.where('audit_log.actor_id', '=', opts.actorId);
    if (opts.entityType) q = q.where('audit_log.entity_type', '=', opts.entityType);

    const rows = await q
      .select([
        'audit_log.id',
        'audit_log.action',
        'audit_log.entity_type',
        'audit_log.entity_id',
        'audit_log.metadata',
        'audit_log.ip',
        'audit_log.created_at',
        'audit_log.actor_id',
        'users.email as actor_email',
      ])
      .orderBy('audit_log.id', 'desc')
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize)
      .execute();
    const { count } = await q.select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirstOrThrow();

    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        metadata: r.metadata as Record<string, unknown>,
        ip: r.ip,
        actor: r.actor_id ? { id: r.actor_id, email: r.actor_email ?? '' } : null,
        createdAt: r.created_at.toISOString(),
      })),
      meta: pageMeta(opts.page, opts.pageSize, Number(count)),
    };
  },
};

export const adminRouter = Router();
const mount = '/admin';
const tags = ['Admin'];
const roles = ['admin' as const];
const pageParams = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

const AdminUser = registry.register(
  'AdminUser',
  z.object({
    id: z.number().int(),
    email: z.string(),
    name: z.string(),
    role: z.enum(['buyer', 'seller', 'admin']),
    status: z.enum(['active', 'suspended']),
    createdAt: z.string(),
    lastLoginAt: z.string().nullable(),
  }),
);

const AdminSeller = registry.register(
  'AdminSeller',
  z.object({
    id: z.number().int(),
    storeName: z.string(),
    slug: z.string(),
    status: z.enum(['pending', 'active', 'suspended']),
    ownerEmail: z.string(),
    ownerName: z.string(),
    productCount: z.number().int(),
    createdAt: z.string(),
    approvedAt: z.string().nullable(),
  }),
);

const AuditEntry = registry.register(
  'AuditEntry',
  z.object({
    id: z.number().int(),
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().nullable(),
    metadata: z.record(z.unknown()),
    ip: z.string().nullable(),
    actor: z.object({ id: z.number().int(), email: z.string() }).nullable(),
    createdAt: z.string(),
  }),
);

route(
  adminRouter,
  mount,
  {
    method: 'get',
    path: '/users',
    summary: 'Search users',
    tags,
    roles,
    query: z.object({
      q: z.string().trim().max(100).optional(),
      role: z.enum(['buyer', 'seller', 'admin']).optional(),
      status: z.enum(['active', 'suspended']).optional(),
      ...pageParams,
    }),
    responses: { 200: { description: 'Users', schema: z.object({ items: z.array(AdminUser), meta: PageMeta }) } },
  },
  ({ query }) => adminService.listUsers(query),
);

route(
  adminRouter,
  mount,
  {
    method: 'patch',
    path: '/users/{id}',
    summary: 'Suspend, reactivate or change the role of a user',
    tags,
    roles,
    params: IdParams,
    body: z.object({
      status: z.enum(['active', 'suspended']).optional(),
      role: z.enum(['buyer', 'seller', 'admin']).optional(),
    }),
    responses: { 200: { description: 'User', schema: AdminUser }, 404: { description: 'Not found' } },
  },
  ({ req, params, body }) => adminService.updateUser(req, params.id, body),
);

route(
  adminRouter,
  mount,
  {
    method: 'get',
    path: '/sellers',
    summary: 'Seller accounts and applications',
    tags,
    roles,
    query: z.object({ status: z.enum(['pending', 'active', 'suspended']).optional(), ...pageParams }),
    responses: { 200: { description: 'Sellers', schema: z.object({ items: z.array(AdminSeller), meta: PageMeta }) } },
  },
  ({ query }) => adminService.listSellers(query),
);

route(
  adminRouter,
  mount,
  {
    method: 'patch',
    path: '/sellers/{id}',
    summary: 'Approve or suspend a seller',
    tags,
    roles,
    params: IdParams,
    body: z.object({ status: z.enum(['pending', 'active', 'suspended']) }),
    responses: {
      200: { description: 'Updated', schema: z.object({ id: z.number().int(), status: z.string() }) },
      404: { description: 'Not found' },
    },
  },
  ({ req, params, body }) => adminService.updateSellerStatus(req, params.id, body.status),
);

route(
  adminRouter,
  mount,
  {
    method: 'get',
    path: '/audit-log',
    summary: 'Audit trail of sensitive actions',
    tags,
    roles,
    query: z.object({
      actorId: z.coerce.number().int().positive().optional(),
      entityType: z.string().max(50).optional(),
      ...pageParams,
    }),
    responses: { 200: { description: 'Entries', schema: z.object({ items: z.array(AuditEntry), meta: PageMeta }) } },
  },
  ({ query }) => adminService.auditLog(query),
);
