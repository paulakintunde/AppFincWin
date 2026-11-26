# Phase 10 production rollout (plan 10-29)

Production is the only Supabase project (`Fincwin United`). Every command below writes to it unless marked read-only.

Rules (CLAUDE.md "Supabase access"):
- Run remote commands from `C:/dev/fincwin` on `main`. Only that checkout has the `supabase/.temp` link state.
- Export `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROD_PROJECT_REF` from `C:/dev/fincwin/.env.local` inside each command. Never echo them. The shell may hold another account's token.
- Never use the Supabase MCP connector.
- Stop at the first failure. Never improvise schema changes on production.

Owner approval: 2026-11-26, "Yes, start 10-29", given after setup (10-01) closed.

| # | Step | Command / where | Result |
| --- | --- | --- | --- |
| 0 | Local gate | `supabase db reset`, `supabase test db`, `npm run lint:migrations`, `npm run verify:migrations`, `npm run test:deno` in the phase worktree | PASS 2026-11-26: pgTAP 136 files / 3612 tests; lint and gate OK; deno 110 passed |
| 1 | Phase 10 PR merged to main; `C:/dev/fincwin` on main | GitHub PR, merged by hand when CI is green | PASS 2026-11-26: PR #193 merged (504ffc8e); main checkout fast-forwarded |
| 2 | Schema push | `npm run supabase:db:push -- --yes` (preflight, then `supabase db push --remote`) | PASS 2026-11-26: 9 migrations applied |
| 3 | Migrations listed (read-only) | `npx supabase migration list --remote` shows 20261126000100..0800 | PASS 2026-11-26: 20261126000100..0800 listed on remote |
| 4 | Functions deploy | `npx supabase functions deploy <name> --yes` for alerts-deliver, reviewer-signin, delete-account, read-pdf-statement, resolve-rate, plan-refresh | PASS 2026-11-26: all 6 deployed |
| 5 | Function secrets | `npx supabase secrets set ALERTS_DELIVER_SECRET=<random 48> EXPO_ACCESS_TOKEN=<owner token> --yes`, values never echoed | PASS 2026-11-26: both set; temp env file deleted |
| 6 | Vault | Management API query: `vault.create_secret` (or `update_secret`) for `alerts_deliver_url` and `alerts_deliver_secret` | PASS 2026-11-26: both Vault secrets present |
| 7 | Auth config | Management API PATCH `/config/auth`: before-user-created hook on, email provider on, autoconfirm off | PASS 2026-11-26: hook on, email on, autoconfirm off, Google on. Note: Apple provider is off in production (needed before store submission) |
| 8 | Reviewer accounts | `node scripts/ops/create-reviewer-accounts.mjs` | PASS 2026-11-26: allowlist, users, link and reset all OK |
| 9 | Reviewer sign-in smoke | POST `reviewer-signin`: reviewer creds return 200; a random email returns 401 with the same body | PASS 2026-11-26: reviewer 200 with tokens; random email 401 `{"ok":false,"error":"invalid"}` |
| 10 | First backup | `gh workflow run backup.yml`, then a new object under `daily/` | PASS 2026-11-26: run 45806575260 (11 users). R2_ENDPOINT carried the bucket name, so the object landed under `fincwin-backups/daily/`; owner fixed the secret, rerun 45851263752 landed under `daily/` |
| 11 | Manual rehearsal (D-08) | `docs/ops/backup-restore.md` "Manual rehearsal"; delete the decrypted dump and temporary key afterwards | PASS 2026-11-26 (owner: "count it"): the CI restore of the real backup in step 12 counts as the rehearsal. No local decrypt, so no decrypted dump or key to clean up |
| 12 | Monthly check once | `gh workflow run restore-check.yml` concludes success | PASS 2026-11-26 on fix branch: run 45853146569, 89 tables, 11 users. Two fixes first: skip tables postgres cannot truncate (auth.schema_migrations); start production's auth version (v2.199.0) locally |
| 13 | Cron jobs (read-only) | `select jobname from cron.job`: alerts-deliver-minute, alerts-bills-due-hourly, alerts-purge-nightly, rate-limits-purge, deletion-log-prune, reviewer-reset-nightly | PASS 2026-11-26: all six present; alerts-deliver-minute returns 200 |
| 14 | Expo push security | Owner turns on "Enhanced security for push notifications" in the Expo project settings, after step 5 | PASS 2026-11-26: owner turned it on. A fake-token send cannot prove it (Expo rejects the token first); the first real push in 10-30 is the proof |
