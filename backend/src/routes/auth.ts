import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signToken } from '../auth/jwt.js';
import { forbidden, unauthorized } from '../lib/errors.js';

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

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', { config: { public: true } }, async (req) => {
    const body = LoginBody.parse(req.body);
    const user = await app.deps.repos.users.findByEmail(body.email.toLowerCase());
    if (!user) throw unauthorized('Invalid credentials');
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) throw unauthorized('Invalid credentials');
    return {
      token: signToken(user, app.deps.jwtSecret),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
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
