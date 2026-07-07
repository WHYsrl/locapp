import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/venuescout'),
  ANTHROPIC_API_KEY: z.string().optional(),
  JWT_SECRET: z.string().default('dev-secret-change-me'),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Comma-separated Google OAuth client IDs (web + iOS). Unset → /auth/google returns 503. */
  GOOGLE_CLIENT_IDS: z.string().optional(),
  /** Comma-separated email domains allowed to auto-provision via Google SSO (e.g. "justwhy.it"). */
  GOOGLE_ALLOWED_DOMAINS: z.string().optional(),
  /** Google Maps Platform key. Unset → OSM Nominatim / tile / haversine fallbacks everywhere. */
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  SKIP_MIGRATE_ON_FAIL: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
