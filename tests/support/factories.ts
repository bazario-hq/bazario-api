import bcrypt from 'bcrypt';
import { sql } from 'kysely';
import { db } from '../../src/db/index.js';
import type { ShippingAddress, UserRole } from '../../src/db/types.js';
import { signAccessToken } from '../../src/lib/tokens.js';

export const PASSWORD = 'correct-horse-battery';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

let seq = 0;
const next = () => ++seq;

export const address: ShippingAddress = {
  fullName: 'Ada Buyer',
  line1: '12 Galle Road',
  city: 'Colombo',
  postalCode: '00300',
  country: 'LK',
  phone: null,
};

export interface TestUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  token: string;
  auth: { Authorization: string };
}

export async function createUser(overrides: { email?: string; name?: string; role?: UserRole; status?: 'active' | 'suspended' } = {}) {
  const n = next();
  const user = await db
    .insertInto('users')
    .values({
      email: overrides.email ?? `user${n}@example.test`,
      name: overrides.name ?? `User ${n}`,
      password_hash: PASSWORD_HASH,
      role: overrides.role ?? 'buyer',
      status: overrides.status ?? 'active',
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const seller = await db.selectFrom('sellers').select(['id', 'status']).where('user_id', '=', user.id).executeTakeFirst();
  return withToken(user, seller?.status === 'active' ? seller.id : null);
}

function withToken(user: { id: number; email: string; name: string; role: UserRole }, sellerId: number | null): TestUser {
  const token = signAccessToken({ sub: user.id, role: user.role, sellerId });
  return { id: user.id, email: user.email, name: user.name, role: user.role, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function createSeller(overrides: { storeName?: string; status?: 'pending' | 'active' | 'suspended' } = {}) {
  const user = await createUser({ role: overrides.status === 'pending' ? 'buyer' : 'seller' });
  const n = next();
  const storeName = overrides.storeName ?? `Store ${n}`;
  const seller = await db
    .insertInto('sellers')
    .values({
      user_id: user.id,
      store_name: storeName,
      slug: `store-${n}`,
      description: `${storeName} sells good things`,
      support_email: null,
      status: overrides.status ?? 'active',
      approved_at: overrides.status === 'pending' ? null : new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { user: withToken(user, seller.status === 'active' ? seller.id : null), seller };
}

export async function createCategory(overrides: { name?: string; parentId?: number | null; slug?: string } = {}) {
  const n = next();
  const name = overrides.name ?? `Category ${n}`;
  return db
    .insertInto('categories')
    .values({ name, slug: overrides.slug ?? `category-${n}`, parent_id: overrides.parentId ?? null, position: n })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function createProduct(
  sellerId: number,
  categoryId: number,
  overrides: Partial<{
    name: string;
    description: string;
    priceCents: number;
    compareAtCents: number | null;
    stock: number;
    status: 'draft' | 'active' | 'archived';
    ratingAvg: number;
    ratingCount: number;
    salesCount: number;
    publishedAt: Date;
  }> = {},
) {
  const n = next();
  const status = overrides.status ?? 'active';
  return db
    .insertInto('products')
    .values({
      seller_id: sellerId,
      category_id: categoryId,
      name: overrides.name ?? `Product ${n}`,
      slug: `product-${n}`,
      description: overrides.description ?? `A fine product number ${n}.`,
      price_cents: overrides.priceCents ?? 1999,
      compare_at_cents: overrides.compareAtCents ?? null,
      stock: overrides.stock ?? 10,
      status,
      specs: JSON.stringify({ material: 'cotton' }),
      rating_avg: overrides.ratingAvg ?? 0,
      rating_count: overrides.ratingCount ?? 0,
      sales_count: overrides.salesCount ?? 0,
      published_at: status === 'active' ? (overrides.publishedAt ?? new Date(Date.now() - n * 1000)) : null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function addImage(productId: number, position = 0) {
  const n = next();
  const base = `products/${productId}/img${n}`;
  return db
    .insertInto('product_images')
    .values({
      product_id: productId,
      storage_key: `${base}/original.jpg`,
      variants: JSON.stringify({ thumb: `${base}/thumb.jpg`, medium: `${base}/medium.jpg`, large: `${base}/large.jpg` }),
      width: 1600,
      height: 1200,
      position,
      alt_text: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Inserts an order directly, bypassing checkout. */
export async function createOrder(
  buyerId: number,
  lines: { product: { id: number; seller_id: number; name: string; price_cents: number }; quantity: number; status?: 'pending' | 'shipped' | 'delivered' | 'cancelled' }[],
  opts: { createdAt?: Date } = {},
) {
  const subtotal = lines.reduce((s, l) => s + l.product.price_cents * l.quantity, 0);
  const createdAt = opts.createdAt ?? new Date();
  const order = await db
    .insertInto('orders')
    .values({
      buyer_id: buyerId,
      subtotal_cents: subtotal,
      shipping_cents: 0,
      total_cents: subtotal,
      shipping_address: JSON.stringify(address),
      payment_ref: `ch_test_${next()}`,
      payment_last4: '4242',
      created_at: createdAt,
      updated_at: createdAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  for (const l of lines) {
    await db
      .insertInto('order_items')
      .values({
        order_id: order.id,
        product_id: l.product.id,
        seller_id: l.product.seller_id,
        product_name: l.product.name,
        unit_price_cents: l.product.price_cents,
        quantity: l.quantity,
        status: l.status ?? 'pending',
        created_at: createdAt,
      })
      .execute();
  }
  return order;
}

export async function createReview(productId: number, userId: number, rating: number, overrides: { title?: string; body?: string; status?: 'published' | 'pending' | 'rejected'; createdAt?: Date } = {}) {
  return db
    .insertInto('reviews')
    .values({
      product_id: productId,
      user_id: userId,
      rating,
      title: overrides.title ?? `Rated ${rating}`,
      body: overrides.body ?? 'Does what it says.',
      status: overrides.status ?? 'published',
      created_at: overrides.createdAt ?? new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

const TABLES = [
  'audit_log',
  'notifications',
  'inventory_adjustments',
  'payouts',
  'order_items',
  'orders',
  'cart_items',
  'wishlist_items',
  'reviews',
  'product_images',
  'products',
  'sellers',
  'categories',
  'refresh_tokens',
  'users',
];

export async function resetDb() {
  await sql.raw(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`).execute(db);
}
