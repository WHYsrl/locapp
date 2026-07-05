import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { users } from '../schema.js';

export function createUsersRepo(db: Db) {
  return {
    async findByEmail(email: string) {
      const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return rows[0] ?? null;
    },
    async findById(id: string) {
      const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async create(input: typeof users.$inferInsert) {
      const rows = await db.insert(users).values(input).returning();
      return rows[0]!;
    },
  };
}

export type UsersRepo = ReturnType<typeof createUsersRepo>;
