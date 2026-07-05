import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { ingestionJobs } from '../schema.js';

export function createIngestionRepo(db: Db) {
  return {
    async create(input: typeof ingestionJobs.$inferInsert) {
      const rows = await db.insert(ingestionJobs).values(input).returning();
      return rows[0]!;
    },
    async getById(id: string) {
      const rows = await db.select().from(ingestionJobs).where(eq(ingestionJobs.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async update(id: string, patch: Partial<typeof ingestionJobs.$inferInsert>) {
      const rows = await db.update(ingestionJobs).set(patch).where(eq(ingestionJobs.id, id)).returning();
      return rows[0] ?? null;
    },
  };
}

export type IngestionRepo = ReturnType<typeof createIngestionRepo>;
