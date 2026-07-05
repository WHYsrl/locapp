import { and, arrayOverlaps, gte, ilike, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { locations } from '../db/schema.js';

/** Structured search criteria parsed from a free-text brief by Claude. */
export const BriefCriteriaSchema = z.object({
  pax: z.number().int().positive().nullish(),
  configuration: z
    .enum(['in_piedi', 'tavoli_tondi', 'tavolo_imperiale', 'platea', 'ferro_di_cavallo', 'classroom', 'cocktail'])
    .nullish(),
  city: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  event_type: z.string().nullish(),
  outdoor_required: z.boolean().nullish(),
  accessibility_min: z.number().int().min(1).max(5).nullish(),
  keywords: z.array(z.string()).nullish(),
  near: z
    .array(
      z.object({
        lon: z.number(),
        lat: z.number(),
        max_km: z.number().positive().default(15),
        label: z.string().nullish(),
      }),
    )
    .nullish(),
});

export type BriefCriteria = z.infer<typeof BriefCriteriaSchema>;

/**
 * Builds the Drizzle SQL prefilter for brief search:
 * capacity, tags, city, accessibility and PostGIS geo radius.
 */
export function buildPrefilterCondition(criteria: BriefCriteria): SQL {
  const conds: SQL[] = [isNull(locations.deletedAt)];

  if (criteria.city) conds.push(ilike(locations.city, criteria.city));
  if (criteria.tags && criteria.tags.length > 0) {
    conds.push(arrayOverlaps(locations.smartTags, criteria.tags));
  }
  if (criteria.accessibility_min != null) {
    conds.push(gte(locations.accessibilityRating, criteria.accessibility_min));
  }
  if (criteria.pax != null) {
    const cfgClause = criteria.configuration
      ? sql` AND sc.configuration = ${criteria.configuration}`
      : sql``;
    conds.push(
      sql`EXISTS (SELECT 1 FROM spaces s JOIN space_capacities sc ON sc.space_id = s.id
        WHERE s.location_id = ${locations.id} AND sc.capacity >= ${criteria.pax}${cfgClause})`,
    );
  }
  if (criteria.outdoor_required) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM spaces s WHERE s.location_id = ${locations.id} AND s.kind = 'esterno')`,
    );
  }
  if (criteria.near && criteria.near.length > 0) {
    const geoConds = criteria.near.map(
      (n) =>
        sql`ST_DWithin(${locations.geom}::geography,
          ST_SetSRID(ST_MakePoint(${n.lon}, ${n.lat}), 4326)::geography, ${n.max_km * 1000})`,
    );
    for (const g of geoConds) conds.push(g);
  }

  return and(...conds)!;
}
