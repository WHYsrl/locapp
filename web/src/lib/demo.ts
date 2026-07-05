// In-memory demo backend. Implements the same surface as the real API client
// (see api.ts) on top of fixture data, so every screen works without a backend.

import { buildDemoDB, type DemoDB, type FixtureEventLocation } from "./fixtures";
import type {
  AvailabilitySlot,
  Company,
  CompanyDetail,
  CompareMatrix,
  Configuration,
  Contact,
  ContactDetail,
  EffectiveStatus,
  EventItem,
  EventLocationEntry,
  EventLocationStatus,
  EventWithCounts,
  ExtractedDraft,
  HistoryEntry,
  IngestSourceType,
  IngestionJob,
  LocationBase,
  LocationDetail,
  LocationFilters,
  LocationListItem,
  MapFeatureCollection,
  Poi,
  Project,
  ProjectDetail,
  Quote,
  SearchResult,
  SiteVisit,
  Space,
  UsageEntry,
  User,
} from "./types";
import { lngLatOf as coords } from "./types";
import { CONFIG_LABELS, CONFIGURATIONS, formatMoney } from "./labels";

const db: DemoDB = buildDemoDB();

let counter = 100;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

function delay<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// Statuses that count as "proposta o oltre" (SPEC §2.4)
const PROPOSED_PLUS: EventLocationStatus[] = [
  "proposta",
  "sopralluogo_fissato",
  "in_valutazione",
  "preferita",
  "confermata",
  "utilizzata",
];

function elsOfLocation(locationId: string): FixtureEventLocation[] {
  return db.eventLocations.filter((el) => el.location_id === locationId);
}

function effectiveStatus(loc: LocationBase): EffectiveStatus {
  const els = elsOfLocation(loc.id);
  if (els.some((el) => el.status === "utilizzata")) return "utilizzata";
  if (els.some((el) => PROPOSED_PLUS.includes(el.status))) return "proposta";
  return loc.visit_status;
}

function spacesOf(locationId: string): Space[] {
  return db.spaces
    .filter((s) => s.location_id === locationId)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

function capacitiesOf(locationId: string): Partial<Record<Configuration, number>> {
  const out: Partial<Record<Configuration, number>> = {};
  for (const sp of spacesOf(locationId)) {
    for (const [cfg, cap] of Object.entries(sp.capacities) as [Configuration, number][]) {
      out[cfg] = Math.max(out[cfg] ?? 0, cap);
    }
  }
  return out;
}

function maxCapacity(locationId: string): number | null {
  const caps = Object.values(capacitiesOf(locationId));
  return caps.length ? Math.max(...caps) : null;
}

function toListItem(loc: LocationBase): LocationListItem {
  const parent = loc.parent_location_id
    ? db.locations.find((l) => l.id === loc.parent_location_id)
    : null;
  return {
    ...loc,
    effective_status: effectiveStatus(loc),
    max_capacity: maxCapacity(loc.id),
    capacities: capacitiesOf(loc.id),
    parent_name: parent?.name ?? null,
  };
}

function locOrThrow(id: string): LocationBase {
  const loc = db.locations.find((l) => l.id === id);
  if (!loc) throw new Error(`Location non trovata: ${id}`);
  return loc;
}

// ---- auth -------------------------------------------------------------------

export function login(email: string): Promise<{ token: string; user: User }> {
  return delay({
    token: "demo-token",
    user: { id: "user-demo", email: email || "demo@venuescout.it", name: "Utente Demo", role: "admin" },
  });
}

// ---- locations ----------------------------------------------------------------

export function listLocations(filters: LocationFilters = {}): Promise<LocationListItem[]> {
  let items = db.locations.map(toListItem);
  if (filters.root_only) items = items.filter((l) => !l.parent_location_id);
  if (filters.q) {
    const q = filters.q.toLowerCase();
    items = items.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.summary ?? "").toLowerCase().includes(q) ||
        (l.city ?? "").toLowerCase().includes(q)
    );
  }
  if (filters.city) {
    items = items.filter((l) => {
      const city = l.city ?? (l.parent_location_id ? db.locations.find((p) => p.id === l.parent_location_id)?.city : null);
      return city === filters.city;
    });
  }
  if (filters.tag) items = items.filter((l) => (l.smart_tags ?? []).includes(filters.tag!));
  if (filters.status) items = items.filter((l) => l.effective_status === filters.status);
  if (filters.min_capacity) items = items.filter((l) => (l.max_capacity ?? 0) >= filters.min_capacity!);
  if (filters.configuration) {
    items = items.filter((l) => {
      const cap = l.capacities?.[filters.configuration as Configuration];
      if (!cap) return false;
      return !filters.min_capacity || cap >= filters.min_capacity;
    });
  }
  return delay(items);
}

export function getLocation(id: string): Promise<LocationDetail> {
  const loc = locOrThrow(id);
  const parent = loc.parent_location_id ? db.locations.find((l) => l.id === loc.parent_location_id) : null;
  const inherited = !loc.logistics && !!parent?.logistics;
  const els = elsOfLocation(id);
  const usage_summary = {
    proposta: els.filter((el) => PROPOSED_PLUS.includes(el.status) && el.status !== "utilizzata").length,
    utilizzata: els.filter((el) => el.status === "utilizzata").length,
  };
  const detail: LocationDetail = {
    ...loc,
    parent: parent ? { id: parent.id, name: parent.name } : null,
    children: db.locations.filter((l) => l.parent_location_id === id).map(toListItem),
    effective_logistics: loc.logistics ?? parent?.logistics ?? null,
    logistics_inherited: inherited,
    spaces: spacesOf(id),
    contacts: db.locationContacts
      .filter((lc) => lc.location_id === id)
      .map((lc) => ({
        contact: db.contacts.find((c) => c.id === lc.contact_id)!,
        company: lc.company_id ? db.companies.find((c) => c.id === lc.company_id) ?? null : null,
        role: lc.role,
      })),
    suppliers: db.suppliers
      .filter((s) => s.location_id === id)
      .map((s) => ({
        id: s.id,
        company: db.companies.find((c) => c.id === s.company_id)!,
        contact: s.contact_id ? db.contacts.find((c) => c.id === s.contact_id) ?? null : null,
        category: s.category,
        requirement: s.requirement,
        conditions: s.conditions,
        rating: s.rating,
      })),
    media: db.media.filter((m) => m.location_id === id),
    price_lists: db.priceLists.filter((p) => p.location_id === id),
    usage_summary,
    effective_status: effectiveStatus(loc),
    project_notes: db.projectNotes
      .filter((n) => n.location_id === id)
      .map((n) => ({
        project_name: db.projects.find((p) => p.id === n.project_id)?.name ?? "",
        event_name: n.event_id ? db.events.find((e) => e.id === n.event_id)?.name : undefined,
        notes: n.notes,
      })),
  };
  // address inheritance for children
  if (parent && !detail.address_line) {
    detail.address_line = parent.address_line;
    detail.city = detail.city ?? parent.city;
    detail.province = detail.province ?? parent.province;
    detail.postal_code = detail.postal_code ?? parent.postal_code;
  }
  if (parent && detail.lng == null) {
    detail.lng = parent.lng;
    detail.lat = parent.lat;
  }
  return delay(detail);
}

export function getLocationUsage(id: string): Promise<UsageEntry[]> {
  const entries = elsOfLocation(id)
    .filter((el) => PROPOSED_PLUS.includes(el.status))
    .map((el) => {
      const event = db.events.find((e) => e.id === el.event_id)!;
      const project = db.projects.find((p) => p.id === event.project_id)!;
      return {
        project: { id: project.id, name: project.name },
        event: { id: event.id, name: event.name, date_start: event.date_start, date_end: event.date_end },
        status: el.status,
        dates: event.date_start ?? null,
      };
    });
  return delay(entries);
}

export function getLocationHistory(id: string): Promise<HistoryEntry[]> {
  const out: HistoryEntry[] = [];
  const loc = locOrThrow(id);
  if (loc.created_at) {
    out.push({ id: `h-created-${id}`, date: loc.created_at, type: "creazione", title: "Scheda creata" });
  }
  for (const el of elsOfLocation(id)) {
    const event = db.events.find((e) => e.id === el.event_id)!;
    const project = db.projects.find((p) => p.id === event.project_id)!;
    out.push({
      id: `h-el-${el.id}`,
      date: el.created_at,
      type: "evento",
      title: `Inserita in shortlist — ${event.name}`,
      description: `Progetto ${project.name}`,
    });
    for (const v of db.visits.filter((v) => v.event_location_id === el.id)) {
      out.push({
        id: `h-sv-${v.id}`,
        date: v.scheduled_at,
        type: "sopralluogo",
        title: `Sopralluogo — ${event.name}`,
        description: v.outcome ?? (v.with_client ? "Con il cliente" : undefined),
      });
    }
    for (const q of db.quotes.filter((q) => q.event_location_id === el.id)) {
      out.push({
        id: `h-q-${q.id}`,
        date: q.received_at ?? el.created_at,
        type: "preventivo",
        title: `Preventivo ${q.status} — ${event.name}`,
        description: q.amount ? formatMoney(q.amount, q.currency) : undefined,
      });
    }
    if (el.client_feedback) {
      out.push({
        id: `h-fb-${el.id}`,
        date: el.created_at,
        type: "feedback",
        title: `Feedback cliente — ${event.name}`,
        description: el.client_feedback,
      });
    }
  }
  out.sort((a, b) => b.date.localeCompare(a.date));
  return delay(out);
}

export function createLocation(payload: Partial<LocationBase>): Promise<LocationBase> {
  const loc: LocationBase = {
    id: uid("loc"),
    parent_location_id: payload.parent_location_id ?? null,
    name: payload.name ?? "Nuova location",
    visit_status: payload.visit_status ?? "da_visitare",
    country: "IT",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...payload,
  } as LocationBase;
  db.locations.push(loc);
  return delay(loc);
}

export function updateLocation(id: string, payload: Partial<LocationBase>): Promise<LocationBase> {
  const loc = locOrThrow(id);
  Object.assign(loc, payload, { updated_at: new Date().toISOString() });
  return delay(loc);
}

// ---- pois & search ------------------------------------------------------------

export function listPois(): Promise<Poi[]> {
  return delay(db.pois);
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const BRIEF_TAGS: [RegExp, string, string][] = [
  [/gala|cena|placée|placee/i, "gala_dinner", "cena di gala"],
  [/conferenz|plenaria|convegno|convention|meeting/i, "conferenze", "conferenza"],
  [/festa|party|dj/i, "feste", "festa/party"],
  [/lancio|presentazione prodotto/i, "lancio", "lancio prodotto"],
  [/matrimonio|wedding/i, "wedding", "matrimonio"],
  [/shooting|riprese/i, "shooting", "shooting"],
  [/pranzo|lunch/i, "lunch", "pranzo"],
];

export function searchBrief(params: {
  brief: string;
  near_poi_id?: string;
  max_minutes?: number;
  limit?: number;
}): Promise<SearchResult[]> {
  const { brief } = params;
  const paxMatch = brief.match(/(\d{2,4})\s*(pax|person[ea]|ospiti|invitati)/i) ?? brief.match(/per\s+(\d{2,4})/i);
  const pax = paxMatch ? parseInt(paxMatch[1], 10) : null;
  const wantedTags = BRIEF_TAGS.filter(([re]) => re.test(brief));
  const wantsOutdoor = /estern|giardino|parco|all'aperto|terrazz/i.test(brief);
  const poi = params.near_poi_id ? db.pois.find((p) => p.id === params.near_poi_id) : null;

  const results: SearchResult[] = db.locations
    .filter((l) => !l.parent_location_id || true)
    .map((loc) => {
      const item = toListItem(loc);
      const matched: string[] = [];
      const unmatched: string[] = [];
      const to_verify: string[] = [];
      let score = 45;

      for (const [, tag, label] of wantedTags) {
        if ((loc.smart_tags ?? []).includes(tag)) {
          matched.push(`Adatta a ${label}`);
          score += 14;
        } else {
          unmatched.push(`Non taggata per ${label}`);
          score -= 8;
        }
      }
      if (pax) {
        const cap = item.max_capacity ?? 0;
        if (cap >= pax) {
          matched.push(`Capienza massima ${cap} ≥ ${pax} pax`);
          score += 18;
        } else if (cap >= pax * 0.8) {
          to_verify.push(`Capienza ${cap} vicina ai ${pax} pax richiesti: verificare configurazione`);
          score += 4;
        } else {
          unmatched.push(`Capienza massima ${cap} < ${pax} pax`);
          score -= 20;
        }
      }
      if (wantsOutdoor) {
        const hasOutdoor = spacesOf(loc.id).some((s) => s.kind === "esterno");
        if (hasOutdoor) {
          matched.push("Dispone di spazi esterni");
          score += 8;
        } else {
          unmatched.push("Nessuno spazio esterno");
          score -= 6;
        }
      }
      if (loc.visit_status === "da_visitare") to_verify.push("Location non ancora visitata");
      if (loc.availability_rules) to_verify.push(`Regole di disponibilità: ${loc.availability_rules}`);

      const distances: SearchResult["distances"] = [];
      if (poi) {
        const ll = coords(loc) ?? coords(db.locations.find((p) => p.id === loc.parent_location_id) ?? loc);
        if (ll) {
          const km = haversineKm(ll, [poi.lng, poi.lat]);
          const minutes = Math.round(km < 3 ? km * 6 : 10 + km * 1.1);
          distances.push({ poi: poi.name, km: Math.round(km * 10) / 10, minutes_car: minutes });
          if (params.max_minutes && minutes > params.max_minutes) {
            unmatched.push(`${minutes} min da ${poi.name} > ${params.max_minutes} min richiesti`);
            score -= 15;
          } else {
            matched.push(`A ${minutes} min di auto da ${poi.name}`);
            score += 6;
          }
        }
      }

      score = Math.max(20, Math.min(97, Math.round(score)));
      return { location: item, score, reasons: { matched, unmatched, to_verify }, distances };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit ?? 10);

  return delay(results, 600);
}

// ---- projects & events ---------------------------------------------------------

function eventWithCounts(ev: EventItem): EventWithCounts {
  const counts: Partial<Record<EventLocationStatus, number>> = {};
  for (const el of db.eventLocations.filter((el) => el.event_id === ev.id)) {
    counts[el.status] = (counts[el.status] ?? 0) + 1;
  }
  return { ...ev, location_counts: counts };
}

export function listProjects(): Promise<Project[]> {
  return delay(
    db.projects.map((p) => ({
      ...p,
      events_count: db.events.filter((e) => e.project_id === p.id).length,
    }))
  );
}

export function createProject(payload: { name: string; client_name?: string; notes?: string }): Promise<Project> {
  const proj: Project = {
    id: uid("proj"),
    name: payload.name,
    client_name: payload.client_name ?? null,
    status: "attivo",
    notes: payload.notes ?? null,
    created_at: new Date().toISOString(),
  };
  db.projects.push(proj);
  return delay(proj);
}

export function getProject(id: string): Promise<ProjectDetail> {
  const proj = db.projects.find((p) => p.id === id);
  if (!proj) throw new Error(`Progetto non trovato: ${id}`);
  const events = db.events
    .filter((e) => e.project_id === id)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map(eventWithCounts);
  return delay({ ...proj, events });
}

export function createEvent(projectId: string, payload: Partial<EventItem>): Promise<EventItem> {
  const ev: EventItem = {
    id: uid("ev"),
    project_id: projectId,
    name: payload.name ?? "Nuovo evento",
    event_type: payload.event_type ?? null,
    date_start: payload.date_start ?? null,
    date_end: payload.date_end ?? null,
    pax: payload.pax ?? null,
    brief: payload.brief ?? null,
    sort: db.events.filter((e) => e.project_id === projectId).length + 1,
  };
  db.events.push(ev);
  return delay(ev);
}

export function getEvent(id: string): Promise<EventItem & { project: Project }> {
  const ev = db.events.find((e) => e.id === id);
  if (!ev) throw new Error(`Evento non trovato: ${id}`);
  const project = db.projects.find((p) => p.id === ev.project_id)!;
  return delay({ ...ev, project });
}

function elEntry(el: FixtureEventLocation): EventLocationEntry {
  return {
    id: el.id,
    event_id: el.event_id,
    location: toListItem(locOrThrow(el.location_id)),
    status: el.status,
    match_score: el.match_score,
    match_reasons: el.match_reasons,
    client_feedback: el.client_feedback,
    notes: el.notes,
    visits: db.visits.filter((v) => v.event_location_id === el.id),
    quotes: db.quotes.filter((q) => q.event_location_id === el.id),
    availability: db.availability.filter((a) => a.event_location_id === el.id),
  };
}

export function getEventLocations(eventId: string): Promise<EventLocationEntry[]> {
  return delay(db.eventLocations.filter((el) => el.event_id === eventId).map(elEntry));
}

export function addEventLocation(eventId: string, locationId: string): Promise<EventLocationEntry> {
  const existing = db.eventLocations.find((el) => el.event_id === eventId && el.location_id === locationId);
  if (existing) return delay(elEntry(existing));
  const el: FixtureEventLocation = {
    id: uid("el"),
    event_id: eventId,
    location_id: locationId,
    status: "preselezionata",
    created_at: new Date().toISOString(),
  };
  db.eventLocations.push(el);
  return delay(elEntry(el));
}

export function patchEventLocation(
  id: string,
  patch: { status?: EventLocationStatus; client_feedback?: string; notes?: string }
): Promise<EventLocationEntry> {
  const el = db.eventLocations.find((el) => el.id === id);
  if (!el) throw new Error(`Shortlist non trovata: ${id}`);
  Object.assign(el, patch);
  return delay(elEntry(el));
}

export function deleteEventLocation(id: string): Promise<void> {
  const idx = db.eventLocations.findIndex((el) => el.id === id);
  if (idx >= 0) db.eventLocations.splice(idx, 1);
  return delay(undefined);
}

export function addVisit(elId: string, payload: Omit<SiteVisit, "id">): Promise<SiteVisit> {
  const v = { id: uid("sv"), ...payload, event_location_id: elId };
  db.visits.push(v);
  return delay(v);
}

export function addQuote(elId: string, payload: Omit<Quote, "id">): Promise<Quote> {
  const q = { id: uid("q"), ...payload, event_location_id: elId };
  db.quotes.push(q);
  return delay(q);
}

export function addAvailability(elId: string, payload: Omit<AvailabilitySlot, "id">): Promise<AvailabilitySlot> {
  const a = { id: uid("av"), ...payload, event_location_id: elId };
  db.availability.push(a);
  return delay(a);
}

export function getEventCompare(eventId: string): Promise<CompareMatrix> {
  const els = db.eventLocations.filter((el) => el.event_id === eventId && el.status !== "scartata");
  const locs = els.map((el) => ({ el, loc: locOrThrow(el.location_id) }));
  const rows: CompareMatrix["rows"] = [];

  rows.push({ label: "Città", values: locs.map(({ loc }) => loc.city ?? db.locations.find((p) => p.id === loc.parent_location_id)?.city ?? "—") });
  rows.push({ label: "Capienza max", values: locs.map(({ loc }) => maxCapacity(loc.id)) });
  for (const cfg of CONFIGURATIONS) {
    const values = locs.map(({ loc }) => capacitiesOf(loc.id)[cfg] ?? null);
    if (values.some((v) => v != null)) rows.push({ label: CONFIG_LABELS[cfg], values });
  }
  rows.push({
    label: "Preventivo",
    values: locs.map(({ el }) => {
      const qs = db.quotes.filter((q) => q.event_location_id === el.id && q.amount > 0);
      if (!qs.length) return null;
      return qs.map((q) => formatMoney(q.amount, q.currency)).join(" / ");
    }),
  });
  rows.push({
    label: "Disponibilità",
    values: locs.map(({ el }) => {
      const av = db.availability.filter((a) => a.event_location_id === el.id);
      if (!av.length) return null;
      return av.map((a) => `${a.date}: ${a.status.replaceAll("_", " ")}`).join("; ");
    }),
  });
  rows.push({ label: "Accessibilità", values: locs.map(({ loc }) => (loc.accessibility_rating ? `${loc.accessibility_rating}/5` : null)) });
  rows.push({ label: "Sopralluoghi", values: locs.map(({ el }) => db.visits.filter((v) => v.event_location_id === el.id).length) });
  rows.push({ label: "Match AI", values: locs.map(({ el }) => (el.match_score != null ? `${el.match_score}%` : null)) });

  return delay({
    locations: locs.map(({ el, loc }) => ({ id: loc.id, name: loc.name, status: el.status })),
    rows,
  });
}

function featureCollectionFor(
  locationIds: string[],
  extra?: (locId: string) => { status?: string; event_name?: string }
): MapFeatureCollection {
  const features: MapFeatureCollection["features"] = [];
  for (const id of locationIds) {
    const loc = locOrThrow(id);
    const ll = coords(loc) ?? (loc.parent_location_id ? coords(locOrThrow(loc.parent_location_id)) : null);
    if (!ll) continue;
    const props: MapFeatureCollection["features"][number]["properties"] = {
      id: loc.id,
      name: loc.name,
      kind: "location",
      city: loc.city ?? undefined,
    };
    const ex = extra?.(id);
    if (ex?.status) props.status = ex.status;
    if (ex?.event_name) props.event_name = ex.event_name;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: ll },
      properties: props,
    });
  }
  return { type: "FeatureCollection", features };
}

export function getEventMap(eventId: string): Promise<MapFeatureCollection> {
  const els = db.eventLocations.filter((el) => el.event_id === eventId);
  return delay(
    featureCollectionFor(
      els.map((el) => el.location_id),
      (locId) => ({ status: els.find((el) => el.location_id === locId)?.status })
    )
  );
}

export function getProjectMap(projectId: string): Promise<MapFeatureCollection> {
  const eventIds = db.events.filter((e) => e.project_id === projectId).map((e) => e.id);
  const els = db.eventLocations.filter((el) => eventIds.includes(el.event_id));
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const el of els) {
    if (!seen.has(el.location_id)) {
      seen.add(el.location_id);
      ids.push(el.location_id);
    }
  }
  return delay(
    featureCollectionFor(ids, (locId) => {
      const mine = els.filter((el) => el.location_id === locId);
      const evNames = mine.map((el) => db.events.find((e) => e.id === el.event_id)?.name).filter(Boolean);
      return { event_name: evNames.join(", "), status: mine[0]?.status };
    })
  );
}

// ---- registry -------------------------------------------------------------------

export function listCompanies(filters: { q?: string; kind?: string; category?: string } = {}): Promise<Company[]> {
  let items = [...db.companies];
  if (filters.q) {
    const q = filters.q.toLowerCase();
    items = items.filter((c) => c.name.toLowerCase().includes(q));
  }
  if (filters.kind) items = items.filter((c) => c.kind === filters.kind || c.kind === "entrambi");
  if (filters.category) items = items.filter((c) => (c.supplier_categories ?? []).includes(filters.category!));
  return delay(items);
}

export function getCompany(id: string): Promise<CompanyDetail> {
  const company = db.companies.find((c) => c.id === id);
  if (!company) throw new Error(`Azienda non trovata: ${id}`);
  const linked: NonNullable<CompanyDetail["linked_locations"]> = [
    ...db.suppliers
      .filter((s) => s.company_id === id)
      .map((s) => ({
        id: s.location_id,
        name: locOrThrow(s.location_id).name,
        category: s.category,
        requirement: s.requirement as string,
      })),
    ...db.locationContacts
      .filter((lc) => lc.company_id === id)
      .map((lc) => ({ id: lc.location_id, name: locOrThrow(lc.location_id).name, category: "gestione", requirement: "" })),
  ].filter((v, i, arr) => arr.findIndex((x) => x.id === v.id && x.category === v.category) === i);
  return delay({
    ...company,
    contacts: db.companyContacts
      .filter((cc) => cc.company_id === id)
      .map((cc) => ({ contact: db.contacts.find((c) => c.id === cc.contact_id)!, role: cc.role })),
    linked_locations: linked,
  });
}

export function createCompany(payload: Partial<Company> & { name: string }): Promise<Company> {
  const c: Company = { id: uid("comp"), kind: "fornitore", ...payload };
  db.companies.push(c);
  return delay(c);
}

export function updateCompany(id: string, payload: Partial<Company>): Promise<Company> {
  const c = db.companies.find((c) => c.id === id);
  if (!c) throw new Error(`Azienda non trovata: ${id}`);
  Object.assign(c, payload);
  return delay(c);
}

export function listContacts(filters: { q?: string } = {}): Promise<Contact[]> {
  let items = [...db.contacts];
  if (filters.q) {
    const q = filters.q.toLowerCase();
    items = items.filter((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(q));
  }
  return delay(items);
}

export function getContact(id: string): Promise<ContactDetail> {
  const contact = db.contacts.find((c) => c.id === id);
  if (!contact) throw new Error(`Contatto non trovato: ${id}`);
  return delay({
    ...contact,
    companies: db.companyContacts
      .filter((cc) => cc.contact_id === id)
      .map((cc) => ({ company: db.companies.find((c) => c.id === cc.company_id)!, role: cc.role })),
    linked_locations: db.locationContacts
      .filter((lc) => lc.contact_id === id)
      .map((lc) => ({ id: lc.location_id, name: locOrThrow(lc.location_id).name, role: lc.role })),
  });
}

export function createContact(payload: Partial<Contact> & { first_name: string; last_name: string }): Promise<Contact> {
  const c: Contact = { id: uid("cont"), ...payload };
  db.contacts.push(c);
  return delay(c);
}

export function updateContact(id: string, payload: Partial<Contact>): Promise<Contact> {
  const c = db.contacts.find((c) => c.id === id);
  if (!c) throw new Error(`Contatto non trovato: ${id}`);
  Object.assign(c, payload);
  return delay(c);
}

// ---- ingestion -------------------------------------------------------------------

interface DemoJob extends IngestionJob {
  _created: number;
  _sourceText?: string;
}

const jobs = new Map<string, DemoJob>();

function demoDraft(job: DemoJob): ExtractedDraft {
  const sourceRef = job.source_type === "url" ? "pagina web" : job.source_type === "testo" ? "testo incollato" : `file ${job.source_type}`;
  const summaryFromText = job._sourceText
    ? job._sourceText.trim().replace(/\s+/g, " ").slice(0, 220)
    : "Cascina lombarda ristrutturata alle porte di Milano: corte coperta con capriate a vista, aia esterna e foresteria. Adatta a eventi aziendali e feste private.";
  return {
    confidence: 0.87,
    location: {
      name: "Cascina Monluè — Borgo Eventi",
      summary: summaryFromText,
      address_line: "Via Monluè 70",
      city: "Milano",
      province: "MI",
      postal_code: "20138",
      smart_tags: ["feste", "gala_dinner", "lancio"],
      logistics: {
        auto: "Accesso diretto dalla tangenziale Est, parcheggio interno",
        ztl: { present: false },
        private_parking: { spots: 120 },
      },
      technical: { max_kw: 90, generators: true, cooking: "induzione" },
      party: { indoor: { allowed: true, music_until: "02:00" }, outdoor: { allowed: true, music_until: "24:00" } },
      accessibility_rating: 4,
      availability_rules: "Chiusa per manutenzione le prime due settimane di agosto",
    },
    spaces: [
      { kind: "interno", name: "Corte Coperta", area_sqm: 350, capacities: { tavoli_tondi: 180, in_piedi: 300, platea: 220 } },
      { kind: "esterno", name: "Aia", area_sqm: 600, capacities: { cocktail: 400, in_piedi: 450 } },
    ],
    contacts: [
      {
        first_name: "Luca",
        last_name: "Moretti",
        role: "Proprietario",
        phone: "+39 348 112 2331",
        email: "luca@cascinamonlue.it",
        company_name: "Cascina Monluè Società Agricola",
      },
    ],
    suppliers: [{ company_name: "Bon Ton Catering S.r.l.", category: "catering", requirement: "consigliato" }],
    price_items: [
      { voce: "Affitto giornata evento", prezzo: 5200, unita: "a corpo" },
      { voce: "Giornata allestimento", prezzo: 1800, unita: "a corpo" },
    ],
    open_questions: [
      "Chiedere potenza massima effettiva disponibile in corte",
      "Verificare limite dB in esterno dopo le 23:00",
      "Il parcheggio da 120 posti è confermato anche nei giorni feriali?",
    ],
    field_sources: {
      "location.name": sourceRef,
      "location.address_line": sourceRef,
      "spaces.0": sourceRef,
      "price_items.0": sourceRef,
    },
  };
}

export function createIngestJob(payload: {
  location_id?: string | null;
  source_type: IngestSourceType;
  url?: string;
  text?: string;
}): Promise<IngestionJob> {
  const job: DemoJob = {
    id: uid("job"),
    location_id: payload.location_id ?? null,
    source_type: payload.source_type,
    source_url: payload.url ?? null,
    status: "pending",
    created_at: new Date().toISOString(),
    _created: Date.now(),
    _sourceText: payload.text,
  };
  jobs.set(job.id, job);
  return delay({ ...job });
}

export function getIngestJob(id: string): Promise<IngestionJob> {
  const job = jobs.get(id);
  if (!job) throw new Error(`Job non trovato: ${id}`);
  if (job.status === "pending" || job.status === "processing") {
    const elapsed = Date.now() - job._created;
    if (elapsed > 4500) {
      job.status = "ready";
      job.extracted = demoDraft(job);
    } else if (elapsed > 1200) {
      job.status = "processing";
    }
  }
  return delay({ ...job });
}

function setDeep(target: Record<string, unknown>, path: string[], value: unknown): void {
  let obj = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (typeof obj[key] !== "object" || obj[key] === null) obj[key] = {};
    obj = obj[key] as Record<string, unknown>;
  }
  obj[path[path.length - 1]] = value;
}

function getDeep(source: unknown, path: string[]): unknown {
  let cur: unknown = source;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export async function applyIngestJob(id: string, accept: Record<string, boolean>): Promise<{ location_id: string }> {
  const job = jobs.get(id);
  if (!job || !job.extracted) throw new Error("Job non pronto");
  const draft = job.extracted;

  // 1. location fields
  const locPatch: Record<string, unknown> = {};
  for (const [path, ok] of Object.entries(accept)) {
    if (!ok || !path.startsWith("location.")) continue;
    const rel = path.slice("location.".length).split(".");
    const value = getDeep(draft.location, rel);
    if (value !== undefined) setDeep(locPatch, rel, value);
  }

  let locationId = job.location_id ?? null;
  if (locationId) {
    await updateLocation(locationId, locPatch as Partial<LocationBase>);
  } else {
    const created = await createLocation(locPatch as Partial<LocationBase>);
    locationId = created.id;
  }

  // 2. spaces
  (draft.spaces ?? []).forEach((sp, i) => {
    if (!accept[`spaces.${i}`]) return;
    db.spaces.push({
      id: uid("sp"),
      location_id: locationId!,
      kind: sp.kind === "esterno" ? "esterno" : "interno",
      name: sp.name,
      area_sqm: sp.area_sqm ?? null,
      capacities: sp.capacities ?? {},
      sort: 90 + i,
    });
  });

  // 3. contacts
  (draft.contacts ?? []).forEach((c, i) => {
    if (!accept[`contacts.${i}`]) return;
    const contact: Contact = {
      id: uid("cont"),
      first_name: c.first_name ?? "",
      last_name: c.last_name ?? "",
      email: c.email ?? null,
      phone: c.phone ?? null,
    };
    db.contacts.push(contact);
    db.locationContacts.push({ location_id: locationId!, contact_id: contact.id, role: c.role ?? "Referente" });
  });

  // 4. suppliers
  (draft.suppliers ?? []).forEach((s, i) => {
    if (!accept[`suppliers.${i}`]) return;
    let company = db.companies.find((c) => c.name.toLowerCase() === s.company_name.toLowerCase());
    if (!company) {
      company = { id: uid("comp"), name: s.company_name, kind: "fornitore", supplier_categories: s.category ? [s.category] : [] };
      db.companies.push(company);
    }
    db.suppliers.push({
      id: uid("sup"),
      location_id: locationId!,
      company_id: company.id,
      category: s.category ?? "altro",
      requirement: s.requirement === "obbligatorio" ? "obbligatorio" : "consigliato",
    });
  });

  // 5. price items
  const acceptedItems = (draft.price_items ?? []).filter((_, i) => accept[`price_items.${i}`]);
  if (acceptedItems.length) {
    db.priceLists.push({
      id: uid("pl"),
      location_id: locationId!,
      name: "Listino estratto (AI)",
      items: acceptedItems,
      extracted_by_ai: true,
    });
  }

  job.status = "applied";
  job.applied_location_id = locationId;
  return delay({ location_id: locationId! });
}
