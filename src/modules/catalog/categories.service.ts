import type { Category } from '../../db/types.js';
import { notFound } from '../../lib/errors.js';
import type { CategoryNodeT } from './catalog.schemas.js';
import { categoriesRepository } from './categories.repository.js';

function buildTree(all: Category[], parentId: number | null): CategoryNodeT[] {
  return all
    .filter((c) => c.parent_id === parentId)
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug, children: buildTree(all, c.id) }));
}

function descendantsOf(all: Category[], rootId: number): number[] {
  const ids = [rootId];
  for (const child of all.filter((c) => c.parent_id === rootId)) {
    ids.push(...descendantsOf(all, child.id));
  }
  return ids;
}

function breadcrumbFor(all: Category[], id: number) {
  const trail: { id: number; name: string; slug: string }[] = [];
  let current = all.find((c) => c.id === id);
  while (current) {
    trail.unshift({ id: current.id, name: current.name, slug: current.slug });
    const parentId = current.parent_id;
    current = parentId == null ? undefined : all.find((c) => c.id === parentId);
  }
  return trail;
}

export const categoriesService = {
  async tree() {
    const all = await categoriesRepository.all();
    return buildTree(all, null);
  },

  async topLevel() {
    const all = await categoriesRepository.all();
    return all.filter((c) => c.parent_id === null).map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
  },

  async detail(slug: string) {
    const all = await categoriesRepository.all();
    const category = all.find((c) => c.slug === slug);
    if (!category) throw notFound('Category');
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      breadcrumb: breadcrumbFor(all, category.id),
      children: all
        .filter((c) => c.parent_id === category.id)
        .map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    };
  },

  /** Category ids for a slug, including every subcategory. */
  async idsForSlug(slug: string): Promise<number[] | null> {
    const all = await categoriesRepository.all();
    const category = all.find((c) => c.slug === slug);
    if (!category) return null;
    return descendantsOf(all, category.id);
  },

  async breadcrumb(categoryId: number) {
    const all = await categoriesRepository.all();
    return breadcrumbFor(all, categoryId);
  },
};
