import type { ImageVariants } from '../../db/types.js';
import { notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { pageMeta } from '../../lib/pagination.js';
import { serializeImage } from '../common/serializers.js';
import { sellersRepository } from '../sellers/sellers.repository.js';
import type { ProductSearchFilters } from './catalog.schemas.js';
import { categoriesService } from './categories.service.js';
import { productImagesRepository } from './images.repository.js';
import { toProductCard, toProductCards } from './product-card.js';
import { productsRepository, type SearchScope } from './products.repository.js';

const FACET_TTL_MS = 5 * 60 * 1000;
const facetCache = new Map<string, { at: number; value: Awaited<ReturnType<typeof productsRepository.categoryFacets>> }>();

async function facetsFor(filters: ProductSearchFilters, scope: SearchScope) {
  const key = JSON.stringify({ ...filters, ...scope });
  const hit = facetCache.get(key);
  if (hit && Date.now() - hit.at < FACET_TTL_MS) return hit.value;

  const value = await productsRepository.categoryFacets(filters, scope);
  facetCache.set(key, { at: Date.now(), value });
  return value;
}

function emptyResult(filters: ProductSearchFilters) {
  return { items: [], meta: pageMeta(filters.page, filters.pageSize, 0), facets: { categories: [] } };
}

export const productsService = {
  async search(filters: ProductSearchFilters) {
    const scope: SearchScope = {};
    if (filters.category) {
      scope.categoryIds = await categoriesService.idsForSlug(filters.category);
      if (!scope.categoryIds) return emptyResult(filters);
    }
    if (filters.seller) {
      const seller = await sellersRepository.findBySlug(filters.seller);
      if (!seller || seller.status !== 'active') return emptyResult(filters);
      scope.sellerId = seller.id;
    }

    const rows = await productsRepository.search(filters, scope);
    const total = await productsRepository.count(filters, scope);
    const facets = await facetsFor(filters, scope);

    const items = [];
    for (const row of rows) {
      const image = await productImagesRepository.primaryImage(row.id);
      items.push(toProductCard(row, image));
    }

    logger.debug(`product search ${JSON.stringify(filters)} -> ${JSON.stringify(rows)}`);

    return {
      items,
      meta: pageMeta(filters.page, filters.pageSize, total),
      facets: { categories: facets.map((f) => ({ ...f, count: Number(f.count) })) },
    };
  },
};
