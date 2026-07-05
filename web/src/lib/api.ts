// Typed API client for the VenueScout backend (SPEC §4, /api/v1).
// Every call goes to the real API; on network failure (backend unreachable)
// it transparently falls back to the in-memory demo store and stays in demo
// mode for the rest of the session. NEXT_PUBLIC_DEMO=1 forces demo mode.

import * as demo from "./demo";
import { activateDemo, getToken, isDemoActive } from "./auth";
import type {
  AvailabilitySlot,
  Company,
  CompanyDetail,
  CompareMatrix,
  Contact,
  ContactDetail,
  EventItem,
  EventLocationEntry,
  EventLocationStatus,
  HistoryEntry,
  IngestSourceType,
  IngestionJob,
  LocationBase,
  LocationDetail,
  LocationFilters,
  LocationListItem,
  MapFeatureCollection,
  Paginated,
  Poi,
  Project,
  ProjectDetail,
  Quote,
  SearchResult,
  SiteVisit,
  UsageEntry,
  User,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers });
  if (!res.ok) {
    let code = "http_error";
    let message = `Errore ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Run a real API call with demo fallback. ApiError (a reachable backend that
 * answered 4xx/5xx) is rethrown; network-level failures activate demo mode.
 */
async function call<T>(demoFn: () => Promise<T>, path: string, init?: RequestInit): Promise<T> {
  if (isDemoActive()) return demoFn();
  try {
    return await http<T>(path, init);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    activateDemo();
    return demoFn();
  }
}

function unwrap<T>(p: Promise<Paginated<T> | T[]>): Promise<T[]> {
  return p.then((res) => (Array.isArray(res) ? res : res.data));
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
};

// ---- auth ----

export function login(email: string, password: string): Promise<{ token: string; user: User }> {
  return call(() => demo.login(email), "/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

// ---- locations ----

export function listLocations(filters: LocationFilters = {}): Promise<LocationListItem[]> {
  const query = qs({
    q: filters.q,
    city: filters.city,
    tags: filters.tag,
    visit_status: filters.status,
    min_capacity: filters.min_capacity,
    configuration: filters.configuration,
    root_only: filters.root_only ? "true" : undefined,
    per_page: 100,
  });
  return unwrap(call(() => demo.listLocations(filters), `/locations${query}`));
}

export function getLocation(id: string): Promise<LocationDetail> {
  return call(() => demo.getLocation(id), `/locations/${id}`);
}

export function getLocationUsage(id: string): Promise<UsageEntry[]> {
  return unwrap(call(() => demo.getLocationUsage(id), `/locations/${id}/usage`));
}

export function getLocationHistory(id: string): Promise<HistoryEntry[]> {
  return unwrap(call(() => demo.getLocationHistory(id), `/locations/${id}/history`));
}

export function createLocation(payload: Partial<LocationBase>): Promise<LocationBase> {
  return call(() => demo.createLocation(payload), "/locations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateLocation(id: string, payload: Partial<LocationBase>): Promise<LocationBase> {
  return call(() => demo.updateLocation(id, payload), `/locations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// ---- ingestion ----

export function createIngestJob(payload: {
  location_id?: string | null;
  source_type: IngestSourceType;
  url?: string;
  text?: string;
}): Promise<IngestionJob> {
  return call(() => demo.createIngestJob(payload), "/ingest", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getIngestJob(id: string): Promise<IngestionJob> {
  return call(() => demo.getIngestJob(id), `/ingest/${id}`);
}

export function applyIngestJob(id: string, accept: Record<string, boolean>): Promise<{ location_id: string }> {
  return call(() => demo.applyIngestJob(id, accept), `/ingest/${id}/apply`, {
    method: "POST",
    body: JSON.stringify({ accept }),
  });
}

// ---- search ----

export function searchBrief(params: {
  brief: string;
  near_poi_id?: string;
  max_minutes?: number;
  limit?: number;
}): Promise<SearchResult[]> {
  const body: Record<string, unknown> = { brief: params.brief, limit: params.limit ?? 10 };
  if (params.near_poi_id) {
    body.near = [{ poi_id: params.near_poi_id, max_minutes: params.max_minutes }];
  }
  return unwrap(
    call(() => demo.searchBrief(params), "/search/brief", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

export function listPois(): Promise<Poi[]> {
  return unwrap(call(() => demo.listPois(), "/pois"));
}

// ---- projects & events ----

export function listProjects(): Promise<Project[]> {
  return unwrap(call(() => demo.listProjects(), "/projects"));
}

export function createProject(payload: { name: string; client_name?: string; notes?: string }): Promise<Project> {
  return call(() => demo.createProject(payload), "/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getProject(id: string): Promise<ProjectDetail> {
  return call(() => demo.getProject(id), `/projects/${id}`);
}

export function createEvent(projectId: string, payload: Partial<EventItem>): Promise<EventItem> {
  return call(() => demo.createEvent(projectId, payload), `/projects/${projectId}/events`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getEvent(id: string): Promise<EventItem & { project: Project }> {
  return call(() => demo.getEvent(id), `/events/${id}`);
}

export function getEventLocations(eventId: string): Promise<EventLocationEntry[]> {
  return unwrap(call(() => demo.getEventLocations(eventId), `/events/${eventId}/locations`));
}

export function addEventLocation(eventId: string, locationId: string): Promise<EventLocationEntry> {
  return call(() => demo.addEventLocation(eventId, locationId), `/events/${eventId}/locations`, {
    method: "POST",
    body: JSON.stringify({ location_id: locationId }),
  });
}

export function patchEventLocation(
  id: string,
  patch: { status?: EventLocationStatus; client_feedback?: string; notes?: string }
): Promise<EventLocationEntry> {
  return call(() => demo.patchEventLocation(id, patch), `/event-locations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteEventLocation(id: string): Promise<void> {
  return call(() => demo.deleteEventLocation(id), `/event-locations/${id}`, { method: "DELETE" });
}

export function addVisit(eventLocationId: string, payload: Omit<SiteVisit, "id">): Promise<SiteVisit> {
  return call(() => demo.addVisit(eventLocationId, payload), `/event-locations/${eventLocationId}/visits`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function addQuote(eventLocationId: string, payload: Omit<Quote, "id">): Promise<Quote> {
  return call(() => demo.addQuote(eventLocationId, payload), `/event-locations/${eventLocationId}/quotes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function addAvailability(
  eventLocationId: string,
  payload: Omit<AvailabilitySlot, "id">
): Promise<AvailabilitySlot> {
  return call(() => demo.addAvailability(eventLocationId, payload), `/event-locations/${eventLocationId}/availability`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getEventCompare(eventId: string): Promise<CompareMatrix> {
  return call(() => demo.getEventCompare(eventId), `/events/${eventId}/compare`);
}

export function getEventMap(eventId: string): Promise<MapFeatureCollection> {
  return call(() => demo.getEventMap(eventId), `/events/${eventId}/map`);
}

export function getProjectMap(projectId: string): Promise<MapFeatureCollection> {
  return call(() => demo.getProjectMap(projectId), `/projects/${projectId}/map`);
}

// ---- registry ----

export function listCompanies(filters: { q?: string; kind?: string; category?: string } = {}): Promise<Company[]> {
  return unwrap(call(() => demo.listCompanies(filters), `/companies${qs(filters)}`));
}

export function getCompany(id: string): Promise<CompanyDetail> {
  return call(() => demo.getCompany(id), `/companies/${id}`);
}

export function createCompany(payload: Partial<Company> & { name: string }): Promise<Company> {
  return call(() => demo.createCompany(payload), "/companies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCompany(id: string, payload: Partial<Company>): Promise<Company> {
  return call(() => demo.updateCompany(id, payload), `/companies/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function listContacts(filters: { q?: string } = {}): Promise<Contact[]> {
  return unwrap(call(() => demo.listContacts(filters), `/contacts${qs(filters)}`));
}

export function getContact(id: string): Promise<ContactDetail> {
  return call(() => demo.getContact(id), `/contacts/${id}`);
}

export function createContact(
  payload: Partial<Contact> & { first_name: string; last_name: string }
): Promise<Contact> {
  return call(() => demo.createContact(payload), "/contacts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateContact(id: string, payload: Partial<Contact>): Promise<Contact> {
  return call(() => demo.updateContact(id, payload), `/contacts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
