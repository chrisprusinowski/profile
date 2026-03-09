#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../infra/postgres/migrations');

const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://app_user:app_password@localhost:5432/app_db';

async function getMigrationFiles() {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`No migration files found in ${migrationsDir}`);
  }

  return files.map((f) => path.join(migrationsDir, f));
}

async function run() {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();

  try {
    const migrationFiles = await getMigrationFiles();

    for (const filePath of migrationFiles) {
      const sql = await readFile(filePath, 'utf8');
      console.log(`Applying ${path.relative(path.resolve(__dirname, '..'), filePath)}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('Migrations completed successfully.');
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  if (err && typeof err === 'object') {
  const maybe = err;
  const message = maybe.message ? String(maybe.message) : JSON.stringify(maybe);
  const code = maybe.code ? ` (code: ${maybe.code})` : '';
  console.error(`Migration failed${code}: ${message}`);
} else {
  console.error('Migration failed:', err);
}
  process.exit(1);
});
