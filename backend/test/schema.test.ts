import { describe, expect, it } from 'vitest';
import { getTableColumns, getTableName } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';

describe('drizzle schema', () => {
  it('defines all tables from SPEC §3', () => {
    const expected = [
      'companies',
      'contacts',
      'company_contacts',
      'locations',
      'spaces',
      'space_capacities',
      'location_contacts',
      'location_suppliers',
      'media',
      'price_lists',
      'pois',
      'projects',
      'events',
      'event_locations',
      'site_visits',
      'quotes',
      'availability_slots',
      'location_project_notes',
      'post_event_feedback',
      'ingestion_jobs',
      'users',
    ];
    const tables = [
      schema.companies, schema.contacts, schema.companyContacts, schema.locations, schema.spaces,
      schema.spaceCapacities, schema.locationContacts, schema.locationSuppliers, schema.media,
      schema.priceLists, schema.pois, schema.projects, schema.events, schema.eventLocations,
      schema.siteVisits, schema.quotes, schema.availabilitySlots, schema.locationProjectNotes,
      schema.postEventFeedback, schema.ingestionJobs, schema.users,
    ];
    expect(tables.map((t) => getTableName(t))).toEqual(expected);
  });

  it('locations has geometry, vector and soft-delete columns with correct SQL types', () => {
    const cols = getTableColumns(schema.locations);
    expect(cols.geom.getSQLType()).toBe('geometry(Point,4326)');
    expect(cols.embedding.getSQLType()).toBe('vector(1024)');
    expect(cols.deletedAt).toBeDefined();
    expect(cols.parentLocationId).toBeDefined();
    expect(cols.visitStatus.default).toBe('da_visitare');
    expect(cols.country.default).toBe('IT');
  });

  it('event_locations defaults to preselezionata and quotes default to EUR', () => {
    expect(getTableColumns(schema.eventLocations).status.default).toBe('preselezionata');
    expect(getTableColumns(schema.quotes).currency.default).toBe('EUR');
    expect(getTableColumns(schema.ingestionJobs).status.default).toBe('pending');
  });

  it('geometry custom type serializes to EWKT for the driver', () => {
    const cols = getTableColumns(schema.pois);
    const driverValue = cols.geom.mapToDriverValue({ lon: 12.5, lat: 41.9 });
    expect(driverValue).toBe('SRID=4326;POINT(12.5 41.9)');
  });
});
