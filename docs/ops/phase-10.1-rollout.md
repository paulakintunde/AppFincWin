# Phase 10.1 production rollout (plan 10.1-28)

Production is the only Supabase project (`Fincwin United`, ref `cohmcbdfgqmiwykztrdg`). Every step below writes to it unless marked read-only.

Rules (CLAUDE.md "Supabase access"):
- Run remote commands from `C:/dev/fincwin`, or from the temporary push worktree described in "Ordering with Phase 10". Only `C:/dev/fincwin` has the `supabase/.temp` link state that `--remote` reads.
- Export `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROD_PROJECT_REF` from `C:/dev/fincwin/.env.local` inside each command. Never echo them. The shell may already hold another account's token, which fails with 403 "missing database_write".
- Never use the Supabase MCP connector. It is signed in to a different account.
- Supabase CLI 3: `--remote` means production; a command with no target runs against the local stack. Commands that change production need `--yes` when nobody is at the prompt.
- Stop at the first failure. Never improvise schema changes on production.

Owner approval: 2026-11-26, "Yes, after Phase 10" (relayed by the orchestrator from an AskUserQuestion popup).

## Ordering with Phase 10

Phase 10.1 is built on top of Phase 10. Its branch (`feat/10.1-build`) carries the Phase 10 migrations `20261126000100`..`20261126000800` as well as its own five.

1. **Phase 10 goes first.** Phase 10's rollout (plan 10-29, `docs/ops/phase-10-rollout.md`) must have finished its schema push before step 2 here. Check it (read-only), from `C:/dev/fincwin`:
   ```bash
   cd C:/dev/fincwin && set -a && . ./.env.local && set +a && npx supabase migration list --remote
   ```
   Every row from `20261126000100` to `20261126000800` must show a Remote value. If any is missing, stop and finish 10-29 first. Otherwise `db push` here would apply the Phase 10 migrations as a side effect, outside Phase 10's checklist.
2. **Phase 10 functions first, then 10.1's.** 10-29 deploys `delete-account` from Phase 10's code. Step 4 here redeploys it from 10.1's code, which is Phase 10's version plus the receipt clean-up. Do step 4 only after 10-29's function step, or 10-29 would overwrite it with the older version.
3. **The push checkout must contain the 10.1 files.** `supabase db push --remote` applies whatever is in the local `supabase/migrations` folder, and `functions deploy` reads the function code and `supabase/config.toml` from the checkout (the `[functions.purge-receipts] verify_jwt = false` entry lives there). `C:/dev/fincwin` is shared with other sessions, so its branch is not switched as part of this plan. Pick one:
   - **A. Preferred: merge first.** Merge the Phase 10.1 PR into `main` by hand when CI is green. Then, only when no other session is using `C:/dev/fincwin`, run `git -C C:/dev/fincwin switch main && git -C C:/dev/fincwin pull --ff-only`. Confirm with `ls C:/dev/fincwin/supabase/migrations | grep 2026112700` (five files).
   - **B. Before the merge: a temporary detached worktree with the link state.** This leaves `C:/dev/fincwin`'s branch untouched:
     ```bash
     git -C C:/dev/fincwin worktree add --detach C:/dev/fincwin-101-push feat/10.1-build
     mkdir -p C:/dev/fincwin-101-push/supabase/.temp
     cp -r C:/dev/fincwin/supabase/.temp/. C:/dev/fincwin-101-push/supabase/.temp/
     ```
     In that worktree, every command reads the secrets from the main checkout's env file in place. Never copy `.env.local`. For the preflight, set `SUPABASE_PREFLIGHT_ENV_FILE=C:/dev/fincwin/.env.local`. Call the CLI by its full path, `C:/dev/fincwin/node_modules/.bin/supabase`, because the new worktree has no `node_modules`. Step 2 then becomes:
     ```bash
     cd C:/dev/fincwin-101-push && set -a && . C:/dev/fincwin/.env.local && set +a \
       && SUPABASE_PREFLIGHT_ENV_FILE=C:/dev/fincwin/.env.local node scripts/supabase-preflight.mjs \
       && C:/dev/fincwin/node_modules/.bin/supabase db push --remote --yes
     ```
     Steps 3 to 5 run the same way, from `C:/dev/fincwin-101-push`. Afterwards, remove the worktree with `git -C C:/dev/fincwin worktree remove C:/dev/fincwin-101-push`. The copied `.temp` is gitignored and goes with it. Never run `git clean` there.
   Before step 2, either way, run `git -C <push checkout> log -1 --oneline` and record the commit in the Result column.

## Checklist

| # | Step | Command / where | Result |
| --- | --- | --- | --- |
| 0 | Local gate | In `C:/dev/fincwin-101`: `npx supabase db reset`, `npx supabase test db`, `npm run lint:migrations`, `npm run test:deno`, `npx jest supabase/functions/purge-receipts supabase/functions/delete-account --coverage=false` | PASS 2026-11-26: reset applied all migrations through `20261127000500`; pgTAP 142 files / 3766 tests, 0 failed (131-136 ok); lint OK (130 files, floor 0.2.0); deno 116 passed; jest 3 suites / 28 tests |
| 1 | Phase 10 on production; push checkout holds the 10.1 files | "Ordering with Phase 10", points 1 and 3 (A or B) | PASS 2026-11-26: option B, worktree C:/dev/fincwin-101-push at 490a467d (feat/10.1-build after merging main with #193). `migration list --linked` shows 20261126000100..0800 on remote and 20261127000100..0500 local only. The C:/dev/fincwin CLI is v2.117.0, so use `--linked`, not `--remote` |
| 2 | Schema push | From the push checkout: `set -a && . C:/dev/fincwin/.env.local && set +a && npm run supabase:db:push -- --yes` (runs the preflight, then `supabase db push --remote --yes`). Expected: five migrations applied, `20261127000100_category_parts`, `000200_receipts`, `000300_category_parts_client_reads`, `000400_split_by_item`, `000500_series_category_parts` | PASS 2026-11-26 (orchestrator, owner re-approved after the agent run was blocked): preflight OK; `db push --linked --yes` applied the five 10.1 migrations |
| 3 | Migrations listed (read-only) | `npx supabase migration list --remote` shows `20261127000100`..`20261127000500` with Local and Remote both filled | PASS: `migration list --linked` shows 20261127000100..000500 local and remote |
| 4 | Functions deploy | `npx supabase functions deploy purge-receipts --no-verify-jwt --yes`, then `npx supabase functions deploy delete-account --yes` (after 10-29's function step) | PASS: purge-receipts (--no-verify-jwt) and delete-account deployed |
| 5 | Function secret | `RECEIPT_PURGE_SECRET`, set with `npx supabase secrets set ... --yes`. Recipe below; the value is never printed | PASS: RECEIPT_PURGE_SECRET set; value never printed |
| 6 | Vault | `receipt_purge_url` = `https://cohmcbdfgqmiwykztrdg.supabase.co/functions/v1/purge-receipts` and `receipt_purge_secret` = the same value as step 5, through the Management API query endpoint. Recipe below | PASS: vault 201; `vault.secrets` has receipt_purge_secret and receipt_purge_url |
| 7 | Cron job (read-only) | Management API query `select jobname, schedule, active from cron.job where jobname = 'receipts-purge-every-5-min'` returns one row, `*/5 * * * *`, active | PASS: receipts-purge-every-5-min, */5 * * * *, active |
| 8 | Purge smoke test | POST `https://cohmcbdfgqmiwykztrdg.supabase.co/functions/v1/purge-receipts` with header `x-receipt-purge-secret` returns 200 and `{"ok":true,"removed":0,"batches":...}`; without the header it returns 403 `{"ok":false,"error":"forbidden"}`. Then check `select status, return_message from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'receipts-purge-every-5-min') order by start_time desc limit 3` after the next 5-minute tick | PASS: with secret 200 {"ok":true,"removed":0,"batches":0}; without 403 {"ok":false,"error":"forbidden"} |
| 9 | Bucket (read-only) | `select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'receipts'` returns `public = false`, `5242880`, JPEG/PNG/WebP/PDF | PASS: receipts bucket public=false, 5242880, jpeg/png/webp/pdf |

## Secret recipe (steps 5 and 6)

The secret is generated inside the command, kept in one shell variable, and used for both the function secret and the Vault entry, so the two always match. Nothing prints it. Run in Git Bash from the push checkout:

```bash
set -a && . C:/dev/fincwin/.env.local && set +a
RPS=$(node -e "process.stdout.write(require('crypto').randomBytes(36).toString('base64url'))")   # 48 chars, URL-safe
npx supabase secrets set RECEIPT_PURGE_SECRET="$RPS" --yes >/dev/null && echo "function secret set"
RPS="$RPS" node -e '
  const s = process.env.RPS, url = "https://cohmcbdfgqmiwykztrdg.supabase.co/functions/v1/purge-receipts";
  const lit = (v) => "$v$" + v + "$v$";
  const up = (name, val) => `do $b$ declare i uuid; begin
      select id into i from vault.secrets where name = ${lit(name)};
      if i is null then perform vault.create_secret(${lit(val)}, ${lit(name)});
      else perform vault.update_secret(i, ${lit(val)}); end if; end $b$;`;
  fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROD_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: up("receipt_purge_url", url) + up("receipt_purge_secret", s) }),
  }).then(r => console.log("vault", r.status));'
unset RPS
```

Expected output: `function secret set` and `vault 201` (or 200). Check the names without the values (read-only): `select name from vault.secrets where name like 'receipt_purge_%'` should return two rows.

Smoke test (step 8), reading the secret back from Vault so it is never typed or shown:

```bash
set -a && . C:/dev/fincwin/.env.local && set +a
node -e '
  const ref = process.env.SUPABASE_PROD_PROJECT_REF, h = { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" };
  const fn = `https://${ref}.supabase.co/functions/v1/purge-receipts`;
  (async () => {
    const q = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: "POST", headers: h,
      body: JSON.stringify({ query: "select decrypted_secret as s from vault.decrypted_secrets where name = $$receipt_purge_secret$$" }) });
    const [{ s }] = await q.json();
    const a = await fetch(fn, { method: "POST", headers: { "x-receipt-purge-secret": s, "Content-Type": "application/json" }, body: "{}" });
    console.log("with secret", a.status, await a.text());
    const b = await fetch(fn, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    console.log("without secret", b.status, await b.text());
  })();'
```

## Notes for the owner

- All five migrations add to the schema. Nothing is dropped, renamed or retyped. `transactions` gains two nullable `jsonb` columns (`category_parts`, `item_split`) and `recurring_series` gains one (`category_parts`). Adding a nullable column with no default only changes the table definition and does not rewrite rows, so the table lock is brief. The trigger changes on `transactions`, `categories` and `recurring_series` also take brief locks. No migration contains a top-level `UPDATE`/`DELETE` or a backfill; every data change is inside a function body.
- `20261127000300` changes privileges. It adds `grant insert (category_parts) on public.transactions to authenticated`. It also recreates the `transactions_active` view (`create or replace ... select *`), which adds the two new columns at the end, and grants select on it again. Postgres only allows this when production's `transactions` has the same column order as the migrations, which is true unless a column was added outside a migration. If step 2 fails at this file with "cannot change name of view column", stop there.
- `20261127000200` creates the private `receipts` bucket (it updates the bucket if it already exists), two storage policies (read and insert, no update or delete), adds `transaction_receipts` to the realtime publication, and schedules `receipts-purge-every-5-min`.
- Between step 2 and step 6, the cron job runs every 5 minutes with no Vault URL yet, so each run fails harmlessly with `net.http_post` given a null URL. It recovers by itself once step 6 is done. Do steps 4 to 6 straight after step 2.
- Before step 4, production's `delete-account` does not delete receipt files. That is harmless while no build that uploads receipts has shipped.
