import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';
import { env } from '../config.js';

export function createDb(url: string = env.DATABASE_URL) {
  const client = postgres(url, {
    max: 10,
    onnotice: () => undefined,
    types: {
      // SPEC §3 declares area_sqm/height_m/rating/match_score/amount as numeric;
      // without a parser the pg wire protocol hands them back as strings and they
      // leak into API responses as "4500" instead of 4500.
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (value: number | string) => String(value),
        parse: (value: string) => Number.parseFloat(value),
      },
    },
  });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

let cached: Db | null = null;

export function getDb(): Db {
  cached ??= createDb();
  return cached;
}
