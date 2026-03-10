#!/usr/bin/env node
/* global process, console */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const migrationsDir = path.resolve(repoRoot, 'infra/postgres/migrations');
const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://app_user:app_password@localhost:5432/app_db';

function formatError(err) {
  if (err && typeof err === 'object') {
    const message = err.message ? String(err.message) : JSON.stringify(err);
    const code = err.code ? ` (code: ${err.code})` : '';
    return `Migration failed${code}: ${message}`;
  }

  return `Migration failed: ${String(err)}`;
}

async function getMigrationFiles() {
  const files = (await readdir(migrationsDir))
    .filter((name) => /^\d+.*\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'));

  if (files.length === 0) {
    throw new Error(`No migration files found in ${migrationsDir}`);
  }

  return files;
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((row) => row.filename));
}

async function run() {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();

  try {
    await ensureMigrationsTable(client);

    const migrationFiles = await getMigrationFiles();
    const appliedMigrations = await getAppliedMigrations(client);

    let ranAny = false;

    for (const fileName of migrationFiles) {
      if (appliedMigrations.has(fileName)) {
        console.log(`Skipping ${fileName} (already applied)`);
        continue;
      }

      const filePath = path.join(migrationsDir, fileName);
      const sql = await readFile(filePath, 'utf8');
      const displayPath = path.relative(repoRoot, filePath);
      console.log(`Applying ${displayPath}`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [fileName]);
        await client.query('COMMIT');
        ranAny = true;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    if (!ranAny) {
      console.log('No pending migrations. Database is up to date.');
      return;
    }

    console.log('Migrations completed successfully.');
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(formatError(err));
  process.exit(1);
});
