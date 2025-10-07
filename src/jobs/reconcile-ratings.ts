import { sql } from 'kysely';
import { db } from '../db/index.js';

/**
 * Keeps products.rating_avg / rating_count in line with published reviews.
 * They are updated when reviews change, but moderation and deletes have let
 * them drift before (BZR-311).
 */
export async function reconcileRatings() {
  const result = await sql`
    update products p
    set rating_avg = coalesce(r.avg_rating, 0),
        rating_count = coalesce(r.review_count, 0),
        updated_at = now()
    from (
      select product_id, round(avg(rating), 2) as avg_rating, count(*) as review_count
      from reviews
      where status = 'published'
      group by product_id
    ) r
    where r.product_id = p.id
  `.execute(db);
  return { updated: Number(result.numAffectedRows ?? 0) };
}
