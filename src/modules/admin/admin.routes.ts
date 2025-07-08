import { Router } from 'express';
import { route } from '../../lib/route.js';
import { registry } from '../../openapi/registry.js';
import { z } from '../../openapi/zod.js';
import { IdParams, PageMeta } from '../common/schemas.js';
import { adminService } from './admin.service.js';

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

const ModerationReview = registry.register(
  'ModerationReview',
  z.object({
    id: z.number().int(),
    rating: z.number().int(),
    title: z.string(),
    body: z.string(),
    status: z.enum(['published', 'pending', 'rejected']),
    moderationNote: z.string().nullable(),
    author: z.object({ id: z.number().int(), name: z.string() }),
    product: z.object({ id: z.number().int(), name: z.string() }),
    createdAt: z.string(),
  }),
);

const ReportOverview = registry.register(
  'ReportOverview',
  z.object({
    totals: z.object({
      gmvCents: z.number().int(),
      orders: z.number().int(),
      users: z.number().int(),
      activeProducts: z.number().int(),
      activeSellers: z.number().int(),
    }),
    months: z.array(
      z.object({
        month: z.string(),
        orders: z.number().int(),
        gmvCents: z.number().int(),
        buyers: z.number().int(),
        signups: z.number().int(),
      }),
    ),
    topSellers: z.array(
      z.object({ sellerId: z.number().int(), storeName: z.string(), gmvCents: z.number().int(), orders: z.number().int() }),
    ),
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
    path: '/reviews',
    summary: 'Review moderation queue (oldest first)',
    tags,
    roles,
    query: z.object({ status: z.enum(['published', 'pending', 'rejected']).default('pending'), ...pageParams }),
    responses: {
      200: { description: 'Reviews', schema: z.object({ items: z.array(ModerationReview), meta: PageMeta }) },
    },
  },
  ({ query }) => adminService.listReviews(query),
);

route(
  adminRouter,
  mount,
  {
    method: 'patch',
    path: '/reviews/{id}',
    summary: 'Publish or reject a review',
    tags,
    roles,
    params: IdParams,
    body: z.object({ status: z.enum(['published', 'rejected']), note: z.string().max(500).optional() }),
    responses: {
      200: { description: 'Updated', schema: z.object({ id: z.number().int(), status: z.string() }) },
      404: { description: 'Not found' },
    },
  },
  ({ req, params, body }) => adminService.moderateReview(req, params.id, body),
);

route(
  adminRouter,
  mount,
  {
    method: 'get',
    path: '/reports/overview',
    summary: 'Platform totals and monthly trends',
    tags,
    roles,
    query: z.object({ months: z.coerce.number().int().min(1).max(36).default(12) }),
    responses: { 200: { description: 'Report', schema: ReportOverview } },
  },
  ({ query }) => adminService.reportOverview(query.months),
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
