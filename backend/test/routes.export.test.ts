import { describe, expect, it, vi } from 'vitest';
import { auth, buildTestApp, type TestContext } from './helpers.js';

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

/** POST /export/slides → 202 {job_id}. */
const startExport = async (ctx: TestContext, payload: Record<string, unknown>) => {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/export/slides',
    headers: auth(ctx.tokens.editor),
    payload,
  });
  expect(res.statusCode).toBe(202);
  const jobId = res.json().job_id as string;
  expect(jobId).toBeTruthy();
  return jobId;
};

/** Polls GET /export/jobs/:id until the async processor finishes. */
const waitForJob = async (ctx: TestContext, jobId: string): Promise<Record<string, unknown>> => {
  for (let i = 0; i < 100; i++) {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/export/jobs/${jobId}`,
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(200);
    const job = res.json();
    expect(['pending', 'processing', 'done', 'failed']).toContain(job.status);
    if (job.status === 'done' || job.status === 'failed') return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('export job never finished');
};

/** All access-token strings that ever reached the export_jobs repo (must be none). */
const tokenReachedJobsRepo = (ctx: TestContext, token: string): boolean => {
  const repo = ctx.repos.exportJobs as unknown as Record<string, ReturnType<typeof vi.fn>>;
  const calls = [...repo['create']!.mock.calls, ...repo['update']!.mock.calls];
  return JSON.stringify(calls).includes(token);
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

  it('returns 404 for an unknown location id without creating a job', async () => {
    const ctx = await buildTestApp({ fetchFn: makeGoogleFetch() });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/export/slides',
      headers: auth(ctx.tokens.editor),
      payload: { access_token: 'goog-token', kind: 'location', id: 'missing' },
    });
    expect(res.statusCode).toBe(404);
    expect(ctx.repos.exportJobs.create).not.toHaveBeenCalled();
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

describe('POST /export/slides — async job lifecycle (event happy path)', () => {
  it('returns 202 {job_id}, processes in background and completes the job with url + warnings', async () => {
    const fetchFn = makeGoogleFetch();
    const ctx = await buildTestApp({ repos: eventRepos(), fetchFn });
    const jobId = await startExport(ctx, { access_token: 'goog-token', kind: 'event', id: 'ev-1' });

    const job = await waitForJob(ctx, jobId);
    expect(job).toMatchObject({
      id: jobId,
      kind: 'event',
      target_id: 'ev-1',
      target_name: 'Convention Acme',
      status: 'done',
      presentation_id: 'pres-1',
      url: 'https://docs.google.com/presentation/d/pres-1/edit',
      warnings: [],
      error: null,
    });
    expect(job['created_at']).toBeTruthy();
    expect(job['finished_at']).toBeTruthy();

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
    // …and NEVER reaches the export_jobs rows (create/update payloads).
    expect(tokenReachedJobsRepo(ctx, 'goog-token')).toBe(false);

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
    // Event dates travel to the AI input.
    expect(data.event.date_start).toBe('2026-09-10');
    expect(data.event.date_end).toBe('2026-09-11');
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
    const jobId = await startExport(ctx, { access_token: 'goog-token', kind: 'project', id: 'proj-1' });
    const job = await waitForJob(ctx, jobId);
    expect(job['status']).toBe('done');
    expect(job['target_name']).toBe('Progetto Acme');
    const writeDeck = ctx.ai.writeDeck as ReturnType<typeof vi.fn>;
    const data = writeDeck.mock.calls[0]![0].data;
    expect(data.project.events[0].shortlist.map((v: { name: string }) => v.name)).toEqual([
      'Villa dei Pini',
      'Palazzo Terzo',
    ]);
  });
});

describe('POST /export/slides — Google errors land on the failed job', () => {
  it("records Google's message on 401 invalid credentials (token never persisted)", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(
        { error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } },
        401,
      ),
    ) as unknown as typeof fetch;
    const ctx = await buildTestApp({ repos: eventRepos(), fetchFn });
    const jobId = await startExport(ctx, { access_token: 'expired-token', kind: 'event', id: 'ev-1' });
    const job = await waitForJob(ctx, jobId);
    expect(job['status']).toBe('failed');
    expect(job['error']).toBe('Request had invalid authentication credentials.');
    expect(job['url']).toBeNull();
    expect(job['finished_at']).toBeTruthy();
    expect(tokenReachedJobsRepo(ctx, 'expired-token')).toBe(false);
  });

  it('records insufficient scope (403) and network failures as failed jobs', async () => {
    const forbidden = vi.fn(async () =>
      jsonResponse({ error: { code: 403, message: 'Request had insufficient authentication scopes.' } }, 403),
    ) as unknown as typeof fetch;
    const ctx1 = await buildTestApp({ repos: eventRepos(), fetchFn: forbidden });
    const job1 = await waitForJob(
      ctx1,
      await startExport(ctx1, { access_token: 'goog-token', kind: 'event', id: 'ev-1' }),
    );
    expect(job1['status']).toBe('failed');
    expect(job1['error']).toContain('insufficient authentication scopes');

    const offline = vi.fn(async () => {
      throw new Error('socket hang up');
    }) as unknown as typeof fetch;
    const ctx2 = await buildTestApp({ repos: eventRepos(), fetchFn: offline });
    const job2 = await waitForJob(
      ctx2,
      await startExport(ctx2, { access_token: 'goog-token', kind: 'event', id: 'ev-1' }),
    );
    expect(job2['status']).toBe('failed');
    expect(String(job2['error'])).toContain('Google Slides non raggiungibile');
  });
});

describe('POST /export/slides — AI failure is non-fatal', () => {
  it('falls back to factual texts and finishes done with the ai_unavailable warning', async () => {
    const fetchFn = makeGoogleFetch();
    const ctx = await buildTestApp({
      repos: eventRepos(),
      fetchFn,
      ai: { writeDeck: vi.fn(async () => Promise.reject(new Error('overloaded'))) },
    });
    const jobId = await startExport(ctx, { access_token: 'goog-token', kind: 'event', id: 'ev-1' });
    const job = await waitForJob(ctx, jobId);
    expect(job['status']).toBe('done');
    expect(job['warnings']).toContain('ai_unavailable');
    expect(job['presentation_id']).toBe('pres-1');

    // The fallback deck is still a real deck: cover + section + venue (+ compare).
    const requests = batchRequests(fetchFn);
    expect(requests.filter((r) => 'createSlide' in r).length).toBeGreaterThan(2);
    const texts = requests.filter((r) => 'insertText' in r).map((r) => (r['insertText'] as { text: string }).text);
    expect(texts).toContain('Proposta location — Convention Acme');
    expect(texts.some((t) => t.includes('Villa dei Pini'))).toBe(true);
  });
});

describe('Template v2 — event deck (deterministic, ai_texts=false)', () => {
  it('builds a full-bleed cover photo with berry band, dates + pax subtitle and venue_split slides', async () => {
    const fetchFn = makeGoogleFetch();
    const ctx = await buildTestApp({ repos: eventRepos(), fetchFn });
    const jobId = await startExport(ctx, {
      access_token: 'goog-token',
      kind: 'event',
      id: 'ev-1',
      include: { ai_texts: false },
    });
    const job = await waitForJob(ctx, jobId);
    expect(job['status']).toBe('done');
    expect(ctx.ai.writeDeck).not.toHaveBeenCalled();

    const requests = batchRequests(fetchFn);

    // Cover photo: full-bleed image sized to the 10x5.625in page via EMU.
    const coverImage = requests
      .map((r) => r['createImage'] as { objectId: string; url: string; elementProperties: Record<string, unknown> } | undefined)
      .find((img) => img?.objectId.includes('cover_img'));
    expect(coverImage).toBeDefined();
    expect(coverImage!.url).toContain('https://download.example/locations/loc-1/web/1.jpg');
    const size = coverImage!.elementProperties['size'] as {
      width: { magnitude: number; unit: string };
      height: { magnitude: number; unit: string };
    };
    expect(size.width).toEqual({ magnitude: 9_144_000, unit: 'EMU' });
    expect(size.height).toEqual({ magnitude: 5_143_500, unit: 'EMU' });

    // Semi-transparent berry band behind the white title/subtitle.
    const band = requests.find(
      (r) => 'createShape' in r && (r['createShape'] as { objectId: string }).objectId.includes('band'),
    );
    expect(band).toBeDefined();
    const bandFill = requests
      .map((r) => r['updateShapeProperties'] as Record<string, unknown> | undefined)
      .find((u) => (u?.['objectId'] as string | undefined)?.includes('band'));
    expect(bandFill).toBeDefined();
    const solid = (bandFill!['shapeProperties'] as Record<string, Record<string, Record<string, unknown>>>)[
      'shapeBackgroundFill'
    ]!['solidFill'];
    expect(solid!['alpha']).toBeLessThan(1);
    expect((solid!['color'] as { rgbColor: { red: number } }).rgbColor.red).toBeCloseTo(0x6d / 255, 5);

    // Cover subtitle carries the formatted event dates and pax.
    const texts = requests.filter((r) => 'insertText' in r).map((r) => (r['insertText'] as { text: string }).text);
    expect(texts.some((t) => t.includes('10/09/2026 – 11/09/2026') && t.includes('200 pax'))).toBe(true);

    // venue_split: explicit left text box + right-column photo.
    const textBoxes = requests.filter(
      (r) => 'createShape' in r && (r['createShape'] as { shapeType: string }).shapeType === 'TEXT_BOX',
    );
    expect(textBoxes.length).toBeGreaterThan(0);
    const venueImages = requests
      .map((r) => r['createImage'] as { objectId: string; elementProperties: Record<string, unknown> } | undefined)
      .filter((img) => img && !img.objectId.includes('cover_img'));
    expect(venueImages.length).toBeGreaterThan(0);
    const transform = venueImages[0]!.elementProperties['transform'] as { translateX: number };
    expect(transform.translateX).toBeGreaterThan(400); // right column
  });
});

describe('Template v2 — POI slide with routes (mocked Routes API)', () => {
  const locationReposWithPois = () => ({
    locations: {
      getById: vi.fn(async (id: string) => (id === 'loc-1' ? villaRow : null)),
      coordinates: vi.fn(async () => [{ id: 'loc-1', lon: 11.25, lat: 43.77 }]),
      getRelations: vi.fn(async () => ({
        children: [],
        spaceRows: [],
        capacityRows: [],
        contactRows: [],
        supplierRows: [],
        mediaRows: [],
        priceListRows: [],
      })),
    },
    registry: {
      listPois: vi.fn(async () => [
        { id: 'poi-1', name: 'Stazione SMN', kind: 'stazione', lon: 11.24, lat: 43.79, address: null, city: 'Firenze', notes: null },
      ]),
    },
  });

  it('computes routes, draws path=enc polylines on the static map and fills the Nome POI | Km | Min table', async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('routes.googleapis.com/directions/v2:computeRoutes')) {
        return jsonResponse({
          routes: [{ polyline: { encodedPolyline: 'abc123poly' }, distanceMeters: 3400, duration: '660s' }],
        });
      }
      if (u.includes(':batchUpdate')) return jsonResponse({ presentationId: 'pres-1', replies: [] });
      return jsonResponse({ presentationId: 'pres-1', slides: [{ objectId: 'default-slide-1' }] });
    }) as unknown as typeof fetch;

    const ctx = await buildTestApp({
      repos: locationReposWithPois(),
      fetchFn,
      googleMapsApiKey: 'maps-key',
      publicBaseUrl: 'https://api.example.com',
    });
    const jobId = await startExport(ctx, {
      access_token: 'goog-token',
      kind: 'location',
      id: 'loc-1',
      include: { ai_texts: false },
    });
    const job = await waitForJob(ctx, jobId);
    expect(job['status']).toBe('done');

    // computeRoutes called with the exact fieldmask (polyline + distance + duration).
    const routesCall = fetchCalls(fetchFn).find((c) => String(c[0]).includes(':computeRoutes'));
    expect(routesCall).toBeDefined();
    const routesHeaders = (routesCall![1] as RequestInit).headers as Record<string, string>;
    expect(routesHeaders['X-Goog-FieldMask']).toBe(
      'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration',
    );
    expect(routesHeaders['X-Goog-Api-Key']).toBe('maps-key');

    const requests = batchRequests(fetchFn);
    const imageUrls = requests
      .filter((r) => 'createImage' in r)
      .map((r) => (r['createImage'] as { url: string }).url);
    const mapUrl = imageUrls.find((u) => u.includes('maps.googleapis.com/maps/api/staticmap'));
    expect(mapUrl).toBeDefined();
    // Route polyline drawn via path=enc:<polyline>; berry + gold markers.
    expect(decodeURIComponent(mapUrl!)).toContain('path=enc:abc123poly');
    expect(decodeURIComponent(mapUrl!)).toContain('color:0x6D2E46|43.77,11.25');
    expect(decodeURIComponent(mapUrl!)).toContain('color:0xD4A947');

    // Compact table Nome POI | Km | Min auto with the REAL route distance (no 'stima').
    const cellTexts = requests
      .filter((r) => 'insertText' in r && (r['insertText'] as Record<string, unknown>)['cellLocation'])
      .map((r) => (r['insertText'] as { text: string }).text);
    expect(cellTexts).toContain('Nome POI');
    expect(cellTexts).toContain('Stazione SMN');
    expect(cellTexts).toContain('3.4');
    expect(cellTexts).toContain('11');
    expect(cellTexts.join(' ')).not.toContain('stima');
  });

  it('falls back to a markers-only OSM map-thumb + haversine stima without a Maps key', async () => {
    const fetchFn = makeGoogleFetch();
    const ctx = await buildTestApp({
      repos: locationReposWithPois(),
      fetchFn,
      publicBaseUrl: 'https://api.example.com',
    });
    const jobId = await startExport(ctx, {
      access_token: 'goog-token',
      kind: 'location',
      id: 'loc-1',
      include: { ai_texts: false },
    });
    const job = await waitForJob(ctx, jobId);
    expect(job['status']).toBe('done');

    const requests = batchRequests(fetchFn);
    const imageUrls = requests
      .filter((r) => 'createImage' in r)
      .map((r) => (r['createImage'] as { url: string }).url);
    expect(imageUrls).toContain('https://api.example.com/api/v1/locations/loc-1/map-thumb.png');
    const cellTexts = requests
      .filter((r) => 'insertText' in r && (r['insertText'] as Record<string, unknown>)['cellLocation'])
      .map((r) => (r['insertText'] as { text: string }).text);
    expect(cellTexts.some((t) => t.includes('(stima)'))).toBe(true);
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
    const jobId = await startExport(ctx, {
      access_token: 'goog-token',
      kind: 'location',
      id: 'loc-1',
      include: { ai_texts: false },
    });
    const job = await waitForJob(ctx, jobId);
    expect(job['status']).toBe('done');
    expect(job['warnings']).toEqual([]);
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
    const berry = styled
      .map(
        (r) =>
          r['updateTextStyle'] as {
            style: { foregroundColor?: { opaqueColor?: { rgbColor?: { red: number; green: number; blue: number } } } };
          },
      )
      .find((s) => s.style.foregroundColor?.opaqueColor?.rgbColor?.red !== 1);
    expect(berry).toBeDefined();
    const rgb = berry!.style.foregroundColor!.opaqueColor!.rgbColor!;
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
    const jobId = await startExport(ctx, {
      access_token: 'goog-token',
      kind: 'location',
      id: 'loc-1',
      include: { ai_texts: false },
    });
    const job = await waitForJob(ctx, jobId);
    expect(job['status']).toBe('done');
    expect(job['warnings']).toContain('photos_unavailable');
  });
});

describe('GET /export/jobs — repository listing', () => {
  it('returns 404 for an unknown job id', async () => {
    const ctx = await buildTestApp();
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/export/jobs/nope',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(404);
  });

  it('passes kind/q/pagination to the repo and shapes {data, meta}', async () => {
    const jobRow = {
      id: 'ej-9',
      kind: 'event',
      targetId: 'ev-1',
      targetName: 'Convention Acme',
      status: 'done',
      presentationId: 'pres-1',
      url: 'https://docs.google.com/presentation/d/pres-1/edit',
      warnings: [],
      error: null,
      requestedBy: null,
      include: null,
      createdAt: now,
      finishedAt: now,
    };
    const list = vi.fn(async () => ({ rows: [jobRow], total: 41 }));
    const ctx = await buildTestApp({ repos: { exportJobs: { list } } });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/export/jobs?kind=event&q=acme&page=2&per_page=10',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith({ kind: 'event', q: 'acme', offset: 10, limit: 10 });
    const body = res.json();
    expect(body.meta).toEqual({ page: 2, per_page: 10, total: 41 });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: 'ej-9',
      kind: 'event',
      target_id: 'ev-1',
      target_name: 'Convention Acme',
      status: 'done',
      presentation_id: 'pres-1',
      url: 'https://docs.google.com/presentation/d/pres-1/edit',
    });
    expect(body.data[0].created_at).toBe(now.toISOString());
    // The row shape never carries any token-like field.
    expect(JSON.stringify(body.data[0])).not.toContain('token');
  });

  it('rejects an invalid kind filter with 400', async () => {
    const ctx = await buildTestApp();
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/export/jobs?kind=shortlist',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(400);
  });

  it('lists newest first across multiple submitted jobs', async () => {
    const fetchFn = makeGoogleFetch();
    const ctx = await buildTestApp({ repos: eventRepos(), fetchFn });
    const first = await startExport(ctx, { access_token: 'goog-token', kind: 'event', id: 'ev-1' });
    const second = await startExport(ctx, { access_token: 'goog-token', kind: 'event', id: 'ev-1' });
    await waitForJob(ctx, first);
    await waitForJob(ctx, second);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/export/jobs',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((j: { id: string }) => j.id);
    expect(ids).toEqual([second, first]);
  });
});
