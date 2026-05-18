# Security

## Reporting a vulnerability

Please email security@<your-domain> with details. Do not file public GitHub issues for security reports.

## Secrets

- Never commit secrets. `.env*` files (except `.env.example`) are ignored by git.
- Production secrets live in **Google Secret Manager** and are mounted as env vars at Cloud Run runtime.
- Local dev secrets live in untracked `.env.local` / `apps/*/.env`.

## Tenancy

- Postgres Row Level Security (RLS) is enforced on every tenant-scoped table.
- Application code MUST set the connection context (`app.current_organization_id`, etc.) before queries via `app.withConnection(actor, work)`.
- The only RLS bypass is `app.is_internal_manager = 'true'`, intended for support operations. Every bypass produces an audit entry.

## Authorization

- All authorization decisions go through the resolver in `packages/auth`.
- The frontend may hide UI based on resolver output but does not control access — the backend re-checks every action.

## Audit

- `xb_audit.audit_log` is append-only (RLS denies UPDATE/DELETE) and partitioned by month.
- Hot partitions (~30 days) live in Postgres; older ones are exported to BigQuery and detached.

## Sessions & JWTs

- JWT signing secret rotates via Secret Manager. Rotation invalidates all sessions.
- Cookies: `HttpOnly`, `Secure` in production, `SameSite=Lax`.

## Dependencies

- Dependabot is configured for `npm` (weekly) and `github-actions` (monthly).
- Security advisories are reviewed before merging.
