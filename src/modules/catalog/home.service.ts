import { sql } from 'kysely';
import { db } from '../../db/index.js';
import { categoriesService } from './categories.service.js';
import { toProductCards } from './product-card.js';

const HOME_TTL_MS = 60 * 1000;
const SECTION_SIZE = 12;

let cached: { expiresAt: number; value: Awaited<ReturnType<typeof buildHome>> } | null = null;

function activeProducts() {
  return db
    .selectFrom('products')
    .innerJoin('sellers', 'sellers.id', 'products.seller_id')
    .selectAll('products')
    .select(['sellers.store_name as seller_store_name', 'sellers.slug as seller_slug'])
    .where('products.status', '=', 'active')
    .where('sellers.status', '=', 'active');
}

async function trending() {
  const top = await db
    .selectFrom('order_items')
    .select(['product_id', (eb) => eb.fn.sum<number>('quantity').as('units')])
    .where('created_at', '>', sql<Date>`now() - interval '7 days'`)
    .where('status', '!=', 'cancelled')
    .groupBy('product_id')
    .orderBy('units', 'desc')
    .limit(SECTION_SIZE * 2)
    .execute();
  if (top.length === 0) return [];

  const rows = await activeProducts()
    .where(
      'products.id',
      'in',
      top.map((t) => t.product_id),
    )
    .execute();
  const rank = new Map(top.map((t, i) => [t.product_id, i]));
  rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return toProductCards(rows.slice(0, SECTION_SIZE));
}

async function buildHome() {
  const categories = await categoriesService.topLevel();
  const trendingCards = await trending();
  const newArrivals = await toProductCards(
    await activeProducts().orderBy('products.published_at', 'desc').limit(SECTION_SIZE).execute(),
  );
  const topRated = await toProductCards(
    await activeProducts()
      .where('products.rating_count', '>=', 5)
      .orderBy('products.rating_avg', 'desc')
      .orderBy('products.rating_count', 'desc')
      .limit(SECTION_SIZE)
      .execute(),
  );
  const deals = await toProductCards(
    await activeProducts()
      .where('products.compare_at_cents', '>', sql<number>`products.price_cents`)
      .orderBy(sql`(products.compare_at_cents - products.price_cents)::float / products.compare_at_cents`, 'desc')
      .limit(SECTION_SIZE)
      .execute(),
  );

  return {
    categories,
    trending: trendingCards,
    newArrivals,
    topRated,
    deals,
    generatedAt: new Date().toISOString(),
  };
}

export const homeService = {
  async get() {
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await buildHome();
    cached = { value, expiresAt: Date.now() + HOME_TTL_MS };
    return value;
  },

  clearCache() {
    cached = null;
  },
};
