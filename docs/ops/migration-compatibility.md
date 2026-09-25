# Migration compatibility (FND-10 / D-27)

There is one Supabase project, `Fincwin United`, and it is production (see
`CLAUDE.md` "Supabase access"). Users cannot be forced to update, so a
migration that lands in `main` must stay readable and writable by whatever
app version is still installed on a device until that device updates. This
gate enforces that at CI, backed by a PR checklist for what a linter can't
see.

## The rule set

`.squawk.toml` runs [squawk](https://squawkhq.com/docs/rules) (2.66.0)
against every file in `supabase/migrations/` with only nine rules kept:

- dropping a column, table or the database
- renaming a column or table
- changing a column's type
- adding a required or not-nullable field
- `truncate ... cascade`

Every other squawk rule (statement/lock timeouts, concurrent index
creation, style preferences like `prefer-text-field`) is excluded. Those
rules matter for high-traffic multi-replica Postgres, which this project
is not; several of them would also flag migrations that already shipped
safely in Phase 0/1. If that changes later, revisit `.squawk.toml`.

## The `contract-ok` marker

A destructive migration is still sometimes correct -- for example, dropping
a column that no supported app version reads anymore. To ship one:

1. In an **earlier** migration file, raise the floor:
   ```sql
   update public.app_config set value = '1.2.0' where key = 'min_supported_version';
   ```
   (Or the seeding `insert` in the very first `app_config` migration.)

   The gate recognises a floor bump only as a whole, real statement in
   exactly this `update` form, or as
   `insert into public.app_config (key, value) values ('min_supported_version', 'X.Y.Z')`
   optionally followed by `on conflict (key) do update set value = excluded.value`.
   Comments are stripped first, so a commented-out bump does not count.
   `on conflict do nothing` (a no-op once the row exists), a bump inside a
   `do $$ ... $$` block, or an `update` with any extra predicate does not
   raise the floor either; the gate prints a warning for any statement that
   mentions `min_supported_version` without being a recognised bump.
2. In the migration that makes the destructive change, mark it -- **in this
   order**, `contract-ok` above `squawk-ignore`:
   ```sql
   -- contract-ok: min_version >= 1.2.0
   -- squawk-ignore ban-drop-column
   alter table public.transactions drop column legacy_note;
   ```

The ordering matters for squawk itself: `squawk-ignore` only suppresses a
warning when it is the comment line **directly above** the statement it
covers. `contract-ok` goes above it so the ignore stays adjacent to the
statement.

`scripts/check-migration-compat.mjs` then checks, independent of squawk,
that every `squawk-ignore` of a kept rule has a `contract-ok` marker in the
same file, and that the required version is already covered by
`app_config.min_supported_version` as raised by every **earlier** file (by
filename order) -- never the same file's own bump. The floor bump and the
destructive change it authorizes are always two separate migrations, bump
first. This is expand/contract: expand (raise the floor, wait for old
clients to update) before contract (make the breaking change).

## Local commands

```bash
npm run lint:migrations    # squawk + the contract-ok/floor check
npm run verify:migrations  # self-test: proves the gate fails on probes and passes on a correctly marked one
npm run check:money-mirror # SQL/TypeScript rounding mirror still matches the shared fixture (D-16)
```

`lint:migrations` calls only `scripts/check-migration-compat.mjs`, which
resolves the migration file list itself and spawns squawk with explicit
paths -- `npm run lint:migrations -- 'supabase/migrations/*.sql'` style
glob expansion is not shell-independent on Windows, so the script never
relies on it.

## CI

The `checks` job runs all three commands after `npm run verify:gates`. A
failing `lint:migrations` or `verify:migrations` step blocks the PR the
same way a failing test does.

## Not caught by the linter

Squawk parses SQL syntax; it cannot see RLS policy changes, grant changes,
or anything evaluated at query time rather than DDL time. The PR template's
migration checklist covers that gap by asking the author to confirm it by
hand.
