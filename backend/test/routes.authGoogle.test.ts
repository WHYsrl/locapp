import { describe, expect, it, vi } from 'vitest';
import { buildTestApp } from './helpers.js';

const WEB_CLIENT = 'web-client-id.apps.googleusercontent.com';
const IOS_CLIENT = 'ios-client-id.apps.googleusercontent.com';

const futureExp = () => String(Math.floor(Date.now() / 1000) + 3600);

function tokeninfo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    aud: WEB_CLIENT,
    sub: 'google-sub-1',
    email: 'anna@justwhy.it',
    email_verified: 'true',
    exp: futureExp(),
    name: 'Anna Rossi',
    picture: 'https://lh3.example/photo.jpg',
    ...overrides,
  };
}

const fetchReturning = (payload: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;

const login = (app: Awaited<ReturnType<typeof buildTestApp>>['app'], id_token = 'tok') =>
  app.inject({ method: 'POST', url: '/api/v1/auth/google', payload: { id_token } });

describe('POST /auth/google', () => {
  it('returns 503 sso_not_configured when GOOGLE_CLIENT_IDS is unset', async () => {
    const ctx = await buildTestApp();
    const res = await login(ctx.app);
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('sso_not_configured');
  });

  it('logs in an existing user found by google_sub without touching passwords', async () => {
    const user = {
      id: 'u1',
      email: 'anna@justwhy.it',
      name: 'Anna',
      passwordHash: 'x',
      role: 'editor',
      googleSub: 'google-sub-1',
      avatarUrl: 'https://lh3.example/photo.jpg',
      authProvider: 'google',
      createdAt: new Date(),
    };
    const findByGoogleSub = vi.fn(async () => user);
    const ctx = await buildTestApp({
      googleClientIds: [WEB_CLIENT, IOS_CLIENT],
      fetchFn: fetchReturning(tokeninfo()),
      repos: { users: { findByGoogleSub } },
    });
    const res = await login(ctx.app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTypeOf('string');
    expect(body.user).toEqual({ id: 'u1', email: 'anna@justwhy.it', name: 'Anna', role: 'editor' });
    expect(findByGoogleSub).toHaveBeenCalledWith('google-sub-1');
  });

  it('links google_sub to an existing password user matched by email', async () => {
    const user = {
      id: 'u2',
      email: 'anna@justwhy.it',
      name: 'Anna',
      passwordHash: '$2b$04$hash',
      role: 'admin',
      googleSub: null,
      avatarUrl: null,
      authProvider: 'password',
      createdAt: new Date(),
    };
    const update = vi.fn(async (id: string, patch: Record<string, unknown>) => ({ ...user, id, ...patch }));
    const ctx = await buildTestApp({
      googleClientIds: [WEB_CLIENT],
      fetchFn: fetchReturning(tokeninfo()),
      repos: { users: { findByEmail: async () => user, update } },
    });
    const res = await login(ctx.app);
    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith('u2', {
      googleSub: 'google-sub-1',
      avatarUrl: 'https://lh3.example/photo.jpg',
    });
    expect(res.json().user.role).toBe('admin');
  });

  it('accepts the iOS client id as audience too', async () => {
    const create = vi.fn(async (input: Record<string, unknown>) => ({ id: 'u-new', createdAt: new Date(), ...input }));
    const ctx = await buildTestApp({
      googleClientIds: [WEB_CLIENT, IOS_CLIENT],
      googleAllowedDomains: ['justwhy.it'],
      fetchFn: fetchReturning(tokeninfo({ aud: IOS_CLIENT })),
      repos: { users: { create } },
    });
    const res = await login(ctx.app);
    expect(res.statusCode).toBe(200);
  });

  it('auto-creates an editor for allowed domains (google provider, hashed random password)', async () => {
    const create = vi.fn(async (input: Record<string, unknown>) => ({ id: 'u-new', createdAt: new Date(), ...input }));
    const ctx = await buildTestApp({
      googleClientIds: [WEB_CLIENT],
      googleAllowedDomains: ['justwhy.it'],
      fetchFn: fetchReturning(tokeninfo()),
      repos: { users: { create } },
    });
    const res = await login(ctx.app);
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toEqual({
      id: 'u-new',
      email: 'anna@justwhy.it',
      name: 'Anna Rossi',
      role: 'editor',
    });
    const input = create.mock.calls[0]![0]!;
    expect(input).toMatchObject({
      email: 'anna@justwhy.it',
      role: 'editor',
      googleSub: 'google-sub-1',
      authProvider: 'google',
    });
    expect(String(input['passwordHash'])).toMatch(/^\$2/);
  });

  it('rejects unknown users outside the allowed domains with the Italian 403 message', async () => {
    const ctx = await buildTestApp({
      googleClientIds: [WEB_CLIENT],
      googleAllowedDomains: ['justwhy.it'],
      fetchFn: fetchReturning(tokeninfo({ email: 'mario@evil.example' })),
    });
    const res = await login(ctx.app);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toBe("Utente non autorizzato: contatta l'amministratore");
  });

  it('rejects tokens with wrong audience, unverified email or past expiry', async () => {
    for (const bad of [
      tokeninfo({ aud: 'someone-else' }),
      tokeninfo({ email_verified: 'false' }),
      tokeninfo({ exp: String(Math.floor(Date.now() / 1000) - 60) }),
    ]) {
      const ctx = await buildTestApp({
        googleClientIds: [WEB_CLIENT],
        googleAllowedDomains: ['justwhy.it'],
        fetchFn: fetchReturning(bad),
      });
      const res = await login(ctx.app);
      expect(res.statusCode).toBe(401);
    }
  });

  it('rejects when the tokeninfo endpoint itself rejects the token', async () => {
    const ctx = await buildTestApp({
      googleClientIds: [WEB_CLIENT],
      fetchFn: fetchReturning({ error: 'invalid_token' }, 400),
    });
    const res = await login(ctx.app, 'garbage');
    expect(res.statusCode).toBe(401);
  });
});
