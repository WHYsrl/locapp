import { and, desc, eq, ilike, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client.js';
import { exportJobs, type ExportJobKind } from '../schema.js';

export interface ExportJobListFilters {
  kind?: ExportJobKind;
  /** Filters target_name (ilike substring). */
  q?: string;
  offset: number;
  limit: number;
}

export function createExportJobsRepo(db: Db) {
  return {
    async create(input: typeof exportJobs.$inferInsert) {
      const rows = await db.insert(exportJobs).values(input).returning();
      return rows[0]!;
    },
    async getById(id: string) {
      const rows = await db.select().from(exportJobs).where(eq(exportJobs.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async update(id: string, patch: Partial<typeof exportJobs.$inferInsert>) {
      const rows = await db.update(exportJobs).set(patch).where(eq(exportJobs.id, id)).returning();
      return rows[0] ?? null;
    },
    /** Export repository listing: newest first, optional kind/target_name filters. */
    async list(f: ExportJobListFilters) {
      const conds: SQL[] = [];
      if (f.kind) conds.push(eq(exportJobs.kind, f.kind));
      if (f.q) conds.push(ilike(exportJobs.targetName, `%${f.q}%`));
      const where = conds.length > 0 ? and(...conds) : undefined;
      const rows = await db
        .select()
        .from(exportJobs)
        .where(where)
        .orderBy(desc(exportJobs.createdAt), desc(exportJobs.id))
        .limit(f.limit)
        .offset(f.offset);
      const totalRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(exportJobs)
        .where(where);
      return { rows, total: totalRows[0]?.count ?? 0 };
    },
  };
}

export type ExportJobsRepo = ReturnType<typeof createExportJobsRepo>;
