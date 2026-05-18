/**
 * Bootstrap CLI — create the first internal_manager user.
 *
 * Usage:
 *   pnpm --filter @xb/api seed:admin -- --email you@example.com --password '<strong>'
 *
 * Idempotent: if the email already exists, prints the existing user info and exits.
 *
 * Creates two rows:
 *   - xb_core.actors (actor_kind='internal_user', organization_id=NULL)
 *   - xb_core.users  (user_kind='internal', internal_user_role='manager')
 *
 * The created user can then sign in via /v1/auth/sign-in and (because is_internal_manager
 * is true) has the RLS bypass and resolver bypass for support operations.
 */
import 'dotenv/config';
import pg from 'pg';
import { ulid } from 'ulid';
import { loadApiConfig } from '@xb/config/api';
import { hashPassword } from '../lib/password.js';

function parseArgs(argv: string[]): { email: string; password: string; displayName: string } {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a?.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        args.set(key, val);
        i++;
      } else {
        args.set(key, 'true');
      }
    }
  }
  const email = args.get('email');
  const password = args.get('password');
  const displayName = args.get('name') ?? email?.split('@')[0] ?? 'Admin';
  if (!email || !password) {
    console.error('usage: seed:admin --email <email> --password <password> [--name <display>]');
    process.exit(2);
  }
  return { email: email.toLowerCase(), password, displayName };
}

async function main(): Promise<void> {
  const { email, password, displayName } = parseArgs(process.argv);
  const config = loadApiConfig();
  const client = new pg.Client({ connectionString: config.database.url, application_name: 'xb-seed-admin' });
  await client.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query<{ id: string; actor_id: string; email: string; user_status: string }>(
      `SELECT id, actor_id, email, user_status
         FROM xb_core.users
        WHERE lower(email) = $1
          AND user_kind = 'internal'
          AND deleted_at IS NULL`,
      [email],
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0]!;
      console.info(
        `internal user already exists: id=${row.id} actor=${row.actor_id} status=${row.user_status} email=${row.email}`,
      );
      await client.query('COMMIT');
      return;
    }

    // Set audit context so the audit trigger has actor info.
    // Bootstrap uses a synthetic system actor id (the user being created).
    const actorId = ulid();
    const userId = ulid();
    const passwordHash = await hashPassword(password);

    await client.query("SELECT set_config('app.current_actor_id', $1, true)", [actorId]);
    await client.query("SELECT set_config('app.current_actor_kind', 'system', true)");
    await client.query("SELECT set_config('app.is_internal_manager', 'true', true)");
    await client.query("SELECT set_config('app.current_request_id', $1, true)", [ulid()]);

    await client.query(
      `INSERT INTO xb_core.actors
         (id, organization_id, actor_kind, display_name, actor_status)
       VALUES ($1, NULL, 'internal_user', $2, 'active')`,
      [actorId, displayName],
    );

    await client.query(
      `INSERT INTO xb_core.users
         (id, actor_id, user_kind, organization_id, username, display_name, email,
          password_hash, internal_user_role, user_status, password_changed_at, created_by_actor_id)
       VALUES ($1, $2, 'internal', NULL, $3, $4, $5,
               $6, 'manager', 'active', now(), $2)`,
      [userId, actorId, email, displayName, email, passwordHash],
    );

    await client.query('COMMIT');
    console.info(
      `✓ created internal_manager user id=${userId} actor=${actorId} email=${email} display='${displayName}'`,
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
