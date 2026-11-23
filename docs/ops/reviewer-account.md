# Store reviewer account (ACC-11, D-26, D-30)

Apple and Google reviewers cannot use Apple or Google sign-in from a review device, so FincWin has a visible
"App review sign-in" link at the bottom of the signed-out screen. It opens an email and password sheet. There is no hidden
gesture (Guideline 2.5.19). The server checks every attempt against an allow-list (`reviewer_allowlist`), rate-limits it, and
answers every refusal the same way.

## What the account is

- Two accounts with fixed ids: the reviewer `7e1e7e00-0000-4000-8000-00000000a001` and a sample partner
  `7e1e7e00-0000-4000-8000-00000000a002`.
- A full sample life: about six months of records, a goal, a debt, a two-person household, Decide checks ready, on the top plan.
- A nightly job (`reviewer-reset-nightly`, 09:30 UTC, `reset_reviewer_account()`) puts it back to that state. No service key in CI.
- Both ids are on `docs/ops/decide-never-on.json`. The reset never switches Decide testing on for them.

## Create or reset the accounts (operator, from C:/dev/fincwin)

The credentials are not in git. Put `REVIEWER_EMAIL`, `REVIEWER_PARTNER_EMAIL` and `REVIEWER_PASSWORD` in the main checkout's
`.env.local` (next to `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROD_PROJECT_REF`), then:

```
node scripts/ops/create-reviewer-accounts.mjs --dry-run   # lists the steps, no network
node scripts/ops/create-reviewer-accounts.mjs             # allow-list, users, link, one reset
```

The script refuses to run unless `SUPABASE_PROD_PROJECT_REF` matches `supabase/config.toml`. It prints step names and HTTP
status codes only. Run it again at any time; it is safe to repeat.

## Review notes text (Apple and Google)

> Tap "App review sign-in" at the bottom of the sign-in screen and use: `<email>` / `<password>`. The account holds three months
> of sample records, a goal, a debt and a two-person household on the top plan. It resets every night.

File the real credentials in App Store Connect and Play Console only.

## Phase 11 checks

- Guideline 2.5.19 (no hidden features): confirm the link is visible on the signed-out screen and named in the review notes.
- The hook must be enabled in the hosted dashboard (Auth > Hooks > Before user created) so email sign-ups stay refused.
- Sign in with the notes' credentials on a fresh install, then confirm the reset ran (Records show recent months).
