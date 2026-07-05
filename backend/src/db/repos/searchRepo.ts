import { sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { locations } from '../schema.js';
import { buildPrefilterCondition, type BriefCriteria } from '../../ai/criteria.js';

export function createSearchRepo(db: Db) {
  return {
    /** SQL prefilter for brief search: cheap structured filtering before AI rerank. */
    async prefilterLocations(criteria: BriefCriteria, limit = 50) {
      const cond = buildPrefilterCondition(criteria);
      return db
        .select({
          id: locations.id,
          name: locations.name,
          summary: locations.summary,
          city: locations.city,
          smartTags: locations.smartTags,
          logistics: locations.logistics,
          setup: locations.setup,
          party: locations.party,
          technical: locations.technical,
          accessibilityRating: locations.accessibilityRating,
          availabilityRules: locations.availabilityRules,
          impressions: locations.impressions,
          thumbnailUrl: locations.thumbnailUrl,
          lon: sql<number | null>`ST_X(${locations.geom})`,
          lat: sql<number | null>`ST_Y(${locations.geom})`,
        })
        .from(locations)
        .where(cond)
        .limit(limit);
    },
  };
}

export type SearchRepo = ReturnType<typeof createSearchRepo>;
