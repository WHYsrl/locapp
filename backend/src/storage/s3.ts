import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config.js';
import { serviceUnavailable } from '../lib/errors.js';

/** Presigned URLs (PUT and GET) are valid for 1 hour (SPEC §4). */
const PRESIGN_TTL_SECONDS = 3600;

export const storageNotConfigured = () =>
  serviceUnavailable(
    'storage_not_configured',
    'Storage media non configurato: impostare le variabili S3_* su Render',
  );

export interface StorageService {
  /** True when all S3_* env vars are set. Routes check this per request (503 otherwise). */
  isConfigured(): boolean;
  /** Presigned PUT URL bound to the given Content-Type. */
  presignPut(key: string, mime: string): Promise<string>;
  /** Presigned GET URL for display/download. */
  presignGet(key: string): Promise<string>;
  /** Deletes the object; callers treat failures as best-effort. */
  deleteObject(key: string): Promise<void>;
}

export function createStorageService(): StorageService {
  let client: S3Client | null = null;

  const isConfigured = (): boolean =>
    Boolean(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);

  const getClient = (): S3Client => {
    if (!isConfigured()) throw storageNotConfigured();
    client ??= new S3Client({
      region: 'auto',
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
    });
    return client;
  };

  return {
    isConfigured,

    async presignPut(key: string, mime: string) {
      const command = new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: mime });
      return getSignedUrl(getClient(), command, { expiresIn: PRESIGN_TTL_SECONDS });
    },

    async presignGet(key: string) {
      const command = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
      return getSignedUrl(getClient(), command, { expiresIn: PRESIGN_TTL_SECONDS });
    },

    async deleteObject(key: string) {
      await getClient().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    },
  };
}
