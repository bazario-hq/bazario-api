import type pg from 'pg';
import { ADJECTIVES, CATEGORY_TREE, COLOURS, SEARCH_SUFFIXES } from './catalog-data.js';
import { SEED_PASSWORD, SIZES, type SeedSize } from './sizes.js';

/**
 * Facts about a seeded database that the load generator needs: which accounts
 * exist, which products are popular, which sellers are large. Written as JSON
 * next to the k6 scenarios (bazario-infra/loadgen/data).
 */
export async function buildManifest(client: pg.Client, size: SeedSize, seed: number) {
  const cfg = SIZES[size];
  const q = async <T>(text: string, values: unknown[] = []) => (await client.query(text, values)).rows as T[];

  const admins = await q<{ email: string }>(`select email from users where role = 'admin' and status = 'active' order by id`);

  const buyers = await q<{ email: string }>(`
    select u.email from users u
     where u.role = 'buyer' and u.status = 'active'
       and u.id in (select buyer_id from orders)
     order by md5(u.id::text) limit 3000`);

  const powerBuyers = await q<{ email: string; orders: number }>(`
    select u.email, o.n::int as orders
      from (select buyer_id, count(*) as n from orders group by buyer_id order by n desc limit 100) o
      join users u on u.id = o.buyer_id
     where u.status = 'active'
     order by o.n desc`);

  const sellerRows = await q<{ id: number; slug: string; email: string; products: number }>(`
    select s.id::int, s.slug, u.email, count(p.id)::int as products
      from sellers s
      join users u on u.id = s.user_id
      join products p on p.seller_id = s.id and p.status = 'active'
     where s.status = 'active' and u.status = 'active'
     group by s.id, s.slug, u.email
     order by products desc`);
  const big = sellerRows.slice(0, cfg.bigSellers);
  const small = sellerRows.slice(cfg.bigSellers).filter((s) => s.products >= 5);
  const sampleSmall = small.filter((_, i) => i % Math.max(1, Math.floor(small.length / 200)) === 0).slice(0, 200);

  const productsOf = async (sellerId: number, limit: number) =>
    (await q<{ id: number }>(`select id::int from products where seller_id = $1 and status = 'active' order by md5(id::text) limit $2`, [sellerId, limit])).map((r) => r.id);

  const bigSellers = [];
  for (const s of big) bigSellers.push({ ...s, productIds: await productsOf(s.id, 1500) });
  const otherSellers = [];
  for (const s of sampleSmall) otherSellers.push({ ...s, productIds: await productsOf(s.id, 100) });

  const popular = (
    await q<{ id: number }>(`
      select p.id::int from products p join sellers s on s.id = p.seller_id
       where p.status = 'active' and s.status = 'active' and p.stock > 20
       order by p.sales_count desc limit 1000`)
  ).map((r) => r.id);

  const reviewHeavy = (
    await q<{ id: number }>(`
      select p.id::int from products p join sellers s on s.id = p.seller_id
       where p.status = 'active' and s.status = 'active'
       order by p.rating_count desc limit 200`)
  ).map((r) => r.id);

  // Promo products for flash sales: popular listings from the big sellers, stocked deep.
  const flashSale = (
    await q<{ id: number }>(
      `select p.id::int from products p
        where p.status = 'active' and p.seller_id = any($1::bigint[])
        order by p.sales_count desc limit 5`,
      [big.map((s) => s.id)],
    )
  ).map((r) => r.id);
  if (flashSale.length) await client.query(`update products set stock = greatest(stock, 50000) where id = any($1::bigint[])`, [flashSale]);

  const [{ max_id: maxProductId }] = await q<{ max_id: number }>(`select max(id)::int as max_id from products`);

  const categories = await q<{ slug: string; depth: number }>(`
    with recursive tree as (
      select id, slug, 0 as depth from categories where parent_id is null
      union all
      select c.id, c.slug, t.depth + 1 from categories c join tree t on c.parent_id = t.id
    ) select slug, depth from tree order by depth, slug`);

  const storefronts = (
    await q<{ slug: string }>(`select slug from sellers where status = 'active' order by md5(id::text) limit 500`)
  ).map((r) => r.slug);

  const nouns = [...new Set(CATEGORY_TREE.flatMap((t) => t.subs.flatMap((s) => s.leaves.flatMap((l) => l.nouns))))];
  const materials = [...new Set(CATEGORY_TREE.flatMap((t) => t.materials))];

  return {
    size,
    seed,
    generatedAt: new Date().toISOString(),
    password: SEED_PASSWORD,
    admins: admins.map((a) => a.email),
    buyers: buyers.map((b) => b.email),
    powerBuyers,
    bigSellers,
    otherSellers,
    products: { maxId: maxProductId, popular, reviewHeavy, flashSale },
    categories,
    storefronts,
    vocabulary: { nouns, materials, adjectives: ADJECTIVES, colours: COLOURS, suffixes: SEARCH_SUFFIXES },
  };
}
