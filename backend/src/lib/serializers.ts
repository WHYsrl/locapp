import type { EventLocationStatus, Logistics } from '../db/schema.js';

/** Fields a nested location inherits from its parent when its own value is null. */
export const INHERITED_FIELDS = [
  'addressLine',
  'city',
  'province',
  'postalCode',
  'googleMapsUrl',
  'phone',
  'email',
  'website',
] as const;

export interface EffectiveSource {
  logistics?: Logistics | null;
  addressLine?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  googleMapsUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

export interface EffectiveResult {
  effective_logistics: Logistics | null;
  effective_address: {
    address_line: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    google_maps_url: string | null;
  };
  effective_contact: {
    phone: string | null;
    email: string | null;
    website: string | null;
  };
  inherited_fields: string[];
}

/**
 * Resolves effective_* fields for a nested location: own values win,
 * null values fall back to the parent (SPEC §2.3).
 */
export function resolveEffective(location: EffectiveSource, parent: EffectiveSource | null): EffectiveResult {
  const inherited: string[] = [];

  let logistics: Logistics | null = location.logistics ?? null;
  if (parent) {
    if (!location.logistics && parent.logistics) {
      logistics = parent.logistics;
      inherited.push('logistics');
    } else if (location.logistics && parent.logistics) {
      logistics = { ...parent.logistics, ...location.logistics };
    }
  }

  const pick = (own: string | null | undefined, parentVal: string | null | undefined, field: string) => {
    if (own != null) return own;
    if (parent && parentVal != null) {
      inherited.push(field);
      return parentVal;
    }
    return null;
  };

  return {
    effective_logistics: logistics,
    effective_address: {
      address_line: pick(location.addressLine, parent?.addressLine, 'address_line'),
      city: pick(location.city, parent?.city, 'city'),
      province: pick(location.province, parent?.province, 'province'),
      postal_code: pick(location.postalCode, parent?.postalCode, 'postal_code'),
      google_maps_url: pick(location.googleMapsUrl, parent?.googleMapsUrl, 'google_maps_url'),
    },
    effective_contact: {
      phone: pick(location.phone, parent?.phone, 'phone'),
      email: pick(location.email, parent?.email, 'email'),
      website: pick(location.website, parent?.website, 'website'),
    },
    inherited_fields: inherited,
  };
}

export interface UsageRow {
  projectId: string;
  projectName: string;
  eventId: string;
  eventName: string;
  status: EventLocationStatus;
  dateStart: string | null;
  dateEnd: string | null;
}

const PROPOSED_STATUSES: EventLocationStatus[] = [
  'proposta',
  'sopralluogo_fissato',
  'in_valutazione',
  'preferita',
  'confermata',
  'utilizzata',
];

/**
 * Derives proposta/utilizzata flags from event_locations rows (SPEC §2.4):
 * they are never stored on the base card.
 */
export function deriveUsage(rows: UsageRow[]) {
  const entries = rows.map((r) => ({
    project: { id: r.projectId, name: r.projectName },
    event: { id: r.eventId, name: r.eventName },
    status: r.status,
    dates: { start: r.dateStart, end: r.dateEnd },
  }));
  return {
    proposta: rows.some((r) => PROPOSED_STATUSES.includes(r.status)),
    utilizzata: rows.some((r) => r.status === 'utilizzata'),
    entries,
  };
}

export interface TimelineItem {
  type: 'site_visit' | 'quote' | 'event_link' | 'feedback';
  at: string | null;
  data: Record<string, unknown>;
}

/** Merges visits, quotes, shortlist entries and feedback into one sorted timeline. */
export function buildHistoryTimeline(input: {
  visits: Array<{ id: string; scheduledAt: Date | string | null; outcome: string | null; withClient: boolean; eventId: string }>;
  quotes: Array<{ id: string; amount: string | null; currency: string; status: string; receivedAt: Date | string | null; eventId: string }>;
  links: Array<{ eventId: string; eventName: string; projectName: string; status: string; dateStart: string | null; createdAt: Date | string | null }>;
  feedback: Array<{ id: string; ratings: Record<string, number> | null; notes: string | null; createdAt: Date | string | null }>;
}): TimelineItem[] {
  const iso = (v: Date | string | null | undefined): string | null =>
    v == null ? null : v instanceof Date ? v.toISOString() : String(v);

  const items: TimelineItem[] = [
    ...input.visits.map((v) => ({
      type: 'site_visit' as const,
      at: iso(v.scheduledAt),
      data: { id: v.id, outcome: v.outcome, with_client: v.withClient, event_id: v.eventId },
    })),
    ...input.quotes.map((q) => ({
      type: 'quote' as const,
      at: iso(q.receivedAt),
      data: { id: q.id, amount: q.amount, currency: q.currency, status: q.status, event_id: q.eventId },
    })),
    ...input.links.map((l) => ({
      type: 'event_link' as const,
      at: iso(l.createdAt),
      data: {
        event_id: l.eventId,
        event_name: l.eventName,
        project_name: l.projectName,
        status: l.status,
        date_start: l.dateStart,
      },
    })),
    ...input.feedback.map((f) => ({
      type: 'feedback' as const,
      at: iso(f.createdAt),
      data: { id: f.id, ratings: f.ratings, notes: f.notes },
    })),
  ];

  return items.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

export interface CompareShortlistRow {
  id: string;
  locationId: string;
  locationName: string;
  status: string;
  matchScore: string | null;
}

/** Builds the side-by-side comparison matrix for an event shortlist. */
export function buildCompareMatrix(input: {
  shortlist: CompareShortlistRow[];
  capacities: Map<string, Array<{ configuration: string; capacity: number }>>;
  quotes: Map<string, Array<{ amount: string | null; status: string }>>;
  availability: Map<string, Array<{ date: string; status: string }>>;
}) {
  return input.shortlist.map((row) => {
    const caps = input.capacities.get(row.locationId) ?? [];
    const capacityByConfig: Record<string, number> = {};
    for (const c of caps) {
      capacityByConfig[c.configuration] = Math.max(capacityByConfig[c.configuration] ?? 0, c.capacity);
    }
    const quoteAmounts = (input.quotes.get(row.id) ?? [])
      .map((q) => (q.amount == null ? null : Number.parseFloat(q.amount)))
      .filter((v): v is number => v != null && Number.isFinite(v));
    return {
      event_location_id: row.id,
      location: { id: row.locationId, name: row.locationName },
      status: row.status,
      match_score: row.matchScore == null ? null : Number.parseFloat(row.matchScore),
      capacity_by_configuration: capacityByConfig,
      max_capacity: Object.values(capacityByConfig).reduce((a, b) => Math.max(a, b), 0) || null,
      price_range:
        quoteAmounts.length > 0
          ? { min: Math.min(...quoteAmounts), max: Math.max(...quoteAmounts) }
          : null,
      availability: input.availability.get(row.id) ?? [],
    };
  });
}
