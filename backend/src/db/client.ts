import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';
import { env } from '../config.js';

export function createDb(url: string = env.DATABASE_URL) {
  const client = postgres(url, { max: 10, onnotice: () => undefined });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

let cached: Db | null = null;

export function getDb(): Db {
  cached ??= createDb();
  return cached;
}
