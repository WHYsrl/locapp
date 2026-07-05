import { describe, expect, it } from 'vitest';
import { paginated, parsePagination } from '../src/lib/pagination.js';

describe('pagination', () => {
  it('applies defaults page=1 per_page=25', () => {
    expect(parsePagination({})).toEqual({ page: 1, perPage: 25, offset: 0, limit: 25 });
  });

  it('computes offset from page and coerces string query values', () => {
    expect(parsePagination({ page: '3', per_page: '10' })).toEqual({ page: 3, perPage: 10, offset: 20, limit: 10 });
  });

  it('rejects out-of-range values', () => {
    expect(() => parsePagination({ per_page: '1000' })).toThrow();
    expect(() => parsePagination({ page: '0' })).toThrow();
  });

  it('wraps data in the {data, meta} envelope', () => {
    expect(paginated(['a'], 42, { page: 2, perPage: 25, offset: 25, limit: 25 })).toEqual({
      data: ['a'],
      meta: { page: 2, per_page: 25, total: 42 },
    });
  });
});
