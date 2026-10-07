---
phase: 02-record
plan: 31
subsystem: rollout
tags: [production, supabase, acceptance, device]
requires: [02-01..02-30, 02-32..02-40]
provides: [phase-2 schema on production, device acceptance]
key-files:
  created:
    - docs/acceptance/phase-02-record.md
    - docs/acceptance/fixtures/sample-bank-export.csv
    - docs/acceptance/fixtures/overdrawn-current-account.csv
    - docs/acceptance/fixtures/card-over-limit.ofx
    - .planning/phases/02-record/02-31-WALKTHROUGH-FIXES.md
    - src/features/auth/appHome.ts
    - src/engine/money/regionCurrency.ts
    - src/features/record/useDeviceHomeCurrencyDefault.tsx
  modified:
    - src/features/consent/ConsentScreen.tsx
    - app/index.tsx
    - app/(app)/_layout.tsx
    - src/services/locale/deviceLocale.ts
    - src/features/record/import/ImportScreen.tsx
    - src/ui/Pill.tsx
    - src/i18n/locales/en.ts
completed: 2026-10-07
---

# 02-31 Summary: Phase 2 production rollout and device acceptance

Phase 2's schema is on production, and the Record flow was checked end to end on a Pixel 9. The user approved the walkthrough on 2026-10-07.

## Task 1: local gate, fixtures, push, live checks
- **Local gate:** the full gate passed on the merged tree (PR #43, `59ac179`):
  - typecheck, depcruise and lint (0 errors);
  - `check:ignores` and `verify:gates`;
  - Jest: 141 suites, 4,223 tests;
  - migration and mirror checks;
  - pgTAP after a local reset: 37 files, 678 tests.
- **Preflight:** the ref `cohmcbdfgqmiwykztrdg` matched. The Phase 1 precondition held. `pg_trgm` was available but not yet installed, and the migration installs it into `extensions`.
- **Push:** `npm run supabase:db:push -- --yes` applied `20260926000100` to `20260926000800`.
  - The sandbox refused the first attempt. The user then explicitly asked for the push and it ran.
  - `migration list --linked` shows all eight migrations on both sides.
- **Live checks** (Management API, read-only), all passing:
  - categories are seeded;
  - both cron jobs are scheduled (`20 0 * * *` and `40 3 * * *`);
  - `pg_trgm` is in `extensions`;
  - the `transactions_active` view, the `transfer_pair_check` trigger and the `import_profiles` table exist;
  - all 5 provenance columns and both limit columns exist.
- **Fixtures:** three synthetic statement files.

## Task 2: device walkthrough (Pixel 9, physical)
- **Device build:** a local arm64 debug build with the dev client, served by Metro over USB.
  - The first build targeted the emulator's x86_64 ABI and would not install on the phone.
  - `expo run --device` did not recognise the phone by serial or by name, so the APK was built with `gradlew -PreactNativeArchitectures=arm64-v8a`.
  - The old EAS-signed install had to be removed first because its signature did not match.
- **Results:** steps 1–19 pass. Step 20 (iPhone XR) is pending Apple enrolment. Per-step results are in `docs/acceptance/phase-02-record.md`.
- **Step 1 found three problems,** fixed test-first in this plan (`02-31-WALKTHROUGH-FIXES.md`):
  1. Consent redirected to `/you`, a Phase 0 leftover. It now uses the shared `APP_HOME_HREF` (`/activity`).
  2. Home currency always started as USD. It is now set on first sign-in from the device region, then the time zone, with USD as the last resort.
     - It applies only to a profile still on the USD default with no accounts, once per user per device.
     - It uses a pure `engine/money/regionCurrency.ts` and the existing money-prefs mutation. No migration was needed.
  3. The import file button was disabled with no reason given. The pick step now shows "Choose or add an account first.", and the button carries the same accessibility hint.
- **Step 12 (refusal):** the user ran the system write on `57f3bc86…` (version 4 to 5) themselves after the sandbox refused it. The undo was then refused as "changed elsewhere".

## Deviations
- Production writes (the schema push and the step-12 system write) were refused by the sandbox and run on the user's explicit instruction, as the plan's checkpoint rule anticipates.
- The device walkthrough ran on an Android physical device rather than the emulator.

## Follow-ups
- **New (user decision 2026-10-07):** allow deleting a money account only while it has no lines; otherwise archive. Accounts are archive-only today: there is no delete grant, and `transactions.account_id` is `ON DELETE RESTRICT`. This needs a migration and a production push, so it is tracked as a follow-up task rather than done here.
- Step 20, the iOS file picker, waits for Apple enrolment.
- The open copy and design decisions are listed in `02-REVIEW-FOLLOWUPS.md` and the plan summaries:
  - text for a balance too large to display;
  - the transfer glyph colour;
  - status tags on `fill1`;
  - tick rows in import.

## Self-Check: PASSED
