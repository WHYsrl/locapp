import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config.js';
import { serviceUnavailable } from '../lib/errors.js';

export interface StorageService {
  presignUpload(key: string, mime: string): Promise<{ upload_url: string; public_url: string; key: string }>;
}

export function createStorageService(): StorageService {
  let client: S3Client | null = null;

  const getClient = (): S3Client => {
    if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw serviceUnavailable('STORAGE_NOT_CONFIGURED', 'S3 storage is not configured');
    }
    client ??= new S3Client({
      region: 'auto',
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
    return client;
  };

  return {
    async presignUpload(key: string, mime: string) {
      const s3 = getClient();
      const command = new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: mime });
      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
      return {
        upload_url: uploadUrl,
        public_url: `${env.S3_ENDPOINT!.replace(/\/$/, '')}/${env.S3_BUCKET}/${key}`,
        key,
      };
    },
  };
}
