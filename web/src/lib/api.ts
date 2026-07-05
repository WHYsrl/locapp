// Typed API client for the VenueScout backend (SPEC §4, /api/v1).
// Every call goes to the real API. Network failures throw NetworkError and
// must be surfaced by the UI (no silent fallback). 401 responses clear the
// token and redirect to /login.

import { clearToken, flagSessionExpired, getToken } from "./auth";
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
  GeocodeCandidate,
  HistoryEntry,
  IngestSourceType,
  IngestionJob,
  LocationBase,
  LocationContactEntry,
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
  SmartTag,
  SupplierEntry,
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
    this.name = "ApiError";
  }
}

/** Thrown when the backend is unreachable (fetch-level failure). */
export class NetworkError extends Error {
  constructor(message = "Impossibile raggiungere il server") {
    super(message);
    this.name = "NetworkError";
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers });
  } catch {
    throw new NetworkError();
  }

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
    if (res.status === 401 && !path.startsWith("/auth/")) {
      // Session expired or token invalid: clear and send back to login.
      clearToken();
      flagSessionExpired();
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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
  return http("/auth/login", {
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
  return unwrap(http(`/locations${query}`));
}

export function getLocation(id: string): Promise<LocationDetail> {
  return http(`/locations/${id}`);
}

export function getLocationUsage(id: string): Promise<UsageEntry[]> {
  return unwrap(http(`/locations/${id}/usage`));
}

export function getLocationHistory(id: string): Promise<HistoryEntry[]> {
  return unwrap(http(`/locations/${id}/history`));
}

export function createLocation(payload: Partial<LocationBase>): Promise<LocationBase> {
  return http("/locations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateLocation(id: string, payload: Partial<LocationBase>): Promise<LocationBase> {
  return http(`/locations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// ---- geocoding ----

export function geocode(q: string): Promise<GeocodeCandidate[]> {
  return unwrap(http(`/geocode${qs({ q })}`));
}

// ---- location suppliers & contacts ----

export function addLocationSupplier(
  locationId: string,
  payload: {
    company_id: string;
    contact_id?: string | null;
    category: string;
    requirement: "obbligatorio" | "consigliato";
    conditions?: string | null;
  }
): Promise<SupplierEntry> {
  return http(`/locations/${locationId}/suppliers`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function removeLocationSupplier(locationId: string, supplierId: string): Promise<void> {
  return http(`/locations/${locationId}/suppliers/${supplierId}`, { method: "DELETE" });
}

export function addLocationContact(
  locationId: string,
  payload: { contact_id: string; role: string; company_id?: string | null }
): Promise<LocationContactEntry> {
  return http(`/locations/${locationId}/contacts`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function removeLocationContact(locationId: string, contactId: string): Promise<void> {
  return http(`/locations/${locationId}/contacts/${contactId}`, { method: "DELETE" });
}

// ---- smart tags ----

export function listTags(): Promise<SmartTag[]> {
  return unwrap(http("/tags"));
}

export function createTag(payload: { name: string; color?: string | null }): Promise<SmartTag> {
  return http("/tags", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTag(id: string, payload: { name?: string; color?: string | null }): Promise<SmartTag> {
  return http(`/tags/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteTag(id: string): Promise<void> {
  return http(`/tags/${id}`, { method: "DELETE" });
}

// ---- ingestion ----

export function createIngestJob(payload: {
  location_id?: string | null;
  source_type: IngestSourceType;
  url?: string;
  text?: string;
}): Promise<IngestionJob> {
  return http("/ingest", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getIngestJob(id: string): Promise<IngestionJob> {
  return http(`/ingest/${id}`);
}

export function applyIngestJob(id: string, accept: Record<string, boolean>): Promise<{ location_id: string }> {
  return http(`/ingest/${id}/apply`, {
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
    http("/search/brief", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

export function listPois(): Promise<Poi[]> {
  return unwrap(http("/pois"));
}

// ---- projects & events ----

export function listProjects(): Promise<Project[]> {
  return unwrap(http("/projects"));
}

export function createProject(payload: { name: string; client_name?: string; notes?: string; tags?: string[] }): Promise<Project> {
  return http("/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getProject(id: string): Promise<ProjectDetail> {
  return http(`/projects/${id}`);
}

export function updateProject(id: string, payload: Partial<Project>): Promise<Project> {
  return http(`/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createEvent(projectId: string, payload: Partial<EventItem>): Promise<EventItem> {
  return http(`/projects/${projectId}/events`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getEvent(id: string): Promise<EventItem & { project: Project }> {
  return http(`/events/${id}`);
}

export function updateEvent(id: string, payload: Partial<EventItem>): Promise<EventItem> {
  return http(`/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getEventLocations(eventId: string): Promise<EventLocationEntry[]> {
  return unwrap(http(`/events/${eventId}/locations`));
}

export function addEventLocation(eventId: string, locationId: string): Promise<EventLocationEntry> {
  return http(`/events/${eventId}/locations`, {
    method: "POST",
    body: JSON.stringify({ location_id: locationId }),
  });
}

export function patchEventLocation(
  id: string,
  patch: { status?: EventLocationStatus; client_feedback?: string; notes?: string }
): Promise<EventLocationEntry> {
  return http(`/event-locations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteEventLocation(id: string): Promise<void> {
  return http(`/event-locations/${id}`, { method: "DELETE" });
}

export function addVisit(eventLocationId: string, payload: Omit<SiteVisit, "id">): Promise<SiteVisit> {
  return http(`/event-locations/${eventLocationId}/visits`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function addQuote(eventLocationId: string, payload: Omit<Quote, "id">): Promise<Quote> {
  return http(`/event-locations/${eventLocationId}/quotes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function addAvailability(
  eventLocationId: string,
  payload: Omit<AvailabilitySlot, "id">
): Promise<AvailabilitySlot> {
  return http(`/event-locations/${eventLocationId}/availability`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getEventCompare(eventId: string): Promise<CompareMatrix> {
  return http(`/events/${eventId}/compare`);
}

export function getEventMap(eventId: string): Promise<MapFeatureCollection> {
  return http(`/events/${eventId}/map`);
}

export function getProjectMap(projectId: string): Promise<MapFeatureCollection> {
  return http(`/projects/${projectId}/map`);
}

// ---- registry ----

export function listCompanies(filters: { q?: string; kind?: string; category?: string } = {}): Promise<Company[]> {
  return unwrap(http(`/companies${qs(filters)}`));
}

export function getCompany(id: string): Promise<CompanyDetail> {
  return http(`/companies/${id}`);
}

export function createCompany(payload: Partial<Company> & { name: string }): Promise<Company> {
  return http("/companies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCompany(id: string, payload: Partial<Company>): Promise<Company> {
  return http(`/companies/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function listContacts(filters: { q?: string } = {}): Promise<Contact[]> {
  return unwrap(http(`/contacts${qs(filters)}`));
}

export function getContact(id: string): Promise<ContactDetail> {
  return http(`/contacts/${id}`);
}

export function createContact(
  payload: Partial<Contact> & { first_name: string; last_name: string }
): Promise<Contact> {
  return http("/contacts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateContact(id: string, payload: Partial<Contact>): Promise<Contact> {
  return http(`/contacts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
