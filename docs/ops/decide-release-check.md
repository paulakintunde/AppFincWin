# Decide release check (D-29, D-30, D-34)

Only named tester accounts may have Decide v3 (`profiles.decide_v3`) or shadow runs (`profiles.decide_shadow`) on. Demo and App Store reviewer accounts are never on.

## The store-build switch

05.5 deleted the old engine. `DECIDE_V3=false` is no longer a fallback: the switch no longer exists and there is no older Decide to fall back to. A store build is gated by `DECIDE_OPEN` alone, with the 05.4 safety patch in the build. `npm run check:decide-switch` fails if the old switch name comes back in `src`.

## The two lists

- `docs/ops/decide-testers.json`: the owner's accounts and each named tester. Account IDs (UUIDs) only, with role `owner` or `tester`. No names, no emails.
- `docs/ops/decide-never-on.json`: demo and App Store reviewer account IDs.
- An ID may not be on both lists. Both files need the owner's review (`.github/CODEOWNERS`, protected `main`).

## Check 1: every pull request (static)

CI runs `npm run check:decide-switch -- --static`. It confirms both files parse, IDs are UUIDs, there are no duplicates, roles are valid and the lists do not overlap.

## Check 2: before every release (live, read-only)

Run the **Release gate** workflow: GitHub -> Actions -> Release gate -> Run workflow. It also runs daily. It asks production, read-only, which accounts have a switch on. It fails if any account outside the tester list has one on, or any never-on account has one on. The log shows only counts and the first 8 characters of each offending ID.

It fails closed: if `SUPABASE_READONLY_TOKEN` or `SUPABASE_PROD_PROJECT_REF` is missing, the run fails.

See it green before any `eas build --profile production` or store submission (see `ota-policy.md` and `eas-environments.md`).

## Add a tester

1. Open a PR that adds `{ "id": "<uuid>", "role": "tester" }` to `decide-testers.json`.
2. The owner reviews and merges.
3. Only then set the flag for that account, using the Supabase CLI or Management API (never the MCP connector).

## If the gate fails

1. Take the 8-character prefix from the log and find the account in Supabase (Authentication -> Users).
2. Turn `decide_v3` and `decide_shadow` off for that account.
3. Work out how it got on. Re-run the gate until green.
4. Do not release while it is red.

## Token

`SUPABASE_READONLY_TOKEN` is a Supabase access token stored only as a GitHub Actions secret. The script always sends `read_only: true`. Rotate it before its expiry date.

## Switch Decide off for everyone, and back on (APP-21, "off fast")

`app_config.decide_off` is read by every app at launch and when it returns to the foreground (at most every 15 minutes). When it is `'true'`, the Decide tab shows "Decide is paused" ("Your records are safe. Answers come back soon.") and the Decide routes and reminder taps close. No app release is needed. A failed or slow read never turns Decide off: the app keeps the last value it saw, and an app that has never read the value treats Decide as on.

Pause (run from `C:\dev\fincwin`, where the FincWin token lives; export the FincWin `SUPABASE_ACCESS_TOKEN` for this command only and never print it):

1. Management API database query, project `Fincwin United`: `update public.app_config set value = 'true', updated_at = now() where key = 'decide_off';`
2. Confirm: `select value from public.app_config where key = 'decide_off';` returns `true`. Phones pick it up within about 15 minutes of coming to the foreground, or at the next launch.

Resume: the same update with `'false'`. Never use the Supabase MCP connector (it points at a different account).

The value is `'false'` by default (migration `20261125000300_app_config_decide_off.sql`). Clients can read the row and cannot write it (pgTAP 113).

## Turn Decide on slowly (per account)

"On slowly" is the per-account switch, not `decide_off`. Add the account to `decide-testers.json` by PR (see Add a tester), then set `profiles.decide_v3`. Tester accounts also see "Build {version (update id)}" under the legal footer of every answer, so a report can name the build. Non-tester accounts never see it.
