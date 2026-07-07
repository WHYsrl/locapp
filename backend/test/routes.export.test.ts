import { describe, expect, it, vi } from 'vitest';
import { auth, buildTestApp } from './helpers.js';

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

/** Happy-path Google Slides mock: create → presentationId, batchUpdate → ok. */
const makeGoogleFetch = () =>
  vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes(':batchUpdate')) return jsonResponse({ presentationId: 'pres-1', replies: [] });
    return jsonResponse({ presentationId: 'pres-1', slides: [{ objectId: 'default-slide-1' }] });
  }) as unknown as typeof fetch;

const fetchCalls = (fetchFn: typeof fetch) => (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;

const batchRequests = (fetchFn: typeof fetch): Array<Record<string, unknown>> => {
  const call = fetchCalls(fetchFn).find((c) => String(c[0]).includes(':batchUpdate'));
  expect(call).toBeDefined();
  return JSON.parse((call![1] as RequestInit).body as string).requests;
};

const now = new Date();

const eventRow = {
  id: 'ev-1',
  projectId: 'proj-1',
  name: 'Convention Acme',
  eventType: 'convention',
  dateStart: '2026-09-10',
  dateEnd: '2026-09-11',
  pax: 200,
  brief: 'Convention aziendale con cena di gala',
  notes: null,
  tags: [],
  sort: 0,
  createdAt: now,
  updatedAt: now,
};

const projectRow = {
  id: 'proj-1',
  name: 'Progetto Acme',
  clientName: 'Acme SpA',
  status: 'attivo',
  tags: [],
  notes: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};

const shortlistRow = (over: Record<string, unknown>) => ({
  id: 'el-1',
  eventId: 'ev-1',
  locationId: 'loc-1',
  status: 'preferita',
  matchScore: '82',
  matchReasons: null,
  clientFeedback: null,
  notes: null,
  createdAt: now,
  locationName: 'Villa dei Pini',
  locationCity: 'Firenze',
  locationThumbnail: null,
  locationTags: [],
  lon: 11.25,
  lat: 43.77,
  ...over,
});

const villaRow = {
  id: 'loc-1',
  parentLocationId: null,
  name: 'Villa dei Pini',
  slug: null,
  summary: 'Villa storica con parco secolare.',
  addressLine: 'Via dei Pini 1',
  city: 'Firenze',
  province: 'FI',
  postalCode: '50100',
  country: 'IT',
  phone: '055123456',
  email: 'info@villa.it',
  website: 'https://villa.it',
  googleMapsUrl: null,
  thumbnailUrl: null,
  visitStatus: 'visitata',
  logistics: { parcheggio: '80 posti' },
  setup: null,
  party: null,
  technical: { max_kw: 60 },
  accessibilityRating: 4,
  accessibilityNotes: null,
  availabilityRules: null,
  smartTags: ['villa', 'parco'],
  impressions: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};

/** Repos overrides for the event happy path (one keeper + one scartata). */
const eventRepos = () => ({
  projects: {
    getEvent: vi.fn(async (id: string) => (id === 'ev-1' ? eventRow : null)),
    getById: vi.fn(async () => projectRow),
    listEventLocations: vi.fn(async () => [
      shortlistRow({ id: 'el-2', locationId: 'loc-2', status: 'scartata', locationName: 'Capannone Grigio', locationCity: 'Prato' }),
      shortlistRow({}),
    ]),
  },
  locations: {
    getById: vi.fn(async (id: string) => (id === 'loc-1' ? villaRow : null)),
    capacitiesForLocations: vi.fn(async () => [
      { locationId: 'loc-1', configuration: 'platea', capacity: 250 },
      { locationId: 'loc-1', configuration: 'platea', capacity: 120 },
    ]),
    listMedia: vi.fn(async () => [
      { id: 'm-1', locationId: 'loc-1', kind: 'foto', url: 'locations/loc-1/web/1.jpg', filename: '1.jpg', mime: 'image/jpeg', createdAt: now },
    ]),
  },
});

describe('POST /export/slides — validation and auth', () => {
  it('rejects a body without access_token with 400', async () => {
    const ctx = await buildTestApp();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/export/slides',
      headers: auth(ctx.tokens.editor),
      payload: { kind: 'event', id: 'ev-1' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown kind with 400', async () => {
    const ctx = await buildTestApp();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/export/slides',
      headers: auth(ctx.tokens.editor),
      payload: { access_token: 'goog-token', kind: 'shortlist', id: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires a JWT bearer token', async () => {
    const ctx = await buildTestApp();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/export/slides',
      payload: { access_token: 'goog-token', kind: 'event', id: 'ev-1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for an unknown location id', async () => {
    const ctx = await buildTestApp({ fetchFn: makeGoogleFetch() });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/export/slides',
      headers: auth(ctx.tokens.editor),
      payload: { access_token: 'goog-token', kind: 'location', id: 'missing' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for an unknown event id', async () => {
    const ctx = await buildTestApp({ fetchFn: makeGoogleFetch() });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/export/slides',
      headers: auth(ctx.tokens.editor),
      payload: { access_token: 'goog-token', kind: 'event', id: 'missing' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /export/slides — event happy path', () => {
  it('creates the presentation, runs one batchUpdate with sensible requests and excludes scartata', async () => {
    const fetchFn = makeGoogleFetch();
    const ctx = await buildTestApp({ repos: eventRepos(), fetchFn });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/export/slides',
      headers: auth(ctx.tokens.editor),
      payload: { access_token: 'goog-token', kind: 'event', id: 'ev-1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      presentation_id: 'pres-1',
      url: 'https://docs.google.com/presentation/d/pres-1/edit',
      warnings: [],
    });

    // Exactly two Google calls: presentations.create + ONE batchUpdate.
    const calls = fetchCalls(fetchFn);
    expect(calls).toHaveLength(2);
    expect(String(calls[0]![0])).toBe('https://slides.googleapis.com/v1/presentations');
    expect(String(calls[1]![0])).toContain('/presentations/pres-1:batchUpdate');

    // Access token travels only as a Bearer header, never in URLs.
    for (const call of calls) {
      expect(String(call[0])).not.toContain('goog-token');
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer goog-token');
    }

    // Create carries the deck title; batchUpdate builds a real deck.
    expect(JSON.parse((calls[0]![1] as RequestInit).body as string)).toEqual({ title: 'Proposta location' });
    const requests = batchRequests(fetchFn);
    const createSlides = requests.filter((r) => 'createSlide' in r);
    expect(createSlides.length).toBeGreaterThan(2);
    const insertedTexts = requests
      .filter((r) => 'insertText' in r)
      .map((r) => (r['insertText'] as { text: string }).text);
    expect(insertedTexts).toContain('Proposta location');
    // The default slide Google created is removed.
    expect(requests).toContainEqual({ deleteObject: { objectId: 'default-slide-1' } });

    // The AI copywriter got exactly one call with 'scartata' venues excluded.
    const writeDeck = ctx.ai.writeDeck as ReturnType<typeof vi.fn>;
    expect(writeDeck).toHaveBeenCalledTimes(1);
    const data = writeDeck.mock.calls[0]![0].data;
    expect(data.kind).toBe('event');
    expect(data.event.shortlist).toHaveLength(1);
    expect(data.event.shortlist[0].name).toBe('Villa dei Pini');
    expect(JSON.stringify(data)).not.toContain('Capannone Grigio');
    // Aggregated capacities: max per configuration.
    expect(data.event.shortlist[0].capacities).toEqual([{ configuration: 'platea', capacity: 250 }]);
    // Shortlist photo resolved to a presigned GET URL.
    expect(data.event.shortlist[0].photo_urls[0]).toContain('https://download.example/locations/loc-1/web/1.jpg');
  });

  it('sorts preferita/confermata/utilizzata venues first for project exports', async () => {
    const fetchFn = makeGoogleFetch();
    const repos = eventRepos();
    repos.projects = {
      ...repos.projects,
      getById: vi.fn(async () => projectRow),
      listEvents: vi.fn(async () => [eventRow]),
      listEventLocations: vi.fn(async () => [
        shortlistRow({ id: 'el-3', locationId: 'loc-3', status: 'proposta', locationName: 'Palazzo Terzo' }),
        shortlistRow({ id: 'el-2', locationId: 'loc-2', status: 'scartata', locationName: 'Capannone Grigio' }),
        shortlistRow({ id: 'el-1', locationId: 'loc-1', status: 'confermata', locationName: 'Villa dei Pini' }),
      ]),
    } as never;
    const ctx = await buildTestApp({ repos, fetchFn });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/export/slides',
      headers: auth(ctx.tokens.editor),
      payload: { access_token: 'goog-token', kind: 'project', id: 'proj-1' },
    });
    expect(res.statusCode).toBe(200);
    const writeDeck = ctx.ai.writeDeck as ReturnType<typeof vi.fn>;
    const data = writeDeck.mock.calls[0]![0].data;
    expect(data.project.events[0].shortlist.map((v: { name: string }) => v.name)).toEqual([
      'Villa dei Pini',
      'Palazzo Terzo',
    ]);
  });
});

describe('POST /export/slides — Google errors map to 502 google_error', () => {
  it("relays Google's message on 401 invalid credentials", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(
        { error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } },
        401,
      ),
    ) as unknown as typeof fetch;
    const ctx = await buildTestApp({ repos: eventRepos(), fetchFn });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/export/slides',
      headers: auth(ctx.tokens.editor),
      payload: { access_token: 'expired-token', kind: 'event', id: 'ev-1' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatchObject({
      code: 'google_error',
      message: 'Request had invalid authentication credentials.',
    });
  });

  it('maps insufficient scope (403) and network failures to 502 google_error', async () => {
    const forbidden = vi.fn(async () =>
      jsonResponse({ error: { code: 403, message: 'Request had insufficient authentication scopes.' } }, 403),
    ) as unknown as typeof fetch;
    const ctx1 = await buildTestApp({ repos: eventRepos(), fetchFn: forbidden });
    const res1 = await ctx1.app.inject({
      method: 'POST',
      url: '/api/v1/export/slides',
      headers: auth(ctx1.tokens.editor),
      payload: { access_token: 'goog-token', kind: 'event', id: 'ev-1' },
    });
    expect(res1.statusCode).toBe(502);
    expect(res1.json().error.message).toContain('insufficient authentication scopes');

    const offline = vi.fn(async () => {
      throw new Error('socket hang up');
    }) as unknown as typeof fetch;
    const ctx2 = await buildTestApp({ repos: eventRepos(), fetchFn: offline });
    const res2 = await ctx2.app.inject({
      method: 'POST',
      url: '/api/v1/export/slides',
      headers: auth(ctx2.tokens.editor),
      payload: { access_token: 'goog-token', kind: 'event', id: 'ev-1' },
    });
    expect(res2.statusCode).toBe(502);
    expect(res2.json().error.code).toBe('google_error');
  });
});

describe('POST /export/slides — AI failure is non-fatal', () => {
  it('falls back to factual texts and returns the ai_unavailable warning', async () => {
    const fetchFn = makeGoogleFetch();
    const ctx = await buildTestApp({
      repos: eventRepos(),
      fetchFn,
      ai: { writeDeck: vi.fn(async () => Promise.reject(new Error('overloaded'))) },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/export/slides',
      headers: auth(ctx.tokens.editor),
      payload: { access_token: 'goog-token', kind: 'event', id: 'ev-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().warnings).toContain('ai_unavailable');
    expect(res.json().presentation_id).toBe('pres-1');

    // The fallback deck is still a real deck: cover + section + venue (+ compare).
    const requests = batchRequests(fetchFn);
    expect(requests.filter((r) => 'createSlide' in r).length).toBeGreaterThan(2);
    const texts = requests.filter((r) => 'insertText' in r).map((r) => (r['insertText'] as { text: string }).text);
    expect(texts).toContain('Proposta location — Convention Acme');
    expect(texts.some((t) => t.includes('Villa dei Pini'))).toBe(true);
  });
});

describe('POST /export/slides — location kind with ai_texts=false (deterministic deck)', () => {
  const locationRepos = () => ({
    locations: {
      getById: vi.fn(async (id: string) => (id === 'loc-1' ? villaRow : null)),
      coordinates: vi.fn(async () => [{ id: 'loc-1', lon: 11.25, lat: 43.77 }]),
      getRelations: vi.fn(async () => ({
        children: [],
        spaceRows: [
          { id: 'sp-1', locationId: 'loc-1', kind: 'interno', name: 'Salone Affreschi', areaSqm: '300', heightM: '6', covered: 'coperto', features: null, sort: 0 },
        ],
        capacityRows: [
          { spaceId: 'sp-1', configuration: 'platea', capacity: 250 },
          { spaceId: 'sp-1', configuration: 'tavoli_tondi', capacity: 150 },
        ],
        contactRows: [],
        supplierRows: [],
        mediaRows: [
          { id: 'm-1', locationId: 'loc-1', kind: 'foto', url: 'locations/loc-1/a.jpg', filename: 'a.jpg', mime: 'image/jpeg', createdAt: now },
          { id: 'm-2', locationId: 'loc-1', kind: 'foto', url: 'locations/loc-1/b.jpg', filename: 'b.jpg', mime: 'image/jpeg', createdAt: now },
          { id: 'm-3', locationId: 'loc-1', kind: 'planimetria', url: 'locations/loc-1/plan.pdf', filename: 'plan.pdf', mime: 'application/pdf', createdAt: now },
        ],
        priceListRows: [],
      })),
    },
  });

  it('builds capacity table, presigned photo slides and the public map-thumb image without calling the AI', async () => {
    const fetchFn = makeGoogleFetch();
    const ctx = await buildTestApp({
      repos: locationRepos(),
      fetchFn,
      publicBaseUrl: 'https://api.example.com/',
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/export/slides',
      headers: auth(ctx.tokens.editor),
      payload: {
        access_token: 'goog-token',
        kind: 'location',
        id: 'loc-1',
        include: { ai_texts: false },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().warnings).toEqual([]);
    expect(ctx.ai.writeDeck).not.toHaveBeenCalled();

    const requests = batchRequests(fetchFn);
    // Capacity table: header + one space row.
    const tables = requests.filter((r) => 'createTable' in r);
    expect(tables.length).toBeGreaterThanOrEqual(1);
    const cellTexts = requests
      .filter((r) => 'insertText' in r && (r['insertText'] as Record<string, unknown>)['cellLocation'])
      .map((r) => (r['insertText'] as { text: string }).text);
    expect(cellTexts).toContain('Salone Affreschi');
    expect(cellTexts.some((t) => t.includes('Platea: 250'))).toBe(true);

    // Photos resolved to presigned GET URLs (only kind 'foto'), map from the public base URL.
    const imageUrls = requests
      .filter((r) => 'createImage' in r)
      .map((r) => (r['createImage'] as { url: string }).url);
    expect(imageUrls).toContain('https://download.example/locations/loc-1/a.jpg?sig=get');
    expect(imageUrls).toContain('https://download.example/locations/loc-1/b.jpg?sig=get');
    expect(imageUrls).toContain('https://api.example.com/api/v1/locations/loc-1/map-thumb.png');
    expect(imageUrls.join(' ')).not.toContain('plan.pdf');

    // Berry brand color on titles.
    const styled = requests.filter((r) => 'updateTextStyle' in r);
    expect(styled.length).toBeGreaterThan(0);
    const style = styled[0]!['updateTextStyle'] as {
      style: { foregroundColor: { opaqueColor: { rgbColor: { red: number; green: number; blue: number } } } };
    };
    const rgb = style.style.foregroundColor.opaqueColor.rgbColor;
    expect(rgb.red).toBeCloseTo(0x6d / 255, 5);
    expect(rgb.green).toBeCloseTo(0x2e / 255, 5);
    expect(rgb.blue).toBeCloseTo(0x46 / 255, 5);
  });

  it('warns photos_unavailable when storage is not configured instead of failing', async () => {
    const fetchFn = makeGoogleFetch();
    const ctx = await buildTestApp({
      repos: locationRepos(),
      fetchFn,
      storage: { isConfigured: vi.fn(() => false) },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/export/slides',
      headers: auth(ctx.tokens.editor),
      payload: { access_token: 'goog-token', kind: 'location', id: 'loc-1', include: { ai_texts: false } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().warnings).toContain('photos_unavailable');
  });
});
