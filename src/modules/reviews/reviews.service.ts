import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { maskBlockedTerms, needsModeration } from '../../lib/moderation.js';
import { pageMeta } from '../../lib/pagination.js';
import { productsRepository } from '../catalog/products.repository.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { sellersRepository } from '../sellers/sellers.repository.js';
import { reviewsRepository, type ReviewRow } from './reviews.repository.js';

export function toReview(r: ReviewRow) {
  return {
    id: r.id,
    productId: r.product_id,
    rating: r.rating,
    title: maskBlockedTerms(r.title),
    body: maskBlockedTerms(r.body),
    status: r.status,
    author: { id: r.user_id, name: r.author_name },
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export const reviewsService = {
  async list(productId: number, sort: 'newest' | 'highest' | 'lowest', page: number, pageSize: number) {
    const product = await productsRepository.findById(productId);
    if (!product || product.status !== 'active') throw notFound('Product');
    const rows = await reviewsRepository.listForProduct(productId, sort, pageSize, (page - 1) * pageSize);
    const total = await reviewsRepository.countForProduct(productId);
    return { items: rows.map(toReview), meta: pageMeta(page, pageSize, total) };
  },

  async create(userId: number, productId: number, input: { rating: number; title: string; body: string }) {
    const product = await productsRepository.findById(productId);
    if (!product || product.status !== 'active') throw notFound('Product');
    if (!(await reviewsRepository.hasPurchased(userId, productId))) {
      throw forbidden('You can only review products you have purchased');
    }
    if (await reviewsRepository.findByProductAndUser(productId, userId)) {
      throw conflict('You have already reviewed this product');
    }

    const status = needsModeration(`${input.title}\n${input.body}`) ? 'pending' : 'published';
    const { id } = await reviewsRepository.create({ product_id: productId, user_id: userId, ...input, status });
    if (status === 'published') {
      await reviewsRepository.refreshProductRating(productId);
      const seller = await sellersRepository.findById(product.seller_id);
      if (seller) {
        await notificationsService.notify(seller.user_id, {
          type: 'review.created',
          title: `New ${input.rating}-star review`,
          body: `"${input.title}" on ${product.name}`,
          link: `/products/${product.id}`,
        });
      }
    }
    return toReview((await reviewsRepository.findById(id))!);
  },
};
