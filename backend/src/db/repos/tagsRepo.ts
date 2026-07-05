import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { events, locations, projects, smartTags } from '../schema.js';

export function createTagsRepo(db: Db) {
  return {
    async list() {
      return db.select().from(smartTags).orderBy(asc(smartTags.name));
    },
    async getById(id: string) {
      const rows = await db.select().from(smartTags).where(eq(smartTags.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async findByName(name: string) {
      const rows = await db.select().from(smartTags).where(eq(smartTags.name, name)).limit(1);
      return rows[0] ?? null;
    },
    async create(input: typeof smartTags.$inferInsert) {
      const rows = await db.insert(smartTags).values(input).returning();
      return rows[0]!;
    },
    async update(id: string, patch: Partial<typeof smartTags.$inferInsert>) {
      const rows = await db.update(smartTags).set(patch).where(eq(smartTags.id, id)).returning();
      return rows[0] ?? null;
    },
    async delete(id: string) {
      const rows = await db.delete(smartTags).where(eq(smartTags.id, id)).returning({ id: smartTags.id });
      return rows.length > 0;
    },
    /** Inserts any name missing from the registry (names must be pre-normalized; unique on name). */
    async upsertMissing(names: string[]) {
      if (names.length === 0) return [];
      return db
        .insert(smartTags)
        .values(names.map((name) => ({ name })))
        .onConflictDoNothing({ target: smartTags.name })
        .returning();
    },
    /** Propagates a tag rename into every stored tag array (locations, projects, events). */
    async renameInArrays(oldName: string, newName: string) {
      await db
        .update(locations)
        .set({ smartTags: sql`array_replace(${locations.smartTags}, ${oldName}, ${newName})` })
        .where(sql`${oldName} = ANY(${locations.smartTags})`);
      await db
        .update(projects)
        .set({ tags: sql`array_replace(${projects.tags}, ${oldName}, ${newName})` })
        .where(sql`${oldName} = ANY(${projects.tags})`);
      await db
        .update(events)
        .set({ tags: sql`array_replace(${events.tags}, ${oldName}, ${newName})` })
        .where(sql`${oldName} = ANY(${events.tags})`);
    },
  };
}

export type TagsRepo = ReturnType<typeof createTagsRepo>;
