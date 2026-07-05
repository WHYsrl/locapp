import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { paginated, parsePagination } from '../lib/pagination.js';
import { rowToApi, rowsToApi } from '../lib/apiMappers.js';

const IdParams = z.object({ id: z.string() });

const CompanyBody = z.object({
  name: z.string().min(1),
  kind: z.enum(['gestione', 'fornitore', 'entrambi']).default('fornitore'),
  supplier_categories: z.array(z.string()).nullish(),
  vat_number: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  website: z.string().nullish(),
  notes: z.string().nullish(),
});

export async function companyRoutes(app: FastifyInstance): Promise<void> {
  const { repos } = app.deps;

  app.get('/companies', async (req) => {
    const p = parsePagination(req.query);
    const query = z
      .object({
        kind: z.enum(['gestione', 'fornitore', 'entrambi']).optional(),
        category: z.string().optional(),
        q: z.string().optional(),
      })
      .parse(req.query);
    const { rows, total } = await repos.registry.listCompanies(p, query);
    return paginated(rowsToApi(rows), total, p);
  });

  app.post('/companies', async (req, reply) => {
    const body = CompanyBody.parse(req.body);
    const row = await repos.registry.createCompany({
      name: body.name,
      kind: body.kind,
      supplierCategories: body.supplier_categories ?? null,
      vatNumber: body.vat_number ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      website: body.website ?? null,
      notes: body.notes ?? null,
    });
    reply.status(201);
    return rowToApi(row);
  });

  app.get('/companies/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const row = await repos.registry.getCompany(id);
    if (!row) throw notFound('Company');
    const companyContacts = await repos.registry.listCompanyContacts(id);
    return { ...rowToApi(row), contacts: rowsToApi(companyContacts) };
  });

  app.patch('/companies/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = CompanyBody.partial().parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch['name'] = body.name;
    if (body.kind !== undefined) patch['kind'] = body.kind;
    if (body.supplier_categories !== undefined) patch['supplierCategories'] = body.supplier_categories;
    if (body.vat_number !== undefined) patch['vatNumber'] = body.vat_number;
    if (body.email !== undefined) patch['email'] = body.email;
    if (body.phone !== undefined) patch['phone'] = body.phone;
    if (body.website !== undefined) patch['website'] = body.website;
    if (body.notes !== undefined) patch['notes'] = body.notes;
    const row = await repos.registry.updateCompany(id, patch as never);
    if (!row) throw notFound('Company');
    return rowToApi(row);
  });

  app.delete('/companies/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const ok = await repos.registry.softDeleteCompany(id);
    if (!ok) throw notFound('Company');
    reply.status(204);
  });

  app.get('/companies/:id/contacts', async (req) => {
    const { id } = IdParams.parse(req.params);
    const company = await repos.registry.getCompany(id);
    if (!company) throw notFound('Company');
    return { data: rowsToApi(await repos.registry.listCompanyContacts(id)) };
  });

  app.post('/companies/:id/contacts', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const company = await repos.registry.getCompany(id);
    if (!company) throw notFound('Company');
    const body = z.object({ contact_id: z.string(), role: z.string().default('') }).parse(req.body);
    const row = await repos.registry.linkCompanyContact({
      companyId: id,
      contactId: body.contact_id,
      role: body.role,
    });
    reply.status(201);
    return rowToApi(row);
  });

  app.delete('/companies/:id/contacts/:contactId', async (req, reply) => {
    const params = z.object({ id: z.string(), contactId: z.string() }).parse(req.params);
    const ok = await repos.registry.unlinkCompanyContact(params.id, params.contactId);
    if (!ok) throw notFound('Company contact');
    reply.status(204);
  });
}
