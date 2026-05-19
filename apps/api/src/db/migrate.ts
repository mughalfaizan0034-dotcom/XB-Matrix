/**
 * Lightweight SQL migrations runner.
 *
 * - Reads `.sql` files from `<repo>/sql/migrations/` in lexical order.
 * - Tracks applied migrations in `public.schema_migrations`.
 * - Each migration file is wrapped in a single transaction.
 * - Down migrations live next to up with `.down.sql` suffix.
 *
 * Usage:
 *   pnpm db:migrate           # apply all pending
 *   pnpm db:rollback          # roll back the last applied
 *   pnpm db:status            # show applied/pending
 */
import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = resolve(__dirname, '../../../../sql/migrations');

interface MigrationFile {
  readonly version: string;
  readonly name: string;
  readonly upFile: string;
  readonly downFile: string | null;
}

async function listMigrations(): Promise<ReadonlyArray<MigrationFile>> {
  const entries = await readdir(SQL_DIR).catch(() => [] as string[]);
  const ups = entries.filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort();
  return ups.map((up) => {
    const base = up.replace(/\.sql$/, '');
    const match = base.match(/^(\d+)[_-](.+)$/);
    const version = match?.[1] ?? base;
    const name = match?.[2] ?? base;
    const downCandidate = `${base}.down.sql`;
    return {
      version,
      name,
      upFile: up,
      downFile: entries.includes(downCandidate) ? downCandidate : null,
    };
  });
}

async function ensureMigrationsTable(client: pg.Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version       varchar(40) PRIMARY KEY,
      name          varchar(200) NOT NULL,
      applied_at    timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function appliedVersions(client: pg.Client): Promise<Set<string>> {
  const { rows } = await client.query<{ version: string }>(
    'SELECT version FROM public.schema_migrations ORDER BY version ASC',
  );
  return new Set(rows.map((r) => r.version));
}

async function applyMigration(client: pg.Client, m: MigrationFile): Promise<void> {
  const sql = await readFile(join(SQL_DIR, m.upFile), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      'INSERT INTO public.schema_migrations (version, name) VALUES ($1, $2)',
      [m.version, m.name],
    );
    await client.query('COMMIT');
    console.info(`✓ ${m.version} ${m.name}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`✗ ${m.version} ${m.name}: ${(err as Error).message}`);
    throw err;
  }
}

async function rollbackMigration(client: pg.Client, m: MigrationFile): Promise<void> {
  if (!m.downFile) throw new Error(`no down migration for ${m.version}`);
  const sql = await readFile(join(SQL_DIR, m.downFile), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('DELETE FROM public.schema_migrations WHERE version = $1', [m.version]);
    await client.query('COMMIT');
    console.info(`↺ ${m.version} ${m.name}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`✗ rollback ${m.version}: ${(err as Error).message}`);
    throw err;
  }
}

async function main(): Promise<void> {
  const action = process.argv[2] ?? 'up';
  // Read DATABASE_URL directly instead of loadApiConfig — the migrate
  // runner is intentionally minimal and shouldn't require redis/jwt/auth
  // env vars that the full API config insists on. The CI deploy step
  // only provides DATABASE_URL (tunnelled through Cloud SQL Auth Proxy);
  // local dev still gets it via dotenv.
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required to run migrations. Set it in .env (local) or as a workflow env (CI).',
    );
  }
  const client = new Client({ connectionString: databaseUrl, application_name: 'xb-migrate' });
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    const all = await listMigrations();
    const applied = await appliedVersions(client);

    if (action === 'status') {
      console.info(`Migrations: ${all.length} total, ${applied.size} applied`);
      for (const m of all) {
        console.info(`${applied.has(m.version) ? '✓' : '·'} ${m.version} ${m.name}`);
      }
      return;
    }
    if (action === 'up') {
      const pending = all.filter((m) => !applied.has(m.version));
      if (pending.length === 0) {
        console.info('no pending migrations');
        return;
      }
      for (const m of pending) await applyMigration(client, m);
      return;
    }
    if (action === 'down') {
      const last = [...applied].sort().at(-1);
      if (!last) {
        console.info('no migrations applied');
        return;
      }
      const target = all.find((m) => m.version === last);
      if (!target) throw new Error(`applied version ${last} not found in migrations dir`);
      await rollbackMigration(client, target);
      return;
    }
    throw new Error(`unknown action: ${action}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
