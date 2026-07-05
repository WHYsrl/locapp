import { env } from './config.js';
import { buildApp } from './app.js';
import { getDb } from './db/client.js';
import { createRepos } from './db/repos/index.js';
import { createAiService } from './ai/service.js';
import { createStorageService } from './storage/s3.js';

async function main(): Promise<void> {
  const app = await buildApp({
    repos: createRepos(getDb()),
    ai: createAiService(env.ANTHROPIC_API_KEY),
    storage: createStorageService(),
    jwtSecret: env.JWT_SECRET,
  });

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
