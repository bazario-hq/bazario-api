import { sql, type SelectQueryBuilder } from 'kysely';
import { db } from '../../db/index.js';
import type { Database } from '../../db/types.js';
import type { ProductSearchFilters } from './catalog.schemas.js';

export interface SearchScope {
  categoryIds?: number[] | null;
  sellerId?: number | null;
}

type ProductQuery = SelectQueryBuilder<Database, 'products' | 'sellers', object>;

function applyFilters(qb: ProductQuery, filters: ProductSearchFilters, scope: SearchScope): ProductQuery {
  let q = qb.where('products.status', '=', 'active').where('sellers.status', '=', 'active');

  if (filters.q) {
    const term = `%${filters.q}%`;
    q = q.where((eb) => eb.or([eb('products.name', 'ilike', term), eb('products.description', 'ilike', term)]));
  }
  if (scope.categoryIds) q = q.where('products.category_id', 'in', scope.categoryIds);
  if (scope.sellerId) q = q.where('products.seller_id', '=', scope.sellerId);
  if (filters.minPrice != null) q = q.where('products.price_cents', '>=', filters.minPrice);
  if (filters.maxPrice != null) q = q.where('products.price_cents', '<=', filters.maxPrice);
  if (filters.minRating != null) q = q.where('products.rating_avg', '>=', filters.minRating);
  if (filters.inStock) q = q.where('products.stock', '>', 0);
  return q;
}

function base() {
  return db.selectFrom('products').innerJoin('sellers', 'sellers.id', 'products.seller_id');
}

export const productsRepository = {
  async search(filters: ProductSearchFilters, scope: SearchScope) {
    const filtered = applyFilters(base(), filters, scope);

    let q = filtered
      .selectAll('products')
      .select(['sellers.store_name as seller_store_name', 'sellers.slug as seller_slug']);

    switch (filters.sort) {
      case 'price_asc':
        q = q.orderBy('products.price_cents', 'asc');
        break;
      case 'price_desc':
        q = q.orderBy('products.price_cents', 'desc');
        break;
      case 'rating':
        q = q.orderBy('products.rating_avg', 'desc').orderBy('products.rating_count', 'desc');
        break;
      case 'popular':
        q = q.orderBy('products.sales_count', 'desc');
        break;
      default:
        q = q.orderBy('products.published_at', 'desc');
    }

    return q
      .orderBy('products.id', 'desc')
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize)
      .execute();
  },

  async count(filters: ProductSearchFilters, scope: SearchScope) {
    const row = await applyFilters(base(), filters, scope)
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow();
    return Number(row.count);
  },

  categoryFacets(filters: ProductSearchFilters, scope: SearchScope) {
    return applyFilters(base(), filters, scope)
      .innerJoin('categories', 'categories.id', 'products.category_id')
      .select(['categories.id', 'categories.name', 'categories.slug'])
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .groupBy(['categories.id', 'categories.name', 'categories.slug'])
      .orderBy('count', 'desc')
      .limit(20)
      .execute();
  },

  findById(id: number) {
    return db.selectFrom('products').selectAll().where('id', '=', id).executeTakeFirst();
  },

  ratingHistogram(productId: number) {
    return db
      .selectFrom('reviews')
      .select(['rating', (eb) => eb.fn.countAll<number>().as('count')])
      .where('product_id', '=', productId)
      .where('status', '=', 'published')
      .groupBy('rating')
      .execute();
  },

  related(categoryId: number, excludeId: number, limit = 8) {
    return db
      .selectFrom('products')
      .innerJoin('sellers', 'sellers.id', 'products.seller_id')
      .selectAll('products')
      .select(['sellers.store_name as seller_store_name', 'sellers.slug as seller_slug'])
      .where('products.category_id', '=', categoryId)
      .where('products.id', '!=', excludeId)
      .where('products.status', '=', 'active')
      .where('sellers.status', '=', 'active')
      .orderBy('products.sales_count', 'desc')
      .limit(limit)
      .execute();
  },

  sellerRating(sellerId: number) {
    return db
      .selectFrom('products')
      .select(sql<number | null>`round(avg(rating_avg) filter (where rating_count > 0), 2)`.as('rating'))
      .where('seller_id', '=', sellerId)
      .where('status', '=', 'active')
      .executeTakeFirst();
  },
};

export type ProductRow = Awaited<ReturnType<typeof productsRepository.search>>[number];
