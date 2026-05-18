## Summary

<!-- One or two sentences. Why this change. -->

## Architectural compliance checklist

- [ ] No frontend business calculations introduced
- [ ] Authorization goes through the centralized resolver (`packages/auth`)
- [ ] New IDs are ULID (`char(26)`)
- [ ] New monetary columns are `numeric(18,4)`
- [ ] New timestamps are `timestamptz` (UTC)
- [ ] New tables that are tenant-scoped have RLS enabled
- [ ] New tables follow Spec 3 standard column packs
- [ ] Migrations are idempotent (`CREATE … IF NOT EXISTS`)
- [ ] No secrets committed

## Test plan

- [ ] Local typecheck passes
- [ ] Local lint passes
- [ ] Manual verification steps documented if UI changed
