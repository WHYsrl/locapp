import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import {
  availabilitySlots,
  eventLocations,
  events,
  locations,
  postEventFeedback,
  projects,
  quotes,
  siteVisits,
} from '../schema.js';
import type { Pagination } from '../../lib/pagination.js';

export function createProjectsRepo(db: Db) {
  return {
    // ---- projects ----
    async list(p: Pagination, status?: string) {
      const conds = [isNull(projects.deletedAt)];
      if (status) conds.push(eq(projects.status, status as never));
      const where = and(...conds);
      const rows = await db
        .select()
        .from(projects)
        .where(where)
        .orderBy(desc(projects.updatedAt))
        .limit(p.limit)
        .offset(p.offset);
      const totalRows = await db.select({ count: sql<number>`count(*)::int` }).from(projects).where(where);
      return { rows, total: totalRows[0]?.count ?? 0 };
    },
    async getById(id: string) {
      const rows = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    },
    async create(input: typeof projects.$inferInsert) {
      const rows = await db.insert(projects).values(input).returning();
      return rows[0]!;
    },
    async update(id: string, patch: Partial<typeof projects.$inferInsert>) {
      const rows = await db
        .update(projects)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();
      return rows[0] ?? null;
    },
    async softDelete(id: string) {
      const rows = await db
        .update(projects)
        .set({ deletedAt: new Date() })
        .where(eq(projects.id, id))
        .returning({ id: projects.id });
      return rows.length > 0;
    },

    // ---- events ----
    async listEvents(projectId: string) {
      return db.select().from(events).where(eq(events.projectId, projectId)).orderBy(asc(events.sort));
    },
    async locationCountsByEvent(projectId: string) {
      return db
        .select({
          eventId: eventLocations.eventId,
          status: eventLocations.status,
          count: sql<number>`count(*)::int`,
        })
        .from(eventLocations)
        .innerJoin(events, eq(events.id, eventLocations.eventId))
        .where(eq(events.projectId, projectId))
        .groupBy(eventLocations.eventId, eventLocations.status);
    },
    async getEvent(id: string) {
      const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async createEvent(input: typeof events.$inferInsert) {
      const rows = await db.insert(events).values(input).returning();
      return rows[0]!;
    },
    async updateEvent(id: string, patch: Partial<typeof events.$inferInsert>) {
      const rows = await db
        .update(events)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(events.id, id))
        .returning();
      return rows[0] ?? null;
    },
    async deleteEvent(id: string) {
      const rows = await db.delete(events).where(eq(events.id, id)).returning({ id: events.id });
      return rows.length > 0;
    },
    /** Hard-deletes all project events (event_locations + visits/quotes/availability cascade). */
    async deleteEventsForProject(projectId: string) {
      const rows = await db
        .delete(events)
        .where(eq(events.projectId, projectId))
        .returning({ id: events.id });
      return rows.length;
    },

    // ---- shortlist (event_locations) ----
    async listEventLocations(eventId: string) {
      return db
        .select({
          id: eventLocations.id,
          eventId: eventLocations.eventId,
          locationId: eventLocations.locationId,
          status: eventLocations.status,
          matchScore: eventLocations.matchScore,
          matchReasons: eventLocations.matchReasons,
          clientFeedback: eventLocations.clientFeedback,
          notes: eventLocations.notes,
          createdAt: eventLocations.createdAt,
          locationName: locations.name,
          locationCity: locations.city,
          locationThumbnail: locations.thumbnailUrl,
          locationTags: locations.smartTags,
          lon: sql<number | null>`ST_X(${locations.geom})`,
          lat: sql<number | null>`ST_Y(${locations.geom})`,
        })
        .from(eventLocations)
        .innerJoin(locations, eq(locations.id, eventLocations.locationId))
        .where(eq(eventLocations.eventId, eventId));
    },
    async getEventLocation(id: string) {
      const rows = await db.select().from(eventLocations).where(eq(eventLocations.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async addEventLocation(input: typeof eventLocations.$inferInsert) {
      const rows = await db.insert(eventLocations).values(input).returning();
      return rows[0]!;
    },
    async updateEventLocation(id: string, patch: Partial<typeof eventLocations.$inferInsert>) {
      const rows = await db
        .update(eventLocations)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(eventLocations.id, id))
        .returning();
      return rows[0] ?? null;
    },
    async deleteEventLocation(id: string) {
      const rows = await db
        .delete(eventLocations)
        .where(eq(eventLocations.id, id))
        .returning({ id: eventLocations.id });
      return rows.length > 0;
    },

    // ---- shortlist sub-resources ----
    async listVisits(eventLocationIds: string[]) {
      if (eventLocationIds.length === 0) return [];
      return db.select().from(siteVisits).where(inArray(siteVisits.eventLocationId, eventLocationIds));
    },
    async createVisit(input: typeof siteVisits.$inferInsert) {
      const rows = await db.insert(siteVisits).values(input).returning();
      return rows[0]!;
    },
    async deleteVisit(id: string) {
      const rows = await db.delete(siteVisits).where(eq(siteVisits.id, id)).returning({ id: siteVisits.id });
      return rows.length > 0;
    },
    async listQuotes(eventLocationIds: string[]) {
      if (eventLocationIds.length === 0) return [];
      return db.select().from(quotes).where(inArray(quotes.eventLocationId, eventLocationIds));
    },
    async createQuote(input: typeof quotes.$inferInsert) {
      const rows = await db.insert(quotes).values(input).returning();
      return rows[0]!;
    },
    async updateQuote(id: string, patch: Partial<typeof quotes.$inferInsert>) {
      const rows = await db.update(quotes).set(patch).where(eq(quotes.id, id)).returning();
      return rows[0] ?? null;
    },
    async deleteQuote(id: string) {
      const rows = await db.delete(quotes).where(eq(quotes.id, id)).returning({ id: quotes.id });
      return rows.length > 0;
    },
    async listAvailability(eventLocationIds: string[]) {
      if (eventLocationIds.length === 0) return [];
      return db
        .select()
        .from(availabilitySlots)
        .where(inArray(availabilitySlots.eventLocationId, eventLocationIds));
    },
    async createAvailability(input: typeof availabilitySlots.$inferInsert) {
      const rows = await db.insert(availabilitySlots).values(input).returning();
      return rows[0]!;
    },
    async deleteAvailability(id: string) {
      const rows = await db
        .delete(availabilitySlots)
        .where(eq(availabilitySlots.id, id))
        .returning({ id: availabilitySlots.id });
      return rows.length > 0;
    },

    // ---- feedback ----
    async createFeedback(inputs: Array<typeof postEventFeedback.$inferInsert>) {
      if (inputs.length === 0) return [];
      return db.insert(postEventFeedback).values(inputs).returning();
    },
    async listFeedbackByEvent(eventId: string) {
      return db.select().from(postEventFeedback).where(eq(postEventFeedback.eventId, eventId));
    },
    async listFeedbackForSubject(subjectType: 'location' | 'company' | 'contact', subjectId: string) {
      return db
        .select()
        .from(postEventFeedback)
        .where(and(eq(postEventFeedback.subjectType, subjectType), eq(postEventFeedback.subjectId, subjectId)));
    },

    // ---- maps ----
    async mapLocationsForEvents(eventIds: string[]) {
      if (eventIds.length === 0) return [];
      return db
        .select({
          locationId: locations.id,
          name: locations.name,
          city: locations.city,
          addressLine: locations.addressLine,
          status: eventLocations.status,
          eventId: eventLocations.eventId,
          lon: sql<number | null>`ST_X(${locations.geom})`,
          lat: sql<number | null>`ST_Y(${locations.geom})`,
        })
        .from(eventLocations)
        .innerJoin(locations, eq(locations.id, eventLocations.locationId))
        .where(inArray(eventLocations.eventId, eventIds));
    },
  };
}

export type ProjectsRepo = ReturnType<typeof createProjectsRepo>;
