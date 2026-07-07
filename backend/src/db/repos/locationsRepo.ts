import { and, arrayOverlaps, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client.js';
import {
  companies,
  contacts,
  eventLocations,
  events,
  locationContacts,
  locationProjectNotes,
  locationSuppliers,
  locations,
  media,
  postEventFeedback,
  priceLists,
  projects,
  quotes,
  siteVisits,
  spaceCapacities,
  spaces,
  type CapacityConfiguration,
  type VisitStatus,
} from '../schema.js';
import type { Pagination } from '../../lib/pagination.js';

export interface LocationListFilters {
  q?: string;
  tags?: string[];
  city?: string;
  visitStatus?: VisitStatus;
  minCapacity?: number;
  configuration?: CapacityConfiguration;
  accessibilityMin?: number;
  parentId?: string;
  rootOnly?: boolean;
}

const geoLon = sql<number | null>`ST_X(${locations.geom})`.as('lon');
const geoLat = sql<number | null>`ST_Y(${locations.geom})`.as('lat');

function listConditions(f: LocationListFilters): SQL[] {
  const conds: SQL[] = [isNull(locations.deletedAt)];
  if (f.q) {
    conds.push(or(ilike(locations.name, `%${f.q}%`), ilike(locations.summary, `%${f.q}%`))!);
  }
  if (f.tags && f.tags.length > 0) conds.push(arrayOverlaps(locations.smartTags, f.tags));
  if (f.city) conds.push(ilike(locations.city, f.city));
  if (f.visitStatus) conds.push(eq(locations.visitStatus, f.visitStatus));
  if (f.accessibilityMin !== undefined) conds.push(gte(locations.accessibilityRating, f.accessibilityMin));
  if (f.parentId) conds.push(eq(locations.parentLocationId, f.parentId));
  if (f.rootOnly) conds.push(isNull(locations.parentLocationId));
  if (f.minCapacity !== undefined) {
    const cfgClause = f.configuration ? sql` AND sc.configuration = ${f.configuration}` : sql``;
    conds.push(
      sql`EXISTS (SELECT 1 FROM spaces s JOIN space_capacities sc ON sc.space_id = s.id
        WHERE s.location_id = ${locations.id} AND sc.capacity >= ${f.minCapacity}${cfgClause})`,
    );
  }
  return conds;
}

export function createLocationsRepo(db: Db) {
  return {
    async list(filters: LocationListFilters, p: Pagination) {
      const where = and(...listConditions(filters));
      const rows = await db
        .select()
        .from(locations)
        .where(where)
        .orderBy(desc(locations.updatedAt))
        .limit(p.limit)
        .offset(p.offset);
      const totalRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(locations)
        .where(where);
      return { rows, total: totalRows[0]?.count ?? 0 };
    },

    async getById(id: string) {
      const rows = await db
        .select()
        .from(locations)
        .where(and(eq(locations.id, id), isNull(locations.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    },

    async getRelations(id: string) {
      const [children, spaceRows, contactRows, supplierRows, mediaRows, priceListRows] =
        await Promise.all([
          db
            .select()
            .from(locations)
            .where(and(eq(locations.parentLocationId, id), isNull(locations.deletedAt))),
          db.select().from(spaces).where(eq(spaces.locationId, id)).orderBy(spaces.sort),
          db
            .select({
              contactId: locationContacts.contactId,
              role: locationContacts.role,
              companyId: locationContacts.companyId,
              firstName: contacts.firstName,
              lastName: contacts.lastName,
              email: contacts.email,
              phone: contacts.phone,
            })
            .from(locationContacts)
            .innerJoin(contacts, eq(contacts.id, locationContacts.contactId))
            .where(eq(locationContacts.locationId, id)),
          db
            .select({
              id: locationSuppliers.id,
              companyId: locationSuppliers.companyId,
              contactId: locationSuppliers.contactId,
              category: locationSuppliers.category,
              requirement: locationSuppliers.requirement,
              conditions: locationSuppliers.conditions,
              rating: locationSuppliers.rating,
              companyName: companies.name,
            })
            .from(locationSuppliers)
            .innerJoin(companies, eq(companies.id, locationSuppliers.companyId))
            .where(eq(locationSuppliers.locationId, id)),
          db.select().from(media).where(eq(media.locationId, id)),
          db.select().from(priceLists).where(eq(priceLists.locationId, id)),
        ]);
      const spaceIds = spaceRows.map((s) => s.id);
      const capacityRows =
        spaceIds.length > 0
          ? await db.select().from(spaceCapacities).where(inArray(spaceCapacities.spaceId, spaceIds))
          : [];
      return { children, spaceRows, capacityRows, contactRows, supplierRows, mediaRows, priceListRows };
    },

    async create(input: typeof locations.$inferInsert) {
      const rows = await db.insert(locations).values(input).returning();
      return rows[0]!;
    },

    async update(id: string, patch: Partial<typeof locations.$inferInsert>) {
      const rows = await db
        .update(locations)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(locations.id, id))
        .returning();
      return rows[0] ?? null;
    },

    async softDelete(id: string) {
      const rows = await db
        .update(locations)
        .set({ deletedAt: new Date() })
        .where(eq(locations.id, id))
        .returning({ id: locations.id });
      return rows.length > 0;
    },

    /** Non-deleted child locations (delete-rule check). */
    async listChildren(parentId: string) {
      return db
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(and(eq(locations.parentLocationId, parentId), isNull(locations.deletedAt)));
    },

    /** Detaches all children (parent_location_id = null); returns how many were detached. */
    async detachChildren(parentId: string) {
      const rows = await db
        .update(locations)
        .set({ parentLocationId: null, updatedAt: new Date() })
        .where(eq(locations.parentLocationId, parentId))
        .returning({ id: locations.id });
      return rows.length;
    },

    /** Deletes every shortlist reference (visits/quotes/availability cascade at DB level). */
    async removeShortlistReferences(locationId: string) {
      const rows = await db
        .delete(eventLocations)
        .where(eq(eventLocations.locationId, locationId))
        .returning({ id: eventLocations.id });
      return rows.length;
    },

    async usage(locationId: string) {
      return db
        .select({
          projectId: projects.id,
          projectName: projects.name,
          eventId: events.id,
          eventName: events.name,
          status: eventLocations.status,
          dateStart: events.dateStart,
          dateEnd: events.dateEnd,
        })
        .from(eventLocations)
        .innerJoin(events, eq(events.id, eventLocations.eventId))
        .innerJoin(projects, eq(projects.id, events.projectId))
        .where(eq(eventLocations.locationId, locationId));
    },

    async history(locationId: string) {
      const [visits, quoteRows, links, feedback] = await Promise.all([
        db
          .select({
            id: siteVisits.id,
            scheduledAt: siteVisits.scheduledAt,
            outcome: siteVisits.outcome,
            withClient: siteVisits.withClient,
            eventId: eventLocations.eventId,
          })
          .from(siteVisits)
          .innerJoin(eventLocations, eq(eventLocations.id, siteVisits.eventLocationId))
          .where(eq(eventLocations.locationId, locationId)),
        db
          .select({
            id: quotes.id,
            amount: quotes.amount,
            currency: quotes.currency,
            status: quotes.status,
            receivedAt: quotes.receivedAt,
            eventId: eventLocations.eventId,
          })
          .from(quotes)
          .innerJoin(eventLocations, eq(eventLocations.id, quotes.eventLocationId))
          .where(eq(eventLocations.locationId, locationId)),
        db
          .select({
            eventId: events.id,
            eventName: events.name,
            projectName: projects.name,
            status: eventLocations.status,
            dateStart: events.dateStart,
            createdAt: eventLocations.createdAt,
          })
          .from(eventLocations)
          .innerJoin(events, eq(events.id, eventLocations.eventId))
          .innerJoin(projects, eq(projects.id, events.projectId))
          .where(eq(eventLocations.locationId, locationId)),
        db
          .select()
          .from(postEventFeedback)
          .where(
            and(eq(postEventFeedback.subjectType, 'location'), eq(postEventFeedback.subjectId, locationId)),
          ),
      ]);
      return { visits, quotes: quoteRows, links, feedback };
    },

    // ---- spaces ----
    async listSpaces(locationId: string) {
      const spaceRows = await db
        .select()
        .from(spaces)
        .where(eq(spaces.locationId, locationId))
        .orderBy(spaces.sort);
      const ids = spaceRows.map((s) => s.id);
      const caps =
        ids.length > 0
          ? await db.select().from(spaceCapacities).where(inArray(spaceCapacities.spaceId, ids))
          : [];
      return { spaceRows, caps };
    },
    async getSpace(spaceId: string) {
      const rows = await db.select().from(spaces).where(eq(spaces.id, spaceId)).limit(1);
      return rows[0] ?? null;
    },
    async createSpace(input: typeof spaces.$inferInsert) {
      const rows = await db.insert(spaces).values(input).returning();
      return rows[0]!;
    },
    async updateSpace(spaceId: string, patch: Partial<typeof spaces.$inferInsert>) {
      const rows = await db.update(spaces).set(patch).where(eq(spaces.id, spaceId)).returning();
      return rows[0] ?? null;
    },
    async deleteSpace(spaceId: string) {
      const rows = await db.delete(spaces).where(eq(spaces.id, spaceId)).returning({ id: spaces.id });
      return rows.length > 0;
    },
    async setCapacities(spaceId: string, caps: Array<{ configuration: CapacityConfiguration; capacity: number }>) {
      await db.delete(spaceCapacities).where(eq(spaceCapacities.spaceId, spaceId));
      if (caps.length > 0) {
        await db.insert(spaceCapacities).values(caps.map((c) => ({ ...c, spaceId })));
      }
      return db.select().from(spaceCapacities).where(eq(spaceCapacities.spaceId, spaceId));
    },
    async getCapacities(spaceId: string) {
      return db.select().from(spaceCapacities).where(eq(spaceCapacities.spaceId, spaceId));
    },

    // ---- contacts / suppliers ----
    async addContact(input: typeof locationContacts.$inferInsert) {
      const rows = await db.insert(locationContacts).values(input).returning();
      return rows[0]!;
    },
    async removeContact(locationId: string, contactId: string) {
      const rows = await db
        .delete(locationContacts)
        .where(and(eq(locationContacts.locationId, locationId), eq(locationContacts.contactId, contactId)))
        .returning({ contactId: locationContacts.contactId });
      return rows.length > 0;
    },
    async addSupplier(input: typeof locationSuppliers.$inferInsert) {
      const rows = await db.insert(locationSuppliers).values(input).returning();
      return rows[0]!;
    },
    async updateSupplier(id: string, patch: Partial<typeof locationSuppliers.$inferInsert>) {
      const rows = await db.update(locationSuppliers).set(patch).where(eq(locationSuppliers.id, id)).returning();
      return rows[0] ?? null;
    },
    async removeSupplier(id: string) {
      const rows = await db
        .delete(locationSuppliers)
        .where(eq(locationSuppliers.id, id))
        .returning({ id: locationSuppliers.id });
      return rows.length > 0;
    },

    // ---- media / price lists / project notes ----
    async listMedia(locationId: string) {
      return db.select().from(media).where(eq(media.locationId, locationId));
    },
    async getMedia(id: string) {
      const rows = await db.select().from(media).where(eq(media.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async createMedia(input: typeof media.$inferInsert) {
      const rows = await db.insert(media).values(input).returning();
      return rows[0]!;
    },
    async updateMedia(id: string, patch: Partial<typeof media.$inferInsert>) {
      const rows = await db.update(media).set(patch).where(eq(media.id, id)).returning();
      return rows[0] ?? null;
    },
    async deleteMedia(id: string) {
      const rows = await db.delete(media).where(eq(media.id, id)).returning({ id: media.id });
      return rows.length > 0;
    },
    async listPriceLists(locationId: string) {
      return db.select().from(priceLists).where(eq(priceLists.locationId, locationId));
    },
    async createPriceList(input: typeof priceLists.$inferInsert) {
      const rows = await db.insert(priceLists).values(input).returning();
      return rows[0]!;
    },
    async deletePriceList(id: string) {
      const rows = await db.delete(priceLists).where(eq(priceLists.id, id)).returning({ id: priceLists.id });
      return rows.length > 0;
    },
    async listProjectNotes(locationId: string, projectId?: string) {
      const conds = [eq(locationProjectNotes.locationId, locationId)];
      if (projectId) conds.push(eq(locationProjectNotes.projectId, projectId));
      return db.select().from(locationProjectNotes).where(and(...conds));
    },
    async createProjectNote(input: typeof locationProjectNotes.$inferInsert) {
      const rows = await db.insert(locationProjectNotes).values(input).returning();
      return rows[0]!;
    },

    async capacitiesForLocations(locationIds: string[]) {
      if (locationIds.length === 0) return [];
      return db
        .select({
          locationId: spaces.locationId,
          configuration: spaceCapacities.configuration,
          capacity: spaceCapacities.capacity,
        })
        .from(spaceCapacities)
        .innerJoin(spaces, eq(spaces.id, spaceCapacities.spaceId))
        .where(inArray(spaces.locationId, locationIds));
    },

    async coordinates(ids: string[]) {
      if (ids.length === 0) return [];
      return db
        .select({ id: locations.id, lon: geoLon, lat: geoLat })
        .from(locations)
        .where(inArray(locations.id, ids));
    },
  };
}

export type LocationsRepo = ReturnType<typeof createLocationsRepo>;
