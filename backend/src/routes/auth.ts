import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signToken } from '../auth/jwt.js';
import { forbidden, serviceUnavailable, unauthorized } from '../lib/errors.js';
import type { UserRow } from '../db/schema.js';

const GOOGLE_TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_TIMEOUT_MS = 8_000;

const LoginBody = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
});

const RegisterBody = z.object({
  email: z.string().min(3),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['admin', 'editor', 'viewer']).default('viewer'),
});

const GoogleBody = z.object({
  id_token: z.string().min(1),
});

function loginResponse(user: UserRow, secret: string) {
  return {
    token: signToken(user, secret),
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', { config: { public: true } }, async (req) => {
    const body = LoginBody.parse(req.body);
    const user = await app.deps.repos.users.findByEmail(body.email.toLowerCase());
    if (!user) throw unauthorized('Invalid credentials');
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) throw unauthorized('Invalid credentials');
    return loginResponse(user, app.deps.jwtSecret);
  });

  // Google SSO: verifies the ID token via Google's tokeninfo endpoint, then either
  // logs in an existing user (linking google_sub on first SSO login) or auto-creates
  // an editor when the email domain is in GOOGLE_ALLOWED_DOMAINS.
  app.post('/auth/google', { config: { public: true } }, async (req) => {
    const clientIds = app.deps.googleClientIds ?? [];
    if (clientIds.length === 0) {
      throw serviceUnavailable(
        'sso_not_configured',
        'Google SSO non configurato: impostare GOOGLE_CLIENT_IDS su Render',
      );
    }
    const body = GoogleBody.parse(req.body);
    const fetchFn = app.deps.fetchFn ?? fetch;

    let payload: Record<string, unknown> | null = null;
    try {
      const response = await fetchFn(
        `${GOOGLE_TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(body.id_token)}`,
        { signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) },
      );
      if (response.ok) payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = null;
    }
    if (!payload) throw unauthorized('Token Google non valido');

    const aud = String(payload['aud'] ?? '');
    const sub = String(payload['sub'] ?? '');
    const email = String(payload['email'] ?? '').toLowerCase();
    const exp = Number.parseInt(String(payload['exp'] ?? ''), 10);
    if (!clientIds.includes(aud)) throw unauthorized('Token Google non valido (audience)');
    if (payload['email_verified'] !== 'true') throw unauthorized('Email Google non verificata');
    if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) throw unauthorized('Token Google scaduto');
    if (!sub || !email) throw unauthorized('Token Google non valido');
    const picture = typeof payload['picture'] === 'string' ? payload['picture'] : null;

    const { users } = app.deps.repos;
    let user = (await users.findByGoogleSub(sub)) ?? (await users.findByEmail(email));
    if (user) {
      // Link the Google identity on first SSO login (and refresh the avatar).
      if (user.googleSub !== sub || (picture && user.avatarUrl !== picture)) {
        user =
          (await users.update(user.id, {
            googleSub: sub,
            ...(picture ? { avatarUrl: picture } : {}),
          })) ?? user;
      }
    } else {
      const domain = email.split('@')[1] ?? '';
      const allowed = (app.deps.googleAllowedDomains ?? []).map((d) => d.toLowerCase());
      if (!domain || !allowed.includes(domain)) {
        throw forbidden("Utente non autorizzato: contatta l'amministratore");
      }
      user = await users.create({
        email,
        name: typeof payload['name'] === 'string' && payload['name'] ? payload['name'] : email,
        role: 'editor',
        // Unusable random password: SSO users authenticate via Google only.
        passwordHash: await bcrypt.hash(randomUUID(), 10),
        googleSub: sub,
        avatarUrl: picture,
        authProvider: 'google',
      });
    }
    return loginResponse(user, app.deps.jwtSecret);
  });

  app.post('/auth/register', async (req, reply) => {
    if (req.user?.role !== 'admin') throw forbidden('Only admins can register users');
    const body = RegisterBody.parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await app.deps.repos.users.create({
      email: body.email.toLowerCase(),
      name: body.name,
      passwordHash,
      role: body.role,
    });
    reply.status(201);
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  });
}
