import { z } from 'zod';

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});

export interface Pagination {
  page: number;
  perPage: number;
  offset: number;
  limit: number;
}

export function parsePagination(query: unknown): Pagination {
  const { page, per_page } = PaginationQuery.parse(query ?? {});
  return { page, perPage: per_page, offset: (page - 1) * per_page, limit: per_page };
}

export function paginated<T>(data: T[], total: number, p: Pagination) {
  return { data, meta: { page: p.page, per_page: p.perPage, total } };
}
