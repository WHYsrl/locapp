import type { Repos } from '../db/repos/index.js';
import type { CapacityConfiguration, SpaceKind, SupplierRequirement } from '../db/schema.js';
import type { ExtractedLocationDraft } from '../ai/extraction.js';
import { badRequest } from '../lib/errors.js';

/** Maps ExtractedLocationDraft location keys (snake_case) to drizzle columns. */
const LOCATION_FIELD_MAP: Record<string, string> = {
  name: 'name',
  slug: 'slug',
  summary: 'summary',
  address_line: 'addressLine',
  city: 'city',
  province: 'province',
  postal_code: 'postalCode',
  country: 'country',
  google_maps_url: 'googleMapsUrl',
  thumbnail_url: 'thumbnailUrl',
  visit_status: 'visitStatus',
  logistics: 'logistics',
  setup: 'setup',
  party: 'party',
  technical: 'technical',
  accessibility_rating: 'accessibilityRating',
  accessibility_notes: 'accessibilityNotes',
  availability_rules: 'availabilityRules',
  smart_tags: 'smartTags',
  impressions: 'impressions',
};

export interface AcceptMap {
  [fieldPath: string]: boolean;
}

export function buildLocationPatch(draft: ExtractedLocationDraft, accept: AcceptMap): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft.location)) {
    const column = LOCATION_FIELD_MAP[key];
    if (!column) continue;
    if (accept[`location.${key}`] === true) patch[column] = value;
  }
  return patch;
}

/**
 * Applies accepted draft fields to a location (creating it when needed),
 * plus accepted spaces / contacts / suppliers / price items.
 */
export async function applyDraft(
  repos: Repos,
  draft: ExtractedLocationDraft,
  accept: AcceptMap,
  locationId: string | null,
): Promise<{ locationId: string; applied: string[] }> {
  const applied: string[] = [];
  const patch = buildLocationPatch(draft, accept);
  for (const key of Object.keys(draft.location)) {
    if (accept[`location.${key}`] === true) applied.push(`location.${key}`);
  }

  let targetId = locationId;
  if (!targetId) {
    const name = (patch['name'] as string | undefined) ?? (draft.location['name'] as string | undefined);
    if (!name) throw badRequest('Cannot create a location without an accepted name field');
    const created = await repos.locations.create({ ...patch, name } as never);
    targetId = created.id;
  } else if (Object.keys(patch).length > 0) {
    const updated = await repos.locations.update(targetId, patch as never);
    if (!updated) throw badRequest('Location not found');
  }

  if (accept['spaces'] === true) {
    for (const s of draft.spaces) {
      const space = await repos.locations.createSpace({
        locationId: targetId,
        kind: s.kind as SpaceKind,
        name: s.name,
        areaSqm: s.area_sqm == null ? null : String(s.area_sqm),
        heightM: s.height_m == null ? null : String(s.height_m),
        covered: (s.covered ?? null) as never,
      });
      const caps = Object.entries(s.capacities).map(([configuration, capacity]) => ({
        configuration: configuration as CapacityConfiguration,
        capacity,
      }));
      if (caps.length > 0) await repos.locations.setCapacities(space.id, caps);
    }
    applied.push('spaces');
  }

  if (accept['contacts'] === true) {
    for (const c of draft.contacts) {
      const contact = await repos.registry.createContact({
        firstName: c.first_name || '-',
        lastName: c.last_name || '-',
        email: c.email || null,
        phone: c.phone || null,
      });
      await repos.locations.addContact({
        locationId: targetId,
        contactId: contact.id,
        role: c.role,
      });
    }
    applied.push('contacts');
  }

  if (accept['suppliers'] === true) {
    for (const s of draft.suppliers) {
      const company = await repos.registry.createCompany({
        name: s.company_name,
        kind: 'fornitore',
        supplierCategories: [s.category],
      });
      await repos.locations.addSupplier({
        locationId: targetId,
        companyId: company.id,
        category: s.category,
        requirement: s.requirement as SupplierRequirement,
      });
    }
    applied.push('suppliers');
  }

  if (accept['price_items'] === true && draft.price_items.length > 0) {
    await repos.locations.createPriceList({
      locationId: targetId,
      name: 'Listino estratto da AI',
      items: draft.price_items as unknown as Array<Record<string, unknown>>,
      extractedByAi: true,
    });
    applied.push('price_items');
  }

  return { locationId: targetId, applied };
}
