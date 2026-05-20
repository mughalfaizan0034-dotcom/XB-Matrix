/**
 * Recovery CLI — list internal managers and/or reset a user's password.
 *
 * Use this when you're locked out of your own account, after the auth
 * pivot from email → username, or any time you need to forcibly set a
 * password on an existing user.
 *
 * USAGE
 *
 *   List every internal manager (so you can see which username to target):
 *     pnpm --filter @xb/api reset:admin -- --list
 *
 *   Reset a specific user's password (by username):
 *     pnpm --filter @xb/api reset:admin -- --username faizan --password 'NewSecret123!'
 *
 *   Promote an existing user to internal_manager AND reset password:
 *     pnpm --filter @xb/api reset:admin -- --username faizan --password '…' --make-manager
 *
 * Connects via DATABASE_URL (same env the app uses). For Cloud SQL,
 * run the Cloud SQL Auth Proxy first and point DATABASE_URL at it.
 *
 * Safe defaults: this CLI only updates existing rows; it never creates
 * new users. Use seed-admin for first-user provisioning.
 */
import 'dotenv/config';
import pg from 'pg';
import { loadApiConfig } from '@xb/config/api';
import { hashPassword } from '../lib/password.js';

interface Args {
  list: boolean;
  username: string | null;
  password: string | null;
  makeManager: boolean;
}

function parseArgs(argv: string[]): Args {
  const args = new Map<string, string>();
  let listFlag = false;
  let makeManagerFlag = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') {
      listFlag = true;
      continue;
    }
    if (a === '--make-manager') {
      makeManagerFlag = true;
      continue;
    }
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
  return {
    list: listFlag,
    username: args.get('username') ?? null,
    password: args.get('password') ?? null,
    makeManager: makeManagerFlag,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!args.list && (!args.username || !args.password)) {
    console.error('usage:');
    console.error('  reset:admin -- --list');
    console.error('  reset:admin -- --username <name> --password <newpass> [--make-manager]');
    process.exit(2);
  }

  const config = loadApiConfig();
  const client = new pg.Client({
    connectionString: config.database.url,
    application_name: 'xb-reset-admin',
  });
  await client.connect();

  try {
    if (args.list) {
      const { rows } = await client.query<{
        username: string;
        display_name: string;
        user_status: string;
        last_login_at: Date | null;
        created_at: Date;
      }>(
        `SELECT username, display_name, user_status, last_login_at, created_at
           FROM xb_core.users
          WHERE user_kind = 'internal'
            AND internal_user_role = 'manager'
            AND deleted_at IS NULL
          ORDER BY created_at ASC`,
      );
      if (rows.length === 0) {
        console.info('No internal managers exist yet. Use seed-admin to create one.');
        return;
      }
      console.info(`Internal managers (${rows.length}):`);
      for (const r of rows) {
        const last = r.last_login_at ? r.last_login_at.toISOString() : 'never';
        console.info(
          `  ${r.username.padEnd(40)}  ${r.display_name.padEnd(30)}  status=${r.user_status.padEnd(12)} last=${last}`,
        );
      }
      return;
    }

    if (args.password!.length < 12) {
      console.error('Password must be at least 12 characters.');
      process.exit(2);
    }

    const username = args.username!.toLowerCase();
    const { rows: existing } = await client.query<{
      id: string;
      actor_id: string;
      user_kind: 'internal' | 'organization';
      internal_user_role: string | null;
      user_status: string;
    }>(
      `SELECT id, actor_id, user_kind, internal_user_role, user_status
         FROM xb_core.users
        WHERE lower(username) = $1 AND deleted_at IS NULL`,
      [username],
    );
    const user = existing[0];
    if (!user) {
      console.error(`No user with username "${username}". Use --list to see existing users.`);
      process.exit(1);
    }

    const hash = await hashPassword(args.password!);

    // Set audit context so the audit trigger captures who made the change.
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_actor_id', $1, true)", [user.actor_id]);
    await client.query("SELECT set_config('app.current_actor_kind', 'system', true)");
    await client.query("SELECT set_config('app.is_internal_manager', 'true', true)");

    const updates: string[] = ['password_hash = $1', 'password_changed_at = now()'];
    const params: unknown[] = [hash];
    if (args.makeManager) {
      updates.push(
        `user_kind = 'internal'`,
        `internal_user_role = 'manager'`,
        `organization_user_role = NULL`,
        `organization_id = NULL`,
      );
    }
    if (user.user_status !== 'active') {
      updates.push(`user_status = 'active'`);
    }
    params.push(user.id);

    await client.query(
      `UPDATE xb_core.users
          SET ${updates.join(', ')}
        WHERE id = $${params.length} AND deleted_at IS NULL`,
      params,
    );

    // Revoke every live session for this user so any stale cookies
    // are useless — the new password fully reclaims the account.
    const sessionResult = await client.query(
      `UPDATE xb_core.sessions
          SET revoked_at = now(), revoke_reason = 'admin_revoke'
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [user.id],
    );

    await client.query('COMMIT');

    console.info(
      `✓ password reset for "${username}" (id=${user.id})${args.makeManager ? ' [promoted to internal_manager]' : ''}.`,
    );
    console.info(`  Revoked ${sessionResult.rowCount ?? 0} live session(s).`);
    console.info(`  Sign in at /sign-in with:`);
    console.info(`    Username: ${username}`);
    console.info(`    Password: <the value you just set>`);
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
