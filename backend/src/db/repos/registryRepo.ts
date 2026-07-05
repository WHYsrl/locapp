import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { companies, companyContacts, contacts, pois } from '../schema.js';
import type { Pagination } from '../../lib/pagination.js';

export function createRegistryRepo(db: Db) {
  return {
    // ---- companies ----
    async listCompanies(p: Pagination, filters: { kind?: string; category?: string; q?: string }) {
      const conds = [isNull(companies.deletedAt)];
      if (filters.kind) conds.push(eq(companies.kind, filters.kind as never));
      if (filters.category) {
        conds.push(sql`${companies.supplierCategories} @> ARRAY[${filters.category}]::text[]`);
      }
      if (filters.q) conds.push(ilike(companies.name, `%${filters.q}%`));
      const where = and(...conds);
      const rows = await db
        .select()
        .from(companies)
        .where(where)
        .orderBy(companies.name)
        .limit(p.limit)
        .offset(p.offset);
      const totalRows = await db.select({ count: sql<number>`count(*)::int` }).from(companies).where(where);
      return { rows, total: totalRows[0]?.count ?? 0 };
    },
    async getCompany(id: string) {
      const rows = await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, id), isNull(companies.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    },
    async createCompany(input: typeof companies.$inferInsert) {
      const rows = await db.insert(companies).values(input).returning();
      return rows[0]!;
    },
    async updateCompany(id: string, patch: Partial<typeof companies.$inferInsert>) {
      const rows = await db
        .update(companies)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(companies.id, id))
        .returning();
      return rows[0] ?? null;
    },
    async softDeleteCompany(id: string) {
      const rows = await db
        .update(companies)
        .set({ deletedAt: new Date() })
        .where(eq(companies.id, id))
        .returning({ id: companies.id });
      return rows.length > 0;
    },

    // ---- company contacts ----
    async listCompanyContacts(companyId: string) {
      return db
        .select({
          contactId: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          role: companyContacts.role,
        })
        .from(companyContacts)
        .innerJoin(contacts, eq(contacts.id, companyContacts.contactId))
        .where(eq(companyContacts.companyId, companyId));
    },
    async linkCompanyContact(input: typeof companyContacts.$inferInsert) {
      const rows = await db.insert(companyContacts).values(input).returning();
      return rows[0]!;
    },
    async unlinkCompanyContact(companyId: string, contactId: string) {
      const rows = await db
        .delete(companyContacts)
        .where(and(eq(companyContacts.companyId, companyId), eq(companyContacts.contactId, contactId)))
        .returning({ contactId: companyContacts.contactId });
      return rows.length > 0;
    },

    // ---- contacts ----
    async listContacts(p: Pagination, q?: string) {
      const conds = [isNull(contacts.deletedAt)];
      if (q) {
        conds.push(or(ilike(contacts.firstName, `%${q}%`), ilike(contacts.lastName, `%${q}%`))!);
      }
      const where = and(...conds);
      const rows = await db
        .select()
        .from(contacts)
        .where(where)
        .orderBy(contacts.lastName)
        .limit(p.limit)
        .offset(p.offset);
      const totalRows = await db.select({ count: sql<number>`count(*)::int` }).from(contacts).where(where);
      return { rows, total: totalRows[0]?.count ?? 0 };
    },
    async getContact(id: string) {
      const rows = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    },
    async createContact(input: typeof contacts.$inferInsert) {
      const rows = await db.insert(contacts).values(input).returning();
      return rows[0]!;
    },
    async updateContact(id: string, patch: Partial<typeof contacts.$inferInsert>) {
      const rows = await db
        .update(contacts)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(contacts.id, id))
        .returning();
      return rows[0] ?? null;
    },
    async softDeleteContact(id: string) {
      const rows = await db
        .update(contacts)
        .set({ deletedAt: new Date() })
        .where(eq(contacts.id, id))
        .returning({ id: contacts.id });
      return rows.length > 0;
    },

    // ---- pois ----
    async listPois() {
      return db
        .select({
          id: pois.id,
          name: pois.name,
          kind: pois.kind,
          lon: sql<number | null>`ST_X(${pois.geom})`,
          lat: sql<number | null>`ST_Y(${pois.geom})`,
        })
        .from(pois)
        .orderBy(desc(pois.name));
    },
    async getPoi(id: string) {
      const rows = await db
        .select({
          id: pois.id,
          name: pois.name,
          kind: pois.kind,
          lon: sql<number | null>`ST_X(${pois.geom})`,
          lat: sql<number | null>`ST_Y(${pois.geom})`,
        })
        .from(pois)
        .where(eq(pois.id, id))
        .limit(1);
      return rows[0] ?? null;
    },
    async createPoi(input: typeof pois.$inferInsert) {
      const rows = await db.insert(pois).values(input).returning({ id: pois.id, name: pois.name, kind: pois.kind });
      return rows[0]!;
    },
  };
}

export type RegistryRepo = ReturnType<typeof createRegistryRepo>;
