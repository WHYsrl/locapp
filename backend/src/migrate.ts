import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';
import { env } from './config.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

async function migrate(): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.log('No migration files found in drizzle/');
    return;
  }

  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => undefined, connect_timeout: 10 });
  try {
    await sql`CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;
    const appliedRows = await sql`SELECT name FROM _migrations`;
    const applied = new Set(appliedRows.map((r) => r['name'] as string));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip    ${file} (already applied)`);
        continue;
      }
      const content = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`apply   ${file}`);
      await sql.unsafe(content);
      await sql`INSERT INTO _migrations (name) VALUES (${file})`;
    }
    console.log('Migrations complete.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

migrate().catch((err) => {
  if (env.SKIP_MIGRATE_ON_FAIL) {
    console.warn('WARNING: migration failed but SKIP_MIGRATE_ON_FAIL=true, continuing.');
    console.warn(err instanceof Error ? err.message : String(err));
    process.exit(0);
  }
  console.error('Migration failed:', err);
  process.exit(1);
});
