import bcrypt from 'bcrypt';
import pg from 'pg';
import { config } from '../config.js';
import type { OrderItemStatus } from '../db/types.js';
import { shippingFor } from '../lib/money.js';
import { slugify } from '../lib/slug.js';
import { deriveOrderStatus } from '../modules/orders/orders.service.js';
import { CATEGORY_TREE, CITIES, COLOURS, ADJECTIVES, FIRST_NAMES, LAST_NAMES, SPEC_KEYS, STORE_PREFIX, STORE_SUFFIX, STREETS, VARIANTS } from './catalog-data.js';
import { CopyWriter } from './copy.js';
import { imagePool, type PoolImage } from './images.js';
import { Rng, WeightedSampler } from './random.js';
import { FEATURE_DATES, GROWTH, HISTORY_DAYS, SIZES, type SeedSize, type SizeConfig } from './sizes.js';
import { productDescription, reviewText, storeDescription } from './text.js';
import { DAY_MS, Timeline } from './timeline.js';

const HOUR_MS = 3_600_000;
const BIG_SELLER_NAMES = ['Ceylon Home Collective', 'Island Kitchen Co.', 'Lanka Style House', 'Spice Route Trading Co.', 'Monsoon Living'];
const BIG_SELLER_SPLIT = [0.34, 0.24, 0.18, 0.13, 0.11];
const ADMINS = [
  { email: 'admin@bazario.example', name: 'Platform Admin' },
  { email: 'ops@bazario.example', name: 'Seller Ops' },
  { email: 'trust@bazario.example', name: 'Trust & Safety' },
];
const CARD_LAST4 = ['4242', '4444', '1881', '0005', '5556', '3220'];

const enum PStatus {
  Active = 0,
  Draft = 1,
  Archived = 2,
}
const PRODUCT_STATUS = ['active', 'draft', 'archived'] as const;

export interface SeedOptions {
  size: SeedSize;
  seed: number;
  anchor: number;
  log: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Deterministic per-id values (no arrays needed, stable across growth steps).

function mix(x: number) {
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}
function saltOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function hash01(seed: number, salt: string, id: number) {
  return mix(mix((id ^ saltOf(salt)) >>> 0) ^ seed) / 4294967296;
}

function personName(seed: number, userId: number) {
  const first = FIRST_NAMES[Math.floor(hash01(seed, 'first', userId) * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(hash01(seed, 'last', userId) * LAST_NAMES.length)];
  return { first, last, full: `${first} ${last}` };
}

function emailFor(seed: number, userId: number) {
  const { first, last } = personName(seed, userId);
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const domain = ['example.com', 'example.net', 'example.org'][userId % 3];
  return `${clean(first)}.${clean(last)}${userId}@${domain}`;
}

function addressFor(seed: number, userId: number) {
  const [city, country, postalCode] = CITIES[Math.floor(hash01(seed, 'city', userId) * CITIES.length)];
  const street = STREETS[Math.floor(hash01(seed, 'street', userId) * STREETS.length)];
  return {
    fullName: personName(seed, userId).full,
    line1: `${1 + Math.floor(hash01(seed, 'house', userId) * 240)} ${street}`,
    line2: null,
    city,
    postalCode,
    country,
    phone: null,
  };
}

/** Popularity weight: Pareto(alpha=1.25) gives a Zipf-like long tail (s ~ 0.8). */
function popularity(seed: number, productId: number) {
  return Math.min(Math.pow(1 - hash01(seed, 'popularity', productId), -0.8), 1e6);
}

function productQuality(seed: number, productId: number) {
  return 3.2 + hash01(seed, 'quality', productId) * 1.6;
}

// ---------------------------------------------------------------------------

interface CategoryRow {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  depth: number;
  top: number;
  materials: string[];
  nouns: string[];
}

function buildCategories(): CategoryRow[] {
  const rows: CategoryRow[] = [];
  const slugs = new Set<string>();
  const slugFor = (name: string, parent?: CategoryRow) => {
    let slug = slugify(name);
    if (slugs.has(slug) && parent) slug = `${parent.slug}-${slug}`;
    slugs.add(slug);
    return slug;
  };
  let id = 0;
  const tops: CategoryRow[] = [];
  CATEGORY_TREE.forEach((top, ti) => {
    const row: CategoryRow = { id: ++id, parentId: null, name: top.name, slug: slugFor(top.name), depth: 0, top: ti, materials: top.materials, nouns: [] };
    rows.push(row);
    tops.push(row);
  });
  CATEGORY_TREE.forEach((top, ti) => {
    for (const sub of top.subs) {
      const subRow: CategoryRow = {
        id: ++id,
        parentId: tops[ti].id,
        name: sub.name,
        slug: slugFor(sub.name, tops[ti]),
        depth: 1,
        top: ti,
        materials: top.materials,
        nouns: sub.leaves.flatMap((l) => l.nouns),
      };
      rows.push(subRow);
      for (const l of sub.leaves) {
        rows.push({ id: ++id, parentId: subRow.id, name: l.name, slug: slugFor(l.name, subRow), depth: 2, top: ti, materials: top.materials, nouns: l.nouns });
      }
    }
  });
  return rows;
}

interface SellerRow {
  id: number;
  userId: number;
  name: string;
  slug: string;
  status: 'active' | 'pending' | 'suspended';
  big: boolean;
  createdAt: number;
  approvedAt: number | null;
  city: string;
  focus: number[];
}

interface Catalogue {
  count: number;
  seller: Int32Array;
  category: Int32Array;
  price: Int32Array;
  status: Uint8Array;
  createdAt: Float64Array;
  stock: Int32Array;
  name: string[];
  weight: Float64Array;
}

// ---------------------------------------------------------------------------

export class SeedGenerator {
  private readonly cfg: SizeConfig;
  private readonly seed: number;
  private readonly anchor: number;
  private readonly start: number;
  private readonly log: (msg: string) => void;
  private readonly pool: PoolImage[];
  private hashes: string[] = [];
  private superuser = false;
  private clients: pg.Client[] = [];

  constructor(opts: SeedOptions) {
    this.cfg = SIZES[opts.size];
    this.seed = opts.seed;
    this.anchor = opts.anchor;
    this.start = Math.max(this.anchor - HISTORY_DAYS * DAY_MS, FEATURE_DATES.orders);
    this.log = opts.log;
    this.pool = imagePool(opts.seed, this.cfg.imagePool);
  }

  get imagePool() {
    return this.pool;
  }

  private async client() {
    const c = new pg.Client({ connectionString: config.DATABASE_URL, application_name: 'bazario-seed' });
    await c.connect();
    if (this.superuser) await c.query(`SET session_replication_role = replica`);
    await c.query(`SET synchronous_commit = off`);
    this.clients.push(c);
    return c;
  }

  private async closeClients() {
    await Promise.all(this.clients.map((c) => c.end()));
    this.clients = [];
  }

  private async passwordHashes() {
    // A handful of distinct salts is enough; every seeded account shares the demo password.
    if (this.hashes.length === 0) {
      const { SEED_PASSWORD } = await import('./sizes.js');
      for (let i = 0; i < 8; i++) this.hashes.push(await bcrypt.hash(SEED_PASSWORD, config.BCRYPT_ROUNDS));
    }
    return this.hashes;
  }

  // -------------------------------------------------------------------------
  // Full dataset

  async generate(admin: pg.Client) {
    const t0 = Date.now();
    const { rows } = await admin.query<{ rolsuper: boolean }>(`select rolsuper from pg_roles where rolname = current_user`);
    this.superuser = rows[0]?.rolsuper ?? false;
    const cfg = this.cfg;

    const categories = buildCategories();
    const sellers = this.buildSellers(categories);
    const catalogue = this.buildCatalogue(sellers, categories, cfg.products, 1, null);
    this.log(`planned ${categories.length} categories, ${sellers.length} sellers, ${catalogue.count} products`);

    const ownerBase = ADMINS.length;
    const buyerBase = ownerBase + sellers.length;
    const orderPlan = this.planOrders(cfg.orders, buyerBase, cfg.users, this.start, this.anchor, 'orders');

    const indexes = await this.dropIndexes(admin);
    const c1 = await this.client();

    await this.writeCategories(c1, categories);
    await this.writeUsers(c1, sellers, buyerBase, cfg.users, orderPlan.firstOrderAt);
    await this.writeSellers(c1, sellers);
    await this.writeProducts(sellers, categories, catalogue, 1);
    this.log(`catalogue written (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

    const stats = await this.writeOrders(orderPlan, catalogue, sellers, 1, 1);
    this.log(`orders written: ${stats.orders} orders, ${stats.items} items, ${stats.reviews} reviews, ${stats.notifications} notifications (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

    await this.writeWishlistsAndCarts(catalogue, sellers, buyerBase, cfg.users, orderPlan.firstOrderAt);
    await this.writeAudit(c1, sellers);
    await this.closeClients();

    await this.restoreIndexes(admin, indexes);
    this.log(`indexes rebuilt (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    await this.finish(admin, null);
    this.log(`aggregates, payouts and statistics done (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

  // -------------------------------------------------------------------------
  // Growth step: more buyers, products and recent orders on top of what is there.

  async grow(admin: pg.Client, step: number) {
    const t0 = Date.now();
    const { rows } = await admin.query<{ rolsuper: boolean }>(`select rolsuper from pg_roles where rolname = current_user`);
    this.superuser = rows[0]?.rolsuper ?? false;
    const cfg = this.cfg;

    const max = async (table: string) => Number((await admin.query(`select coalesce(max(id), 0) as m from ${table}`)).rows[0].m);
    const maxUser = await max('users');
    const maxProduct = await max('products');
    const maxOrder = await max('orders');
    const maxItem = await max('order_items');

    const categories = buildCategories();
    const catRows = (await admin.query<{ id: number; slug: string }>(`select id, slug from categories`)).rows;
    if (catRows.length !== categories.length) throw new Error('Category tree differs from the generator; grow needs a seeded database');
    const sellerRows = (
      await admin.query<{ id: string; user_id: string; store_name: string; slug: string; status: SellerRow['status']; created_at: Date; approved_at: Date | null }>(
        `select id, user_id, store_name, slug, status, created_at, approved_at from sellers order by id`,
      )
    ).rows;
    const planned = this.buildSellers(categories);
    const sellers: SellerRow[] = sellerRows.map((s) => {
      const p = planned.find((x) => x.id === Number(s.id));
      return {
        id: Number(s.id),
        userId: Number(s.user_id),
        name: s.store_name,
        slug: s.slug,
        status: s.status,
        big: p?.big ?? false,
        createdAt: s.created_at.getTime(),
        approvedAt: s.approved_at?.getTime() ?? null,
        city: p?.city ?? 'Colombo',
        focus: p?.focus ?? [0],
      };
    });

    const existing = (
      await admin.query<{ id: string; seller_id: string; category_id: string; price_cents: number; status: string; created_at: Date; stock: number; name: string }>(
        `select id, seller_id, category_id, price_cents, status, created_at, stock, name from products order by id`,
      )
    ).rows;

    const newProducts = Math.round(cfg.products * GROWTH.products);
    const window = GROWTH.windowDays * DAY_MS;
    const windowStart = this.anchor - window;
    const growthRng = new Rng(this.seed, `grow-${step}`);
    const added = this.buildCatalogue(sellers, categories, newProducts, maxProduct + 1, { from: windowStart - window, to: this.anchor, rng: growthRng });

    // Merge existing + new products into one catalogue indexed by product id.
    const total = maxProduct + newProducts;
    const catalogue: Catalogue = {
      count: total,
      seller: new Int32Array(total + 1),
      category: new Int32Array(total + 1),
      price: new Int32Array(total + 1),
      status: new Uint8Array(total + 1).fill(PStatus.Draft),
      createdAt: new Float64Array(total + 1),
      stock: new Int32Array(total + 1),
      name: new Array(total + 1).fill(''),
      weight: new Float64Array(total + 1),
    };
    const base = this.buildCatalogue(planned, categories, cfg.products, 1, null).weight;
    for (const p of existing) {
      const id = Number(p.id);
      catalogue.seller[id] = Number(p.seller_id);
      catalogue.category[id] = Number(p.category_id);
      catalogue.price[id] = p.price_cents;
      catalogue.status[id] = p.status === 'active' ? PStatus.Active : p.status === 'archived' ? PStatus.Archived : PStatus.Draft;
      catalogue.createdAt[id] = p.created_at.getTime();
      catalogue.stock[id] = p.stock;
      catalogue.name[id] = p.name;
      catalogue.weight[id] = catalogue.status[id] === PStatus.Active ? (id < base.length ? base[id] : popularity(this.seed, id)) : 0;
    }
    for (let i = 1; i <= newProducts; i++) {
      const id = maxProduct + i;
      catalogue.seller[id] = added.seller[i];
      catalogue.category[id] = added.category[i];
      catalogue.price[id] = added.price[i];
      catalogue.status[id] = added.status[i];
      catalogue.createdAt[id] = added.createdAt[i];
      catalogue.stock[id] = added.stock[i];
      catalogue.name[id] = added.name[i];
      catalogue.weight[id] = added.weight[i];
    }

    const newUsers = Math.round(cfg.users * GROWTH.users);
    const buyerBase = ADMINS.length + planned.length;
    const buyerCount = maxUser - buyerBase + newUsers;
    const orderPlan = this.planOrders(Math.round(cfg.orders * GROWTH.orders), buyerBase, buyerCount, windowStart, this.anchor, `grow-orders-${step}`);
    // Existing buyers keep their signup date; new ones sign up just before their first order.
    for (let b = 0; b < buyerCount - newUsers; b++) orderPlan.firstOrderAt[b] = Number.POSITIVE_INFINITY;

    const c1 = await this.client();
    await this.writeUsers(c1, [], buyerBase, buyerCount, orderPlan.firstOrderAt, maxUser + 1);
    await this.writeProducts(sellers, categories, added, maxProduct + 1);
    const reviewed = new Set<number>();
    const existingReviews = await admin.query({ text: 'select product_id, user_id from reviews', rowMode: 'array' });
    for (const [p, u] of existingReviews.rows as [string, string][]) reviewed.add(Number(p) * 4_194_304 + Number(u));
    const stats = await this.writeOrders(orderPlan, catalogue, sellers, maxOrder + 1, maxItem + 1, reviewed);
    this.log(`growth step ${step}: +${newUsers} users, +${newProducts} products, +${stats.orders} orders, +${stats.items} items, +${stats.reviews} reviews`);
    await this.closeClients();
    await this.finish(admin, { productFrom: 1, orderFrom: maxOrder + 1 });
    this.log(`growth step done (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

  // -------------------------------------------------------------------------
  // Planning (in memory)

  private buildSellers(categories: CategoryRow[]): SellerRow[] {
    const rng = new Rng(this.seed, 'sellers');
    const cfg = this.cfg;
    const tops = categories.filter((c) => c.depth === 0).length;
    const names = new Set<string>();
    const sellers: SellerRow[] = [];
    const bigSlots = new Set<number>();
    for (let i = 0; i < cfg.bigSellers; i++) bigSlots.add(2 + i * 7);

    const growth = new Timeline(this.start - 30 * DAY_MS, this.anchor - 2 * DAY_MS, 3);
    for (let i = 0; i < cfg.sellers; i++) {
      const id = i + 1;
      const big = bigSlots.has(id);
      let name: string;
      if (big) name = BIG_SELLER_NAMES[[...bigSlots].indexOf(id)];
      else {
        let attempt = 0;
        do {
          const pattern = rng.int(0, 2);
          name =
            pattern === 0
              ? `${rng.pick(STORE_PREFIX)} ${rng.pick(STORE_SUFFIX)}`
              : pattern === 1
                ? `${personName(this.seed, 100_000 + id + attempt).first}'s ${rng.pick(STORE_SUFFIX)}`
                : `${rng.pick(STORE_PREFIX)} ${rng.pick(['& Clay', '& Thread', '& Leaf', '& Grain', '& Salt', '& Stone', 'by the Sea', 'Hill', 'Lane'])}`;
          if (++attempt > 8) name = `${name} ${rng.pick(['Lanka', 'Ceylon', 'Island', 'Studio'])} ${id}`;
        } while (names.has(name));
      }
      names.add(name);

      const createdAt = big ? this.start + rng.int(5, 90) * DAY_MS : growth.sample(rng);
      const roll = rng.next();
      const status: SellerRow['status'] = big ? 'active' : createdAt > this.anchor - 10 * DAY_MS || roll < 0.025 ? 'pending' : roll < 0.05 ? 'suspended' : 'active';
      const focus = big ? Array.from({ length: tops }, (_, k) => k) : rng.shuffle(Array.from({ length: tops }, (_, k) => k)).slice(0, rng.int(1, 3));
      sellers.push({
        id,
        userId: ADMINS.length + id,
        name,
        slug: slugify(name),
        status,
        big,
        createdAt,
        approvedAt: status === 'pending' ? null : createdAt + rng.int(1, 6) * DAY_MS,
        city: rng.pick(CITIES.slice(0, 10))[0],
        focus,
      });
    }
    return sellers;
  }

  /**
   * Product metadata, sorted by creation time so ids follow time. Index 1..count
   * (index 0 unused) maps to product id `firstId + index - 1`.
   */
  private buildCatalogue(
    sellers: SellerRow[],
    categories: CategoryRow[],
    count: number,
    firstId: number,
    window: { from: number; to: number; rng: Rng } | null,
  ): Catalogue {
    const rng = window?.rng ?? new Rng(this.seed, 'products');
    const cfg = this.cfg;
    const live = sellers.filter((s) => s.status !== 'pending');
    const big = live.filter((s) => s.big);
    const small = live.filter((s) => !s.big);
    const smallSampler = new WeightedSampler(small.map(() => rng.logNormal(0, 1.2)));
    const bigShare = big.length ? cfg.bigSellerProductShare : 0;
    const bigSplit = BIG_SELLER_SPLIT.slice(0, big.length);
    const bigSampler = new WeightedSampler(bigSplit);
    const tops = categories.filter((c) => c.depth === 0);
    const leavesByTop = tops.map((t) => categories.filter((c) => c.top === t.top && c.depth > 0));
    const timeline = window ? new Timeline(window.from, window.to, 4) : new Timeline(this.start - 20 * DAY_MS, this.anchor - HOUR_MS, 4);

    const tmp: { seller: SellerRow; created: number }[] = [];
    for (let i = 0; i < count; i++) {
      const seller = rng.chance(bigShare) ? big[bigSampler.sample(rng)] : small[smallSampler.sample(rng)];
      const opened = seller.approvedAt ?? seller.createdAt;
      let created = timeline.sample(rng);
      if (created < opened) created = opened + rng.next() * Math.max(this.anchor - opened, HOUR_MS) * 0.5;
      tmp.push({ seller, created: Math.min(created, this.anchor - HOUR_MS) });
    }
    tmp.sort((a, b) => a.created - b.created);

    const cat: Catalogue = {
      count,
      seller: new Int32Array(count + 1),
      category: new Int32Array(count + 1),
      price: new Int32Array(count + 1),
      status: new Uint8Array(count + 1),
      createdAt: new Float64Array(count + 1),
      stock: new Int32Array(count + 1),
      name: new Array(count + 1).fill(''),
      weight: new Float64Array(count + 1),
    };

    for (let i = 1; i <= count; i++) {
      const { seller, created } = tmp[i - 1];
      const id = firstId + i - 1;
      const top = rng.pick(seller.focus);
      const choices = leavesByTop[top];
      const category = choices[Math.floor(Math.pow(rng.next(), 1.3) * choices.length)];
      const material = rng.pick(category.materials);
      const noun = rng.pick(category.nouns);
      const variant = rng.pick(VARIANTS);
      const name = `${rng.pick(ADJECTIVES)} ${material} ${noun}${variant ? ` - ${variant}` : ''}`;
      const priceBase = rng.logNormal(Math.log(2_400 + top * 150), 0.75);
      const price = Math.max(299, Math.round(priceBase / 100) * 100 - 1);
      const roll = rng.next();
      const status = roll < 0.03 ? PStatus.Draft : roll < 0.08 ? PStatus.Archived : PStatus.Active;
      let stock = rng.chance(0.06) ? 0 : rng.chance(0.1) ? rng.int(1, 5) : Math.round(rng.logNormal(Math.log(seller.big ? 120 : 30), 0.8));

      cat.seller[i] = seller.id;
      cat.category[i] = category.id;
      cat.price[i] = price;
      cat.status[i] = status;
      cat.createdAt[i] = created;
      cat.name[i] = name;
      cat.weight[i] = status === PStatus.Draft ? 0 : popularity(this.seed, id);
      if (cat.weight[i] > 200) stock = rng.int(500, 5_000);
      cat.stock[i] = stock;
    }

    if (!window) {
      // The best sellers have been around a while: move the heaviest weights onto older listings.
      const order = Array.from({ length: count }, (_, k) => k + 1).sort((a, b) => cat.weight[b] - cat.weight[a]);
      const oldLimit = Math.floor(count * 0.4);
      const swapRng = new Rng(this.seed, 'popular-swap');
      for (const idx of order.slice(0, Math.min(200, Math.floor(count / 20)))) {
        if (idx <= oldLimit) continue;
        const target = swapRng.int(1, oldLimit);
        if (cat.status[target] === PStatus.Draft) continue;
        [cat.weight[idx], cat.weight[target]] = [cat.weight[target], cat.weight[idx]];
        [cat.stock[idx], cat.stock[target]] = [cat.stock[target], cat.stock[idx]];
      }
    }
    return cat;
  }

  private planOrders(count: number, buyerBase: number, buyerCount: number, from: number, to: number, stream: string) {
    const cfg = this.cfg;
    const rng = new Rng(this.seed, stream);
    const timeline = new Timeline(from, to, 10);
    const times = timeline.sampleSorted(rng, count);

    // Buyer weights: most people order a few times, a few hundred order constantly.
    const weights = new Float64Array(buyerCount);
    let rest = 0;
    for (let b = 0; b < buyerCount; b++) {
      weights[b] = Math.exp(-1.2 + 1.1 * Math.sqrt(-2 * Math.log(1 - hash01(this.seed, 'buyer-u', b + 1) + 1e-12)) * Math.cos(2 * Math.PI * hash01(this.seed, 'buyer-v', b + 1)));
      rest += weights[b];
    }
    const power = Math.min(cfg.powerUsers, Math.floor(buyerCount / 10));
    const powerRng = new Rng(this.seed, 'power-users');
    const targets: number[] = [];
    for (let i = 0; i < power; i++) targets.push(powerRng.int(cfg.powerUserOrders[0], cfg.powerUserOrders[1]) * (count / cfg.orders));
    const powerTotal = targets.reduce((a, b) => a + b, 0);
    const powerIds = new Set<number>();
    for (let i = 0; i < power; i++) {
      const b = Math.floor(hash01(this.seed, 'power-pick', i) * buyerCount);
      if (powerIds.has(b)) continue;
      powerIds.add(b);
      rest -= weights[b];
      weights[b] = (targets[i] * rest) / Math.max(count - powerTotal, 1);
    }
    const sampler = new WeightedSampler(weights);
    const buyer = new Int32Array(count);
    const firstOrderAt = new Float64Array(buyerCount).fill(Number.POSITIVE_INFINITY);
    for (let i = 0; i < count; i++) {
      const b = sampler.sample(rng);
      buyer[i] = b;
      if (times[i] < firstOrderAt[b]) firstOrderAt[b] = times[i];
    }
    return { times, buyer, firstOrderAt, buyerBase };
  }

  // -------------------------------------------------------------------------
  // Writers

  private async writeCategories(client: pg.Client, categories: CategoryRow[]) {
    const w = await CopyWriter.open(client, 'categories', ['id', 'parent_id', 'name', 'slug', 'description', 'position', 'created_at']);
    for (const c of categories) {
      const position = categories.filter((x) => x.parentId === c.parentId && x.id < c.id).length + 1;
      await w.write([c.id, c.parentId, c.name, c.slug, `${c.name} from independent makers across Sri Lanka and beyond.`, position, new Date(this.start - 30 * DAY_MS)]);
    }
    await w.close();
  }

  private async writeUsers(client: pg.Client, sellers: SellerRow[], buyerBase: number, buyerCount: number, firstOrderAt: Float64Array, fromId = 1) {
    const hashes = await this.passwordHashes();
    const rng = new Rng(this.seed, `users-${fromId}`);
    const signups = new Timeline(this.start - 20 * DAY_MS, this.anchor - HOUR_MS, 6);
    const w = await CopyWriter.open(client, 'users', ['id', 'email', 'password_hash', 'name', 'role', 'status', 'last_login_at', 'created_at', 'updated_at']);
    const hash = (id: number) => hashes[id % hashes.length];

    if (fromId === 1) {
      for (const [i, a] of ADMINS.entries()) {
        const created = new Date(this.start - 60 * DAY_MS);
        await w.write([i + 1, a.email, hash(i + 1), a.name, 'admin', 'active', new Date(this.anchor - rng.int(1, 48) * HOUR_MS), created, created]);
      }
      for (const s of sellers) {
        const created = new Date(s.createdAt - rng.int(1, 30) * DAY_MS);
        const role = s.status === 'pending' ? 'buyer' : 'seller';
        await w.write([s.userId, emailFor(this.seed, s.userId), hash(s.userId), personName(this.seed, s.userId).full, role, 'active', new Date(this.anchor - rng.int(1, 400) * HOUR_MS), created, created]);
      }
    }

    for (let b = 0; b < buyerCount; b++) {
      const id = buyerBase + b + 1;
      if (id < fromId) continue;
      const first = firstOrderAt[b];
      let created = Number.isFinite(first) ? first - rng.next() * 30 * DAY_MS : signups.sample(rng);
      if (Number.isFinite(first) && created < this.start - 20 * DAY_MS) created = this.start - 20 * DAY_MS + rng.next() * Math.max(first - this.start, 0);
      const status = rng.chance(0.003) ? 'suspended' : 'active';
      const lastLogin = rng.chance(0.7) ? new Date(Math.max(created, this.anchor - rng.next() * 120 * DAY_MS)) : null;
      await w.write([id, emailFor(this.seed, id), hash(id), personName(this.seed, id).full, 'buyer', status, lastLogin, new Date(created), new Date(created)]);
    }
    await w.close();
  }

  private async writeSellers(client: pg.Client, sellers: SellerRow[]) {
    const rng = new Rng(this.seed, 'seller-rows');
    const w = await CopyWriter.open(client, 'sellers', ['id', 'user_id', 'store_name', 'slug', 'description', 'logo_key', 'support_email', 'status', 'approved_at', 'created_at', 'updated_at']);
    for (const s of sellers) {
      await w.write([
        s.id,
        s.userId,
        s.name,
        s.slug,
        storeDescription(rng, s.city),
        null,
        rng.chance(0.6) ? `hello@${s.slug}.example` : null,
        s.status,
        s.approvedAt ? new Date(s.approvedAt) : null,
        new Date(s.createdAt),
        new Date(s.approvedAt ?? s.createdAt),
      ]);
    }
    await w.close();
  }

  private async writeProducts(sellers: SellerRow[], categories: CategoryRow[], cat: Catalogue, firstId: number) {
    const sellerById = new Map(sellers.map((s) => [s.id, s]));
    const catById = new Map(categories.map((c) => [c.id, c]));
    const rng = new Rng(this.seed, `product-rows-${firstId}`);
    const [cp, ci, ca] = [await this.client(), await this.client(), await this.client()];
    const products = await CopyWriter.open(cp, 'products', [
      'id', 'seller_id', 'category_id', 'name', 'slug', 'description', 'price_cents', 'compare_at_cents', 'currency', 'stock',
      'low_stock_threshold', 'status', 'specs', 'rating_avg', 'rating_count', 'sales_count', 'published_at', 'created_at', 'updated_at',
    ]);
    const images = await CopyWriter.open(ci, 'product_images', ['product_id', 'storage_key', 'variants', 'width', 'height', 'position', 'alt_text', 'created_at']);
    const adjustments = await CopyWriter.open(ca, 'inventory_adjustments', ['product_id', 'delta', 'stock_after', 'reason', 'actor_id', 'created_at']);

    for (let i = 1; i <= cat.count; i++) {
      const id = firstId + i - 1;
      const seller = sellerById.get(cat.seller[i])!;
      const category = catById.get(cat.category[i])!;
      const created = cat.createdAt[i];
      const status = cat.status[i];
      const name = cat.name[i];
      const colour = rng.pick(COLOURS);
      const material = category.materials[Math.floor(hash01(this.seed, 'mat', id) * category.materials.length)];
      const compareAt = rng.chance(0.12) ? Math.round((cat.price[i] * (1.1 + rng.next() * 0.5)) / 100) * 100 - 1 : null;
      const specs: Record<string, string> = {};
      for (const key of rng.shuffle([...SPEC_KEYS.default]).slice(0, rng.int(4, 8))) {
        specs[key] =
          key === 'Material' ? material
          : key === 'Colour' ? colour
          : key === 'Origin' ? rng.pick(['Sri Lanka', 'Sri Lanka', 'Sri Lanka', 'India', 'Indonesia', 'Vietnam'])
          : key === 'Dimensions' ? `${rng.int(5, 120)} x ${rng.int(5, 120)} cm`
          : key === 'Weight' ? `${rng.int(50, 4_000)} g`
          : key === 'Maker' ? seller.name
          : key === 'Pack size' ? String(rng.int(1, 6))
          : key === 'Warranty' ? rng.pick(['None', '6 months', '1 year'])
          : key === 'Care' ? rng.pick(['Hand wash', 'Wipe clean', 'Machine wash 30', 'Dry clean only'])
          : rng.pick(['Matte', 'Gloss', 'Natural', 'Oiled', 'Raw']);
      }
      const updated = Math.min(created + rng.next() * (this.anchor - created), this.anchor);
      await products.write([
        id,
        seller.id,
        category.id,
        name,
        `${slugify(name)}-${id}`,
        productDescription(rng, { name, store: seller.name, material: material.toLowerCase(), colour }),
        cat.price[i],
        compareAt,
        'USD',
        cat.stock[i],
        rng.chance(0.2) ? 10 : 5,
        PRODUCT_STATUS[status],
        specs,
        0,
        0,
        0,
        status === PStatus.Draft ? null : new Date(created),
        new Date(created),
        new Date(updated),
      ]);

      const imageCount = status === PStatus.Draft ? rng.int(0, 1) : rng.int(1, 4);
      for (let p = 0; p < imageCount; p++) {
        const img = this.pool[Math.floor(hash01(this.seed, `img-${p}`, id) * this.pool.length)];
        await images.write([id, img.storageKey, img.variants, img.width, img.height, p, p === 0 ? name : `${name} - view ${p + 1}`, new Date(created + p * 60_000)]);
      }

      // Stock history only exists since the inventory feature shipped.
      const opened = Math.max(created, FEATURE_DATES.inventory);
      if (opened < this.anchor) {
        let level = cat.stock[i] + rng.int(0, 60);
        await adjustments.write([id, level, level, created < FEATURE_DATES.inventory ? 'opening balance' : 'initial stock', seller.userId, new Date(opened)]);
        const takes = rng.int(0, 3);
        for (let k = 0; k < takes; k++) {
          const next = k === takes - 1 ? cat.stock[i] : Math.max(0, level + rng.int(-30, 40));
          if (next === level) continue;
          const at = opened + ((k + 1) / (takes + 1)) * (this.anchor - opened);
          await adjustments.write([id, next - level, next, rng.pick(['stock take', 'restock', 'damaged in transit', 'stock take']), seller.userId, new Date(at)]);
          level = next;
        }
      }
    }
    await Promise.all([products.close(), images.close(), adjustments.close()]);
  }

  private async writeOrders(
    plan: ReturnType<SeedGenerator['planOrders']>,
    cat: Catalogue,
    sellers: SellerRow[],
    firstOrderId: number,
    firstItemId: number,
    reviewed = new Set<number>(),
  ) {
    const rng = new Rng(this.seed, `order-items-${firstOrderId}`);
    const reviewRng = new Rng(this.seed, `reviews-${firstOrderId}`);
    const sellerById = new Map(sellers.map((s) => [s.id, s]));
    const sampler = new WeightedSampler(cat.weight);
    const [co, ci, cr, cn] = [await this.client(), await this.client(), await this.client(), await this.client()];
    const orders = await CopyWriter.open(co, 'orders', [
      'id', 'buyer_id', 'status', 'subtotal_cents', 'shipping_cents', 'total_cents', 'currency', 'shipping_address', 'payment_ref', 'payment_last4', 'cancelled_at', 'created_at', 'updated_at',
    ]);
    const items = await CopyWriter.open(ci, 'order_items', [
      'id', 'order_id', 'product_id', 'seller_id', 'product_name', 'unit_price_cents', 'quantity', 'status', 'tracking_number', 'shipped_at', 'delivered_at', 'created_at',
    ]);
    const reviews = await CopyWriter.open(cr, 'reviews', [
      'product_id', 'user_id', 'rating', 'title', 'body', 'status', 'moderated_by', 'moderated_at', 'moderation_note', 'created_at', 'updated_at',
    ]);
    const notifications = await CopyWriter.open(cn, 'notifications', ['user_id', 'type', 'title', 'body', 'link', 'read_at', 'created_at']);

    // Products are in creation order, so "listed before t" is a prefix of ids.
    const ids = cat.createdAt;
    const lastListedBefore = (t: number) => {
      let lo = 1;
      let hi = cat.count;
      while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1;
        if (ids[mid] <= t) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };
    const pickProduct = (t: number, cutoff: number) => {
      for (let tries = 0; tries < 40; tries++) {
        const idx = sampler.sample(rng);
        if (idx >= 1 && idx <= cutoff && ids[idx] <= t && cat.status[idx] !== PStatus.Draft) return idx;
      }
      for (let tries = 0; tries < 40; tries++) {
        const idx = rng.int(1, cutoff);
        if (cat.status[idx] !== PStatus.Draft) return idx;
      }
      return 0;
    };

    const stats = { orders: 0, items: 0, reviews: 0, notifications: 0 };
    let itemId = firstItemId;
    const now = this.anchor;
    const unread = (sellerBig: boolean, at: number) => (sellerBig ? rng.chance(0.85) : now - at < 2 * DAY_MS ? rng.chance(0.7) : rng.chance(0.08));

    for (let o = 0; o < plan.times.length; o++) {
      const orderId = firstOrderId + o;
      const t = plan.times[o];
      const buyerId = plan.buyerBase + plan.buyer[o] + 1;
      const age = (now - t) / DAY_MS;
      const cutoff = lastListedBefore(t);
      const roll = rng.next();
      const lineCount = roll < 0.58 ? 1 : roll < 0.82 ? 2 : roll < 0.92 ? 3 : roll < 0.97 ? 4 : rng.int(5, 8);
      const lines: { idx: number; qty: number; price: number }[] = [];
      for (let l = 0; l < lineCount; l++) {
        const idx = pickProduct(t, cutoff);
        if (!idx || lines.some((x) => x.idx === idx)) continue;
        const q = rng.next();
        const qty = q < 0.82 ? 1 : q < 0.94 ? 2 : q < 0.98 ? 3 : rng.int(4, 6);
        const drift = age > 180 ? 0.9 + rng.next() * 0.1 : 1;
        lines.push({ idx, qty, price: Math.max(99, Math.round((cat.price[idx] * drift) / 100) * 100 - 1) });
      }
      if (lines.length === 0) continue;

      const cancelled = age > 2 && rng.chance(0.025);
      const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
      const shipping = shippingFor(subtotal);

      // Fulfilment per seller: recent orders are still moving through the pipeline.
      const sellerIds = [...new Set(lines.map((l) => cat.seller[l.idx]))];
      const sellerState = new Map<number, { status: OrderItemStatus; shippedAt: number | null; deliveredAt: number | null; tracking: string | null }>();
      for (const sid of sellerIds) {
        let status: OrderItemStatus;
        const r = rng.next();
        if (cancelled) status = 'cancelled';
        else if (age < 1) status = r < 0.9 ? 'pending' : 'shipped';
        else if (age < 3) status = r < 0.4 ? 'pending' : r < 0.95 ? 'shipped' : 'delivered';
        else if (age < 10) status = r < 0.05 ? 'pending' : r < 0.4 ? 'shipped' : 'delivered';
        else status = r < 0.99 ? 'delivered' : 'shipped';
        let shippedAt: number | null = null;
        let deliveredAt: number | null = null;
        if (status === 'shipped' || status === 'delivered') {
          shippedAt = Math.min(t + (6 + rng.next() * 60) * HOUR_MS, now - 60_000);
          if (status === 'delivered') deliveredAt = Math.min(shippedAt + (1 + rng.next() * 6) * DAY_MS, now - 30_000);
        }
        sellerState.set(sid, { status, shippedAt, deliveredAt, tracking: shippedAt ? `RR${String(orderId).padStart(9, '0')}LK` : null });
      }
      const orderStatus = deriveOrderStatus(lines.map((l) => sellerState.get(cat.seller[l.idx])!.status));
      const updatedAt = Math.max(t, ...[...sellerState.values()].map((s) => s.deliveredAt ?? s.shippedAt ?? t));
      await orders.write([
        orderId,
        buyerId,
        orderStatus,
        subtotal,
        shipping,
        subtotal + shipping,
        'USD',
        addressFor(this.seed, buyerId),
        `ch_${rng.hex(12)}`,
        CARD_LAST4[buyerId % CARD_LAST4.length],
        cancelled ? new Date(t + rng.int(1, 40) * HOUR_MS) : null,
        new Date(t),
        new Date(updatedAt),
      ]);
      stats.orders++;

      for (const l of lines) {
        const sid = cat.seller[l.idx];
        const st = sellerState.get(sid)!;
        const productId = l.idx;
        await items.write([
          itemId++,
          orderId,
          productId,
          sid,
          cat.name[l.idx],
          l.price,
          l.qty,
          st.status,
          st.tracking,
          st.shippedAt ? new Date(st.shippedAt) : null,
          st.deliveredAt ? new Date(st.deliveredAt) : null,
          new Date(t),
        ]);
        stats.items++;

        // Reviews come from buyers whose item was delivered.
        if (st.status === 'delivered' && st.deliveredAt) {
          const key = productId * 4_194_304 + buyerId;
          const p = 0.3 * (0.6 + hash01(this.seed, 'review-rate', productId));
          if (!reviewed.has(key) && reviewRng.chance(p)) {
            const at = st.deliveredAt + reviewRng.int(1, 20) * DAY_MS + reviewRng.next() * DAY_MS;
            if (at < now) {
              reviewed.add(key);
              const rating = Math.max(1, Math.min(5, Math.round(reviewRng.normal(productQuality(this.seed, productId), 0.9))));
              const moderated = at > FEATURE_DATES.moderation;
              const held = moderated && reviewRng.chance(0.02);
              const rejected = moderated && !held && reviewRng.chance(0.006);
              const text = reviewText(reviewRng, rating, held || rejected);
              const status = held ? 'pending' : rejected ? 'rejected' : 'published';
              await reviews.write([
                productId,
                buyerId,
                rating,
                text.title,
                text.body,
                status,
                rejected ? 3 : null,
                rejected ? new Date(at + DAY_MS) : null,
                rejected ? 'Off-platform contact or payment request' : null,
                new Date(at),
                new Date(at),
              ]);
              stats.reviews++;
              const seller = sellerById.get(sid)!;
              if (status === 'published' && at > FEATURE_DATES.notifications) {
                await notifications.write([
                  seller.userId,
                  'review.created',
                  `New ${rating}-star review`,
                  `"${text.title}" on ${cat.name[l.idx]}`,
                  `/products/${productId}`,
                  unread(seller.big, at) ? null : new Date(at + rng.int(1, 72) * HOUR_MS),
                  new Date(at),
                ]);
                stats.notifications++;
              }
            }
          }
        }
      }

      if (t > FEATURE_DATES.notifications) {
        for (const sid of sellerIds) {
          const seller = sellerById.get(sid)!;
          const units = lines.filter((l) => cat.seller[l.idx] === sid).reduce((n, l) => n + l.qty, 0);
          await notifications.write([
            seller.userId,
            'order.created',
            `New order #${orderId}`,
            `${units} item(s) to ship`,
            `/seller/orders/${orderId}`,
            unread(seller.big, t) ? null : new Date(t + rng.int(1, 48) * HOUR_MS),
            new Date(t),
          ]);
          stats.notifications++;
          const st = sellerState.get(sid)!;
          if (cancelled) {
            await notifications.write([seller.userId, 'order.cancelled', `Order #${orderId} was cancelled`, 'The buyer cancelled this order before it shipped. Stock has been restored.', `/seller/orders/${orderId}`, null, new Date(t + HOUR_MS)]);
            stats.notifications++;
          } else if (st.shippedAt) {
            const names = lines.filter((l) => cat.seller[l.idx] === sid).map((l) => cat.name[l.idx]).join(', ');
            await notifications.write([
              buyerId,
              'order.shipped',
              `Order #${orderId} has shipped`,
              `${names} is on the way. Tracking: ${st.tracking}`,
              `/orders/${orderId}`,
              now - st.shippedAt < 3 * DAY_MS && rng.chance(0.6) ? null : rng.chance(0.1) ? null : new Date(st.shippedAt + rng.int(1, 96) * HOUR_MS),
              new Date(st.shippedAt),
            ]);
            stats.notifications++;
          }
        }
      }
      if (o % 200_000 === 0 && o > 0) this.log(`  orders ${o}/${plan.times.length}`);
    }
    await Promise.all([orders.close(), items.close(), reviews.close(), notifications.close()]);
    return stats;
  }

  private async writeWishlistsAndCarts(cat: Catalogue, sellers: SellerRow[], buyerBase: number, buyerCount: number, firstOrderAt: Float64Array) {
    const rng = new Rng(this.seed, 'wishlists');
    const cfg = this.cfg;
    const sampler = new WeightedSampler(cat.weight);
    const live = new Set(sellers.filter((s) => s.status === 'active').map((s) => s.id));
    const sellable = (idx: number) => cat.status[idx] === PStatus.Active && live.has(cat.seller[idx]);
    const [cw, cc] = [await this.client(), await this.client()];
    const wish = await CopyWriter.open(cw, 'wishlist_items', ['user_id', 'product_id', 'created_at']);
    const carts = await CopyWriter.open(cc, 'cart_items', ['user_id', 'product_id', 'quantity', 'created_at', 'updated_at']);

    // A few products went viral (press, influencers) and sit in thousands of wishlists.
    const bigSellers = new Set(sellers.filter((s) => s.big).map((s) => s.id));
    const viral: number[] = [];
    for (let tries = 0; viral.length < cfg.viralProducts && tries < 100_000; tries++) {
      const idx = sampler.sample(rng);
      if (sellable(idx) && (bigSellers.has(cat.seller[idx]) || rng.chance(0.3)) && !viral.includes(idx)) viral.push(idx);
    }
    const viralFans = viral.map(() => new Set<number>());
    viral.forEach((_, v) => {
      const target = rng.int(cfg.viralWishlistSize[0], cfg.viralWishlistSize[1]);
      while (viralFans[v].size < Math.min(target, buyerCount)) viralFans[v].add(rng.int(0, buyerCount - 1));
    });

    for (let b = 0; b < buyerCount; b++) {
      const userId = buyerBase + b + 1;
      const since = Number.isFinite(firstOrderAt[b]) ? firstOrderAt[b] - 10 * DAY_MS : this.anchor - 200 * DAY_MS;
      const mine = new Set<number>();
      if (rng.chance(0.35)) {
        const n = rng.int(1, 15);
        for (let k = 0; k < n * 2 && mine.size < n; k++) {
          const idx = sampler.sample(rng);
          if (sellable(idx)) mine.add(idx);
        }
      }
      viral.forEach((idx, v) => {
        if (viralFans[v].has(b)) mine.add(idx);
      });
      for (const idx of mine) {
        const at = Math.max(since, cat.createdAt[idx]) + rng.next() * Math.max(this.anchor - Math.max(since, cat.createdAt[idx]), 0);
        await wish.write([userId, idx, new Date(Math.min(at, this.anchor))]);
      }
      if (rng.chance(0.04)) {
        const n = rng.int(1, 4);
        const inCart = new Set<number>();
        for (let k = 0; k < n * 3 && inCart.size < n; k++) {
          const idx = sampler.sample(rng);
          if (sellable(idx) && cat.stock[idx] > 2) inCart.add(idx);
        }
        for (const idx of inCart) {
          const at = new Date(this.anchor - rng.next() * 14 * DAY_MS);
          await carts.write([userId, idx, rng.chance(0.8) ? 1 : 2, at, at]);
        }
      }
    }
    await Promise.all([wish.close(), carts.close()]);
  }

  private async writeAudit(client: pg.Client, sellers: SellerRow[]) {
    const rng = new Rng(this.seed, 'audit');
    const w = await CopyWriter.open(client, 'audit_log', ['actor_id', 'action', 'entity_type', 'entity_id', 'metadata', 'ip', 'created_at']);
    const events: [number, string, string, string, object, number][] = [];
    for (const s of sellers) {
      if (!s.approvedAt) continue;
      events.push([2, 'admin.seller.status', 'seller', String(s.id), { from: 'pending', to: 'active' }, s.approvedAt]);
      if (s.status === 'suspended') events.push([2, 'admin.seller.status', 'seller', String(s.id), { from: 'active', to: 'suspended' }, s.approvedAt + rng.int(30, 300) * DAY_MS]);
    }
    events.sort((a, b) => a[5] - b[5]);
    for (const [actor, action, type, id, meta, at] of events) {
      if (at > this.anchor) continue;
      await w.write([actor, action, type, id, meta, `10.0.${rng.int(0, 9)}.${rng.int(2, 250)}`, new Date(at)]);
    }
    await w.close();
  }

  // -------------------------------------------------------------------------
  // Indexes, aggregates, sequences

  private async dropIndexes(client: pg.Client) {
    const { rows } = await client.query<{ indexname: string; indexdef: string }>(`
      select i.indexname, i.indexdef
        from pg_indexes i
       where i.schemaname = 'public'
         and not exists (select 1 from pg_constraint c where c.conname = i.indexname)
    `);
    for (const r of rows) await client.query(`drop index if exists "${r.indexname}"`);
    return rows;
  }

  private async restoreIndexes(client: pg.Client, indexes: { indexdef: string }[]) {
    await client.query(`set maintenance_work_mem = '256MB'`);
    for (const r of indexes) await client.query(r.indexdef);
  }

  private async finish(client: pg.Client, growth: { productFrom: number; orderFrom: number } | null) {
    const scope = growth ? `and p.id in (select distinct product_id from order_items where order_id >= ${growth.orderFrom})` : '';
    await client.query(`
      update products p
         set sales_count = s.units
        from (select product_id, sum(quantity)::int as units from order_items where status <> 'cancelled' group by product_id) s
       where s.product_id = p.id ${scope}
    `);
    await client.query(`
      update products p
         set rating_avg = r.avg_rating, rating_count = r.review_count
        from (
          select product_id, round(avg(rating), 2) as avg_rating, count(*) as review_count
            from reviews where status = 'published' group by product_id
        ) r
       where r.product_id = p.id ${scope}
    `);

    // Payouts: one row per seller per closed month since payouts launched.
    const months: string[] = [];
    const a = new Date(this.anchor);
    for (let i = 12; i >= 1; i--) {
      const d = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() - i, 1));
      if (d.getTime() >= FEATURE_DATES.payouts - 3 * DAY_MS) months.push(d.toISOString().slice(0, 10));
    }
    const lastClosed = months[months.length - 1];
    const fee = config.PLATFORM_FEE_PERCENT;
    if (months.length) {
      await client.query(
        `
        insert into payouts (seller_id, period_month, gross_cents, fee_cents, net_cents, status, paid_at, created_at)
        select seller_id, month, gross, round(gross * $2::numeric / 100), gross - round(gross * $2::numeric / 100),
               case when month = $3::date then 'scheduled' else 'paid' end,
               case when month = $3::date then null else (month + interval '1 month' + interval '14 days') end,
               month + interval '1 month' + interval '2 days'
          from (
            select seller_id, date_trunc('month', created_at)::date as month, sum(unit_price_cents * quantity)::bigint as gross
              from order_items
             where status in ('shipped', 'delivered')
               and created_at >= $1::date and created_at < ($3::date + interval '1 month')
             group by 1, 2
          ) m
        on conflict (seller_id, period_month) do update
          set gross_cents = excluded.gross_cents, fee_cents = excluded.fee_cents, net_cents = excluded.net_cents
        `,
        [months[0], fee, lastClosed],
      );
    }

    for (const table of ['users', 'categories', 'sellers', 'products', 'product_images', 'reviews', 'orders', 'order_items', 'notifications', 'audit_log', 'inventory_adjustments', 'payouts', 'refresh_tokens']) {
      await client.query(`select setval(pg_get_serial_sequence('${table}', 'id'), greatest((select max(id) from ${table}), 1))`);
    }
    await client.query('analyze');
  }
}
