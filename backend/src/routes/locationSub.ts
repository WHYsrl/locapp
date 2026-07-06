import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import { notFound } from '../lib/errors.js';
import { storageNotConfigured } from '../storage/s3.js';
import { rowToApi, rowsToApi } from '../lib/apiMappers.js';

const IdParams = z.object({ id: z.string() });

const SpaceBody = z.object({
  kind: z.enum(['interno', 'esterno']),
  name: z.string().min(1),
  area_sqm: z.number().nullish(),
  height_m: z.number().nullish(),
  covered: z.enum(['coperto', 'scoperto', 'copribile']).nullish(),
  features: z.record(z.string(), z.unknown()).nullish(),
  sort: z.number().int().optional(),
});

const CapacitiesBody = z.object({
  capacities: z.array(
    z.object({
      configuration: z.enum([
        'in_piedi',
        'tavoli_tondi',
        'tavolo_imperiale',
        'platea',
        'ferro_di_cavallo',
        'classroom',
        'cocktail',
      ]),
      capacity: z.number().int().positive(),
    }),
  ),
});

const ContactLinkBody = z.object({
  contact_id: z.string(),
  company_id: z.string().nullish(),
  role: z.string().default(''),
});

const SupplierBody = z.object({
  company_id: z.string(),
  contact_id: z.string().nullish(),
  category: z.string().min(1),
  requirement: z.enum(['obbligatorio', 'consigliato']).default('consigliato'),
  conditions: z.string().nullish(),
  rating: z.number().nullish(),
});

const MediaKindEnum = z.enum(['foto', 'video', 'planimetria', 'documento', 'listino']);
const MediaCategoryEnum = z.enum(['esterni', 'interni', 'sala', 'servizi', 'setup']);

const MediaBody = z.object({
  kind: MediaKindEnum,
  category: MediaCategoryEnum.nullish(),
  filename: z.string().min(1),
  mime: z.string().min(1),
  space_id: z.string().nullish(),
});

const MediaPatchBody = z.object({
  kind: MediaKindEnum.optional(),
  category: MediaCategoryEnum.nullish(),
  space_id: z.string().nullish(),
});

const PriceListBody = z.object({
  name: z.string().min(1),
  valid_from: z.string().nullish(),
  valid_to: z.string().nullish(),
  items: z.array(z.record(z.string(), z.unknown())).nullish(),
  payment_terms: z.record(z.string(), z.unknown()).nullish(),
  source_media_id: z.string().nullish(),
});

const ProjectNoteBody = z.object({
  project_id: z.string(),
  event_id: z.string().nullish(),
  overrides: z.record(z.string(), z.unknown()).nullish(),
  notes: z.string().nullish(),
});

export async function locationSubRoutes(app: FastifyInstance): Promise<void> {
  const { repos, storage } = app.deps;

  const mustExist = async (locationId: string) => {
    const location = await repos.locations.getById(locationId);
    if (!location) throw notFound('Location');
    return location;
  };

  // ---- spaces ----
  app.get('/locations/:id/spaces', async (req) => {
    const { id } = IdParams.parse(req.params);
    await mustExist(id);
    const { spaceRows, caps } = await repos.locations.listSpaces(id);
    return {
      data: spaceRows.map((s) => ({
        ...rowToApi(s),
        capacities: caps
          .filter((c) => c.spaceId === s.id)
          .map((c) => ({ configuration: c.configuration, capacity: c.capacity })),
      })),
    };
  });

  app.post('/locations/:id/spaces', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await mustExist(id);
    const body = SpaceBody.parse(req.body);
    const row = await repos.locations.createSpace({
      locationId: id,
      kind: body.kind,
      name: body.name,
      areaSqm: body.area_sqm == null ? null : String(body.area_sqm),
      heightM: body.height_m == null ? null : String(body.height_m),
      covered: body.covered ?? null,
      features: (body.features ?? null) as never,
      sort: body.sort ?? 0,
    });
    reply.status(201);
    return rowToApi(row);
  });

  app.patch('/spaces/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = SpaceBody.partial().parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.kind !== undefined) patch['kind'] = body.kind;
    if (body.name !== undefined) patch['name'] = body.name;
    if (body.area_sqm !== undefined) patch['areaSqm'] = body.area_sqm == null ? null : String(body.area_sqm);
    if (body.height_m !== undefined) patch['heightM'] = body.height_m == null ? null : String(body.height_m);
    if (body.covered !== undefined) patch['covered'] = body.covered;
    if (body.features !== undefined) patch['features'] = body.features;
    if (body.sort !== undefined) patch['sort'] = body.sort;
    const row = await repos.locations.updateSpace(id, patch as never);
    if (!row) throw notFound('Space');
    return rowToApi(row);
  });

  app.delete('/spaces/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const ok = await repos.locations.deleteSpace(id);
    if (!ok) throw notFound('Space');
    reply.status(204);
  });

  app.get('/spaces/:id/capacities', async (req) => {
    const { id } = IdParams.parse(req.params);
    const space = await repos.locations.getSpace(id);
    if (!space) throw notFound('Space');
    const caps = await repos.locations.getCapacities(id);
    return { data: caps.map((c) => ({ configuration: c.configuration, capacity: c.capacity })) };
  });

  app.put('/spaces/:id/capacities', async (req) => {
    const { id } = IdParams.parse(req.params);
    const space = await repos.locations.getSpace(id);
    if (!space) throw notFound('Space');
    const body = CapacitiesBody.parse(req.body);
    const caps = await repos.locations.setCapacities(id, body.capacities);
    return { data: caps.map((c) => ({ configuration: c.configuration, capacity: c.capacity })) };
  });

  // ---- contacts ----
  app.post('/locations/:id/contacts', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await mustExist(id);
    const body = ContactLinkBody.parse(req.body);
    const row = await repos.locations.addContact({
      locationId: id,
      contactId: body.contact_id,
      companyId: body.company_id ?? null,
      role: body.role,
    });
    reply.status(201);
    return rowToApi(row);
  });

  app.delete('/locations/:id/contacts/:contactId', async (req, reply) => {
    const params = z.object({ id: z.string(), contactId: z.string() }).parse(req.params);
    const ok = await repos.locations.removeContact(params.id, params.contactId);
    if (!ok) throw notFound('Location contact');
    reply.status(204);
  });

  // ---- suppliers ----
  app.post('/locations/:id/suppliers', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await mustExist(id);
    const body = SupplierBody.parse(req.body);
    const row = await repos.locations.addSupplier({
      locationId: id,
      companyId: body.company_id,
      contactId: body.contact_id ?? null,
      category: body.category,
      requirement: body.requirement,
      conditions: body.conditions ?? null,
      rating: body.rating == null ? null : String(body.rating),
    });
    reply.status(201);
    return rowToApi(row);
  });

  app.patch('/location-suppliers/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = SupplierBody.partial().parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.category !== undefined) patch['category'] = body.category;
    if (body.requirement !== undefined) patch['requirement'] = body.requirement;
    if (body.conditions !== undefined) patch['conditions'] = body.conditions;
    if (body.rating !== undefined) patch['rating'] = body.rating == null ? null : String(body.rating);
    if (body.contact_id !== undefined) patch['contactId'] = body.contact_id;
    const row = await repos.locations.updateSupplier(id, patch as never);
    if (!row) throw notFound('Location supplier');
    return rowToApi(row);
  });

  app.delete('/location-suppliers/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const ok = await repos.locations.removeSupplier(id);
    if (!ok) throw notFound('Location supplier');
    reply.status(204);
  });

  // ---- media (presigned upload) ----
  app.get('/locations/:id/media', async (req) => {
    const { id } = IdParams.parse(req.params);
    await mustExist(id);
    return { data: rowsToApi(await repos.locations.listMedia(id)) };
  });

  app.post('/locations/:id/media', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    // Storage config is checked at request time (not boot): 503 with an actionable message.
    if (!storage.isConfigured()) throw storageNotConfigured();
    await mustExist(id);
    const body = MediaBody.parse(req.body);
    const safeName = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `locations/${id}/${uuidv7()}-${safeName}`;
    const uploadUrl = await storage.presignPut(key, body.mime);
    // The media row stores the S3 key in `url`; display URLs come from GET /media/:id/url.
    const row = await repos.locations.createMedia({
      locationId: id,
      spaceId: body.space_id ?? null,
      kind: body.kind,
      category: body.category ?? null,
      url: key,
      filename: body.filename,
      mime: body.mime,
    });
    reply.status(201);
    return { data: { media: rowToApi(row), upload_url: uploadUrl } };
  });

  app.get('/media/:id/url', async (req) => {
    const { id } = IdParams.parse(req.params);
    if (!storage.isConfigured()) throw storageNotConfigured();
    const row = await repos.locations.getMedia(id);
    if (!row) throw notFound('Media');
    return { data: { url: await storage.presignGet(row.url) } };
  });

  app.patch('/media/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = MediaPatchBody.parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.kind !== undefined) patch['kind'] = body.kind;
    if (body.category !== undefined) patch['category'] = body.category;
    if (body.space_id !== undefined) patch['spaceId'] = body.space_id;
    const row = await repos.locations.updateMedia(id, patch as never);
    if (!row) throw notFound('Media');
    return { data: rowToApi(row) };
  });

  app.delete('/media/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const row = await repos.locations.getMedia(id);
    if (!row) throw notFound('Media');
    await repos.locations.deleteMedia(id);
    // Best-effort S3 cleanup: the DB row is gone even if the object delete fails.
    if (storage.isConfigured()) {
      try {
        await storage.deleteObject(row.url);
      } catch (err) {
        req.log.warn({ err, key: row.url }, 'best-effort S3 delete failed');
      }
    }
    reply.status(204);
  });

  // ---- price lists ----
  app.get('/locations/:id/price-lists', async (req) => {
    const { id } = IdParams.parse(req.params);
    await mustExist(id);
    return { data: rowsToApi(await repos.locations.listPriceLists(id)) };
  });

  app.post('/locations/:id/price-lists', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await mustExist(id);
    const body = PriceListBody.parse(req.body);
    const row = await repos.locations.createPriceList({
      locationId: id,
      name: body.name,
      validFrom: body.valid_from ?? null,
      validTo: body.valid_to ?? null,
      items: (body.items ?? null) as never,
      paymentTerms: (body.payment_terms ?? null) as never,
      sourceMediaId: body.source_media_id ?? null,
    });
    reply.status(201);
    return rowToApi(row);
  });

  app.delete('/price-lists/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const ok = await repos.locations.deletePriceList(id);
    if (!ok) throw notFound('Price list');
    reply.status(204);
  });

  // ---- project notes ----
  app.get('/locations/:id/notes', async (req) => {
    const { id } = IdParams.parse(req.params);
    await mustExist(id);
    const query = z.object({ project_id: z.string().optional() }).parse(req.query);
    return { data: rowsToApi(await repos.locations.listProjectNotes(id, query.project_id)) };
  });

  app.post('/locations/:id/notes', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await mustExist(id);
    const body = ProjectNoteBody.parse(req.body);
    const row = await repos.locations.createProjectNote({
      locationId: id,
      projectId: body.project_id,
      eventId: body.event_id ?? null,
      overrides: (body.overrides ?? null) as never,
      notes: body.notes ?? null,
    });
    reply.status(201);
    return rowToApi(row);
  });
}
