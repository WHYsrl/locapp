import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { buildPrefilterCondition, BriefCriteriaSchema } from '../src/ai/criteria.js';

const toQuery = (criteria: Parameters<typeof buildPrefilterCondition>[0]) =>
  new PgDialect().sqlToQuery(buildPrefilterCondition(criteria));

describe('buildPrefilterCondition', () => {
  it('always excludes soft-deleted locations', () => {
    const q = toQuery({});
    expect(q.sql).toContain('"deleted_at" is null');
  });

  it('filters by city, tags and accessibility', () => {
    const q = toQuery({ city: 'Roma', tags: ['gala_dinner'], accessibility_min: 3 });
    expect(q.sql.toLowerCase()).toContain('ilike');
    expect(q.sql).toContain('&&');
    expect(q.sql).toContain('>=');
    expect(q.params).toContain('Roma');
    expect(q.params).toContain('{"gala_dinner"}');
    expect(q.params).toContain(3);
  });

  it('builds a capacity EXISTS subquery bound to configuration', () => {
    const q = toQuery({ pax: 200, configuration: 'tavoli_tondi' });
    expect(q.sql).toContain('EXISTS (SELECT 1 FROM spaces s JOIN space_capacities sc');
    expect(q.sql).toContain('sc.capacity >=');
    expect(q.sql).toContain('sc.configuration =');
    expect(q.params).toContain(200);
    expect(q.params).toContain('tavoli_tondi');
  });

  it('adds a PostGIS radius clause per near point', () => {
    const q = toQuery({ near: [{ lon: 12.5, lat: 41.9, max_km: 5 }] });
    expect(q.sql).toContain('ST_DWithin');
    expect(q.sql).toContain('ST_MakePoint');
    expect(q.params).toContain(5000);
  });

  it('requires an outdoor space when outdoor_required', () => {
    const q = toQuery({ outdoor_required: true });
    expect(q.sql).toContain("s.kind = 'esterno'");
  });
});

describe('BriefCriteriaSchema', () => {
  it('accepts a full criteria object and rejects bad configurations', () => {
    expect(
      BriefCriteriaSchema.parse({ pax: 150, configuration: 'platea', city: 'Roma', tags: ['conferenze'] }),
    ).toMatchObject({ pax: 150, configuration: 'platea' });
    expect(() => BriefCriteriaSchema.parse({ configuration: 'teatro' })).toThrow();
  });
});
