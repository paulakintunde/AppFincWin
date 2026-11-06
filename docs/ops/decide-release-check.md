# Decide release check (D-29, D-30, D-34)

Only named tester accounts may have Decide v3 (`profiles.decide_v3`) or shadow runs (`profiles.decide_shadow`) on. Demo and App Store reviewer accounts are never on.

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
