import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { buildTestApp, auth } from './helpers.js';

describe('auth routes', () => {
  it('POST /auth/login returns token and user for valid credentials', async () => {
    const passwordHash = await bcrypt.hash('segretissimo', 4);
    const ctx = await buildTestApp({
      repos: {
        users: {
          findByEmail: async () => ({
            id: 'u1',
            email: 'anna@agency.it',
            name: 'Anna',
            passwordHash,
            role: 'editor',
            createdAt: new Date(),
          }),
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'anna@agency.it', password: 'segretissimo' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTypeOf('string');
    expect(body.user).toEqual({ id: 'u1', email: 'anna@agency.it', name: 'Anna', role: 'editor' });
  });

  it('POST /auth/login rejects wrong password with error envelope', async () => {
    const passwordHash = await bcrypt.hash('right', 4);
    const ctx = await buildTestApp({
      repos: {
        users: {
          findByEmail: async () => ({
            id: 'u1',
            email: 'a@b.it',
            name: 'A',
            passwordHash,
            role: 'viewer',
            createdAt: new Date(),
          }),
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'a@b.it', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
  });

  it('POST /auth/register is admin-only', async () => {
    const ctx = await buildTestApp();
    const payload = { email: 'new@agency.it', password: 'password123', name: 'Nuovo', role: 'editor' };
    const asEditor = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: auth(ctx.tokens.editor),
      payload,
    });
    expect(asEditor.statusCode).toBe(403);
    const asAdmin = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: auth(ctx.tokens.admin),
      payload,
    });
    expect(asAdmin.statusCode).toBe(201);
    expect(asAdmin.json()).toMatchObject({ email: 'new@agency.it', role: 'editor' });
  });

  it('requires a bearer token on protected routes and blocks viewer writes', async () => {
    const ctx = await buildTestApp();
    const noToken = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations' });
    expect(noToken.statusCode).toBe(401);
    const viewerWrite = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: auth(ctx.tokens.viewer),
      payload: { name: 'X' },
    });
    expect(viewerWrite.statusCode).toBe(403);
    const health = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.statusCode).toBe(200);
  });
});
