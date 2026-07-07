import { vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from '../src/app.js';
import { signToken } from '../src/auth/jwt.js';
import type { Repos } from '../src/db/repos/index.js';
import type { AiService } from '../src/ai/service.js';
import type { StorageService } from '../src/storage/s3.js';
import type { ExtractedLocationDraft } from '../src/ai/extraction.js';
import type { DeckContent } from '../src/export/copywriter.js';
import type { GeocodeFn } from '../src/lib/geocode.js';

export const TEST_SECRET = 'test-secret';

type SectionOverrides = { [K in keyof Repos]?: Partial<Record<string, unknown>> };

export function makeRepos(overrides: SectionOverrides = {}): Repos {
  const base = {
    users: {
      findByEmail: vi.fn(async () => null),
      findById: vi.fn(async () => null),
      findByGoogleSub: vi.fn(async () => null),
      create: vi.fn(async (input: Record<string, unknown>) => ({ id: 'user-1', createdAt: new Date(), ...input })),
      update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
    },
    locations: {
      list: vi.fn(async () => ({ rows: [], total: 0 })),
      getById: vi.fn(async () => null),
      getRelations: vi.fn(async () => ({
        children: [],
        spaceRows: [],
        capacityRows: [],
        contactRows: [],
        supplierRows: [],
        mediaRows: [],
        priceListRows: [],
      })),
      create: vi.fn(async (input: Record<string, unknown>) => ({ id: 'loc-new', ...input })),
      update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
      softDelete: vi.fn(async () => true),
      usage: vi.fn(async () => []),
      history: vi.fn(async () => ({ visits: [], quotes: [], links: [], feedback: [] })),
      listSpaces: vi.fn(async () => ({ spaceRows: [], caps: [] })),
      getSpace: vi.fn(async () => null),
      createSpace: vi.fn(async (input: Record<string, unknown>) => ({ id: 'space-1', ...input })),
      updateSpace: vi.fn(async () => null),
      deleteSpace: vi.fn(async () => true),
      setCapacities: vi.fn(async () => []),
      getCapacities: vi.fn(async () => []),
      addContact: vi.fn(async (input: Record<string, unknown>) => input),
      removeContact: vi.fn(async () => true),
      addSupplier: vi.fn(async (input: Record<string, unknown>) => ({ id: 'sup-1', ...input })),
      updateSupplier: vi.fn(async () => null),
      removeSupplier: vi.fn(async () => true),
      listMedia: vi.fn(async () => []),
      getMedia: vi.fn(async () => null),
      createMedia: vi.fn(async (input: Record<string, unknown>) => ({ id: 'media-1', ...input })),
      updateMedia: vi.fn(async () => null),
      deleteMedia: vi.fn(async () => true),
      listPriceLists: vi.fn(async () => []),
      createPriceList: vi.fn(async (input: Record<string, unknown>) => ({ id: 'pl-1', ...input })),
      deletePriceList: vi.fn(async () => true),
      listProjectNotes: vi.fn(async () => []),
      createProjectNote: vi.fn(async (input: Record<string, unknown>) => ({ id: 'note-1', ...input })),
      capacitiesForLocations: vi.fn(async () => []),
      coordinates: vi.fn(async () => []),
      listChildren: vi.fn(async () => []),
      detachChildren: vi.fn(async () => 0),
      removeShortlistReferences: vi.fn(async () => 0),
    },
    projects: {
      list: vi.fn(async () => ({ rows: [], total: 0 })),
      getById: vi.fn(async () => null),
      create: vi.fn(async (input: Record<string, unknown>) => ({ id: 'proj-1', ...input })),
      update: vi.fn(async () => null),
      softDelete: vi.fn(async () => true),
      listEvents: vi.fn(async () => []),
      locationCountsByEvent: vi.fn(async () => []),
      getEvent: vi.fn(async () => null),
      createEvent: vi.fn(async (input: Record<string, unknown>) => ({ id: 'event-1', ...input })),
      updateEvent: vi.fn(async () => null),
      deleteEvent: vi.fn(async () => true),
      deleteEventsForProject: vi.fn(async () => 0),
      listEventLocations: vi.fn(async () => []),
      getEventLocation: vi.fn(async () => null),
      addEventLocation: vi.fn(async (input: Record<string, unknown>) => ({ id: 'el-1', ...input })),
      updateEventLocation: vi.fn(async () => null),
      deleteEventLocation: vi.fn(async () => true),
      listVisits: vi.fn(async () => []),
      createVisit: vi.fn(async (input: Record<string, unknown>) => ({ id: 'visit-1', ...input })),
      deleteVisit: vi.fn(async () => true),
      listQuotes: vi.fn(async () => []),
      createQuote: vi.fn(async (input: Record<string, unknown>) => ({ id: 'quote-1', ...input })),
      updateQuote: vi.fn(async () => null),
      deleteQuote: vi.fn(async () => true),
      listAvailability: vi.fn(async () => []),
      createAvailability: vi.fn(async (input: Record<string, unknown>) => ({ id: 'avail-1', ...input })),
      deleteAvailability: vi.fn(async () => true),
      createFeedback: vi.fn(async (inputs: Array<Record<string, unknown>>) =>
        inputs.map((i, n) => ({ id: `fb-${n}`, ...i })),
      ),
      listFeedbackByEvent: vi.fn(async () => []),
      listFeedbackForSubject: vi.fn(async () => []),
      mapLocationsForEvents: vi.fn(async () => []),
    },
    registry: {
      listCompanies: vi.fn(async () => ({ rows: [], total: 0 })),
      getCompany: vi.fn(async () => null),
      createCompany: vi.fn(async (input: Record<string, unknown>) => ({ id: 'comp-1', ...input })),
      updateCompany: vi.fn(async () => null),
      softDeleteCompany: vi.fn(async () => true),
      listCompanyContacts: vi.fn(async () => []),
      linkCompanyContact: vi.fn(async (input: Record<string, unknown>) => input),
      unlinkCompanyContact: vi.fn(async () => true),
      listContacts: vi.fn(async () => ({ rows: [], total: 0 })),
      getContact: vi.fn(async () => null),
      createContact: vi.fn(async (input: Record<string, unknown>) => ({ id: 'contact-1', ...input })),
      updateContact: vi.fn(async () => null),
      softDeleteContact: vi.fn(async () => true),
      listPois: vi.fn(async () => []),
      getPoi: vi.fn(async () => null),
      createPoi: vi.fn(async (input: Record<string, unknown>) => ({ id: 'poi-1', ...input })),
      updatePoi: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
      deletePoi: vi.fn(async () => true),
    },
    tags: {
      list: vi.fn(async () => []),
      getById: vi.fn(async () => null),
      findByName: vi.fn(async () => null),
      create: vi.fn(async (input: Record<string, unknown>) => ({ id: 'tag-1', createdAt: new Date(), ...input })),
      update: vi.fn(async () => null),
      delete: vi.fn(async () => true),
      upsertMissing: vi.fn(async () => []),
      renameInArrays: vi.fn(async () => undefined),
    },
    ingestion: {
      create: vi.fn(async (input: Record<string, unknown>) => ({
        id: 'job-1',
        status: 'pending',
        createdAt: new Date(),
        rawText: null,
        sourceUrl: null,
        sourceMediaId: null,
        locationId: null,
        extracted: null,
        error: null,
        appliedAt: null,
        ...input,
      })),
      getById: vi.fn(async () => null),
      update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
    },
    search: {
      prefilterLocations: vi.fn(async () => []),
    },
  };

  for (const [section, methods] of Object.entries(overrides)) {
    Object.assign((base as Record<string, object>)[section] as object, methods);
  }
  return base as unknown as Repos;
}

export const sampleDraft: ExtractedLocationDraft = {
  confidence: 0.9,
  location: { name: 'Villa dei Pini', city: 'Firenze', summary: 'Villa storica con parco.' },
  spaces: [
    { kind: 'interno', name: 'Salone Affreschi', area_sqm: 300, capacities: { tavoli_tondi: 150, in_piedi: 250 } },
  ],
  contacts: [
    { first_name: 'Anna', last_name: 'Bianchi', role: 'referente eventi', phone: '055123456', email: 'anna@villa.it', company_name: 'Villa dei Pini srl' },
  ],
  suppliers: [{ company_name: 'Catering Toscano', category: 'catering', requirement: 'obbligatorio' }],
  price_items: [{ voce: 'Affitto giornaliero', prezzo: 5000, unita: 'giorno', note: '' }],
  open_questions: ['Chiedere potenza massima disponibile'],
  field_sources: { 'locations.name': 'pagina 1' },
  proposed_media: [],
};

export const sampleDeck: DeckContent = {
  title: 'Proposta location',
  subtitle: 'VenueScout',
  slides: [
    { layout: 'cover', title: 'Proposta location', body_lines: [], image_urls: [], table: null, notes: null },
    { layout: 'venue', title: 'Villa dei Pini', body_lines: ['Firenze', 'Villa storica con parco.'], image_urls: [], table: null, notes: null },
    { layout: 'table', title: 'Capienze', body_lines: [], image_urls: [], notes: null, table: { headers: ['Location', 'Capienze'], rows: [['Villa dei Pini', 'Platea: 250']] } },
  ],
};

export function makeAi(overrides: Partial<AiService> = {}): AiService {
  return {
    extractLocationDraft: vi.fn(async () => sampleDraft),
    parseBrief: vi.fn(async () => ({})),
    rerank: vi.fn(async () => []),
    suggestTags: vi.fn(async () => []),
    writeDeck: vi.fn(async () => sampleDeck),
    ...overrides,
  };
}

export function makeStorage(overrides: Partial<StorageService> = {}): StorageService {
  return {
    isConfigured: vi.fn(() => true),
    putObject: vi.fn(async () => undefined),
    presignPut: vi.fn(async (key: string, mime: string) => `https://upload.example/${key}?sig=put&ct=${encodeURIComponent(mime)}`),
    presignGet: vi.fn(async (key: string) => `https://download.example/${key}?sig=get`),
    deleteObject: vi.fn(async () => undefined),
    ...overrides,
  };
}

export interface TestContext {
  app: FastifyInstance;
  repos: Repos;
  ai: AiService;
  storage: StorageService;
  geocode: GeocodeFn;
  renderMapThumb: (lat: number, lon: number) => Promise<Buffer>;
  tokens: { admin: string; editor: string; viewer: string };
}

export async function buildTestApp(
  overrides: {
    repos?: SectionOverrides;
    ai?: Partial<AiService>;
    storage?: Partial<StorageService>;
    geocode?: GeocodeFn;
    renderMapThumb?: (lat: number, lon: number) => Promise<Buffer>;
    googleClientIds?: string[];
    googleAllowedDomains?: string[];
    googleMapsApiKey?: string;
    fetchFn?: typeof fetch;
    publicBaseUrl?: string;
  } = {},
): Promise<TestContext> {
  const repos = makeRepos(overrides.repos);
  const ai = makeAi(overrides.ai);
  const storage = makeStorage(overrides.storage);
  // Hermetic by default: tests never hit the real Nominatim service.
  const geocode = overrides.geocode ?? vi.fn(async () => []);
  // Hermetic by default: tests never fetch OSM tiles or run sharp.
  const renderMapThumb =
    overrides.renderMapThumb ?? vi.fn(async () => Buffer.from('fake-png'));
  const deps: AppDeps = {
    repos,
    ai,
    storage,
    geocode,
    renderMapThumb,
    jwtSecret: TEST_SECRET,
    googleClientIds: overrides.googleClientIds,
    googleAllowedDomains: overrides.googleAllowedDomains,
    googleMapsApiKey: overrides.googleMapsApiKey,
    fetchFn: overrides.fetchFn,
    publicBaseUrl: overrides.publicBaseUrl,
  };
  const app = await buildApp(deps);
  const tokens = {
    admin: signToken({ id: 'u-admin', email: 'admin@test.it', name: 'Admin', role: 'admin' }, TEST_SECRET),
    editor: signToken({ id: 'u-editor', email: 'editor@test.it', name: 'Editor', role: 'editor' }, TEST_SECRET),
    viewer: signToken({ id: 'u-viewer', email: 'viewer@test.it', name: 'Viewer', role: 'viewer' }, TEST_SECRET),
  };
  return { app, repos, ai, storage, geocode, renderMapThumb, tokens };
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });
