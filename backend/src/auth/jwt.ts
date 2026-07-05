import jwt from 'jsonwebtoken';
import type { UserRole, UserRow } from '../db/schema.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export function signToken(user: Pick<UserRow, 'id' | 'email' | 'name' | 'role'>, secret: string): string {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name, role: user.role }, secret, {
    expiresIn: '7d',
  });
}

export function verifyToken(token: string, secret: string): AuthUser {
  const payload = jwt.verify(token, secret) as jwt.JwtPayload;
  return {
    id: String(payload.sub),
    email: String(payload['email'] ?? ''),
    name: String(payload['name'] ?? ''),
    role: (payload['role'] as AuthUser['role']) ?? 'viewer',
  };
}
