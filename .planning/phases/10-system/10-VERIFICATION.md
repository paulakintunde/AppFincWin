---
phase: 10-system
verified: 2026-11-27
status: human_needed
score: 6/6 criteria verified in code (Android device-verified); 25/26 requirements satisfied, ENV-19 partial (FCM done, APNs waits on 00-20)
gaps: []
---

# Phase 10: System - Verification

Goal: the app is secure, resilient offline, and lets a user manage their own data completely. Checked against the code on origin/main at f78704ae (after PR #202), the plan SUMMARYs, the device check record `docs/acceptance/phase-10-device-checks.md` and the merged PRs. Tests were not re-run for this report; the 10-30 gate ran the full suite (app Jest, engine coverage, pgTAP, Deno, checks) before the device round, and each review-fix PR reports its own green runs.

Delivery: PR #193 merged 2026-11-26 (all 30 plans' code). Production rollout the same day (10-29, `docs/ops/phase-10-rollout.md`): migrations 20261126000100..0800, six Edge Functions, alert secrets and Vault entries, the before-user-created hook, reviewer accounts, first backup and restore check. Device gate PR #197 merged 2026-11-27 (10-30).

## Success criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | See every signed-in device with this one marked; sign out one or all | VERIFIED (Android) | `supabase/migrations/20261126000400_devices_rpcs.sql` (`list_my_devices`, `revoke_my_session`, `touch_my_device`), pgTAP 123; `src/db/devices.ts`; `src/features/security/DevicesSection.tsx`, `DeviceRow.tsx`, `DeviceDetailSheet.tsx`, `SecurityScreen.tsx`. Pixel 9 step 7 pass |
| 2 | Unlock with Face ID, Touch ID, Android biometrics, or a PIN | VERIFIED on Android; Face ID open | `src/services/lock/biometric.ts`, `pin.ts`, `lockStore.ts`, `reauth.ts`; `src/features/lock/LockGate.tsx`, `LockScreen.tsx`, `PinPad.tsx`, `LockSetupSheet.tsx`, `useLockController.ts`. D-33: phone lock by default, app PIN optional. Pixel 9 steps 3-6 pass. Review fixes #200 (no content flash on return, Forgot PIN needs the phone lock, fails closed, one PIN check at a time, clock-change rules, external-activity grace, write hold during re-sign-in). iPhone XR Face ID is step 16, not run |
| 3 | Retried write never duplicates; queue survives force-quit; queue is bounded and the user is told | VERIFIED | `src/data/sync/queueCap.ts` (`QUEUE_NOTE_AT = 400`, `QUEUE_BLOCK_AT = 500`), `writeQueueState.ts`, tests `queueCap.test.ts`, `writeQueueState.test.ts`, `writeHold.test.ts` (#200). SYN-03 was already Complete; 10-13 re-verified SYN-03/04. Pixel 9 step 11: three offline lines, force-quit, each sent once (server check 2026-11-27 02:01 UTC) |
| 4 | Alerts for bills due, over cap, goal reached, large transaction, low balance; threshold per kind; instant or digest; quiet hours; alert log | VERIFIED | `supabase/migrations/20261126000500_alerts_raise.sql` (`raise_alert`, `alerts_on_transaction`, `alerts_on_goal`, `alerts_bills_due`), `20261126000700_alerts_deliver_schedule.sql`; `supabase/functions/alerts-deliver/` (`schedule.ts`, `deliver.ts`, `expo.ts`, `text.ts` with Deno tests); `src/engine/alerts/defaults.ts`; `src/features/alerts/AlertsScreen.tsx`, `AlertKindSheet.tsx`, `AlertLogScreen.tsx`, `PermissionPreAsk.tsx`. Device gaps fixed in 10-30: cross-currency thresholds (migration 20261127090000, pgTAP 128) and alert settings never saving (20261127090100, pgTAP 129). Review fixes #199 (no double-send, digest sent once, migration 20261127090200, pgTAP 137) and #201 (threshold keeps its saved currency). Pixel 9 steps 8-10 pass; the hold-then-release path was only brushed on the device and is covered by pgTAP 127 and `schedule.test.ts` |
| 5 | Archive and restore a month; export CSV; import goals/debts/investments/accounts from CSV; in-app deletion that purges, with a choice about cached data | VERIFIED | Archive: `src/engine/archive/archive.ts`, `src/features/archive/*`, `app/(app)/archive/`; step 12 pass (month leaves the switcher, Decide answer unchanged). Export: `src/features/export/csvExport.ts`, `csvSerialize.ts`, `src/data/exportManifest.ts`, `20261126000450_server_export.sql`, pgTAP 126. Import: `src/engine/dataCsv/parse.ts`, `src/features/dataImport/*`. Deletion: `supabase/functions/delete-account/`, `src/services/account/deleteAccount.ts` (calls `forgetGoogleOnAccountDeletion`), `20261126000300_account_deletion_log.sql`, pgTAP 122 completeness sweep; #199 adds the `plan_events` purge (20261127090300). `src/features/you/DeleteAccountScreen.tsx`: step 13 pass (save-a-copy and 30-day backup line shown; no account was deleted on the device) |
| 6 | Partner's large expense arrives as push; balances hidden in the app switcher; backup restored into non-production and verified; reviewer sign-in through an allow-list | VERIFIED (Android), with notes | Push: step 9 pass on 2026-11-27 after the FCM V1 key was attached to the app (`eas credentials`). App switcher: `src/features/lock/AppCover.tsx`, `plugins/withRecentsCover.js`, `src/services/lock/secureWindow.ts`; steps 1-2 pass under the owner's amended rule (below). Backup: `.github/workflows/backup.yml` (daily 04:23 UTC), `restore-check.yml` (monthly, 3rd at 05:17 UTC), `scripts/ops/backup/dump.sh`, `restore-check.sh`; restore run 45853146569 passed (89 tables, 11 users), counted by the owner as the D-08 rehearsal. Reviewer: `20261126000600_reviewer_signin.sql` (`is_reviewer_email`, `hook_before_user_created`), `supabase/functions/reviewer-signin/`, `src/features/auth/ReviewerSignInSheet.tsx`, pgTAP 125/128 (seed); on production the reviewer accounts sign in (200) and a random email gets 401 (10-29) |

## Owner decisions recorded during verification

- **D-04 amended on Android (owner, 2026-11-27):** the Pixel's live recents card is a frozen frame that no cover can beat. FLAG_SECURE (via expo-screen-capture) is on only while "Lock FincWin" is on. With the lock on, the card is black and screenshots are blocked. With the lock off, the stored card is blank, the live card may show figures, and screenshots stay allowed. iOS keeps the JS AppCover. `src/services/lock/secureWindow.ts`; 10-VALIDATION.md approval line. 10-CONTEXT.md D-04 itself has not been edited.
- **Data import amounts (owner, 2026-11-27, PR #201 D-1):** money cells are whole minor units only; a decimal is flagged `decimal-amount` and never re-scaled. This supersedes 10-07-PLAN lines 77 and 88 (note added there).
- **ENV-19:** FCM V1 is done for Android (attached and proven 2026-11-27). APNs waits on Apple setup 00-20.

## Code review fixes (three reviewers, all merged 2026-11-27)

| PR | Area | What changed |
|---|---|---|
| #198 | Backups | Daily backup and restore check drop the runner's broken `packages.microsoft.com` apt source (a 403 there failed the scheduled backup on 2026-11-27, run 46011702269; manual run 46026319124 passed after the fix) |
| #199 | Server | Alerts never double-send, digest claimed once (20261127090200, pgTAP 137); deletion purges `plan_events` (20261127090300); reviewer nightly reset without table locks (20261127090400, pgTAP 138); stricter restore check that needs per-table COPY counts (`dump_tables`); reviewer sign-in counts only failed tries (20261127090500, pgTAP 139). Migrations pushed and alerts-deliver / reviewer-signin redeployed to production and verified |
| #200 | App lock | L-1..L-9 (see criterion 2). Needs a Pixel recheck on the next build |
| #201 | Data and alerts | Whole-minor-unit import, wallet fee sign and returned fees, Wise fees not doubled, alert threshold currency, strings to locales, CSV guard for leading tab/CR |
| #202 | Tests | Nightly Decide invariant tests learn the 08.1 "goes below $0 later" top lines (TOP_LINES); the engine was right, the tests were out of date |

**In progress (not merged):** three LOW findings on branch `fix/10-review-low` (alert settings save concurrency; partner alert name after account deletion; restore re-applying the deletion log) plus two owner wording decisions: a private partner push becomes "A household member spent {{amount}}." (today: "Someone spent ..."), and partner alerts stay on their own switch. At the time of writing the branch has no PR and is not on origin.

## Requirements

| Req | Status | Evidence |
|---|---|---|
| ACC-06, ACC-07 | Satisfied | criterion 1 |
| ACC-08 | Satisfied (Android); Face ID open | criterion 2 |
| ACC-09 | Satisfied | criterion 2 |
| ACC-10 | Satisfied | criterion 5 (deletion) |
| ACC-11 | Satisfied | criterion 6 (reviewer) |
| ACC-13 | Satisfied | `20261126000200_rate_limits.sql` (`rate_limit_hit`), pgTAP 121; #199 `rate_limit_peek` |
| SYN-03, SYN-04, SYN-05 | Satisfied | criterion 3 |
| ALR-01..ALR-05 | Satisfied | criterion 4 |
| ALR-06 | Satisfied (Android) | criterion 6 (push); APNs open |
| DAT-01..DAT-04 | Satisfied | criterion 5 |
| DAT-05 | Satisfied | restore run 45853146569 (10-29) |
| DAT-06 | Satisfied | `src/features/diagnostic/DiagnosticScreen.tsx`, `buildDiagnostic.ts`, `app/(app)/diagnostic.tsx` |
| DSG-08 | Satisfied (Android, amended D-04); iPhone open | criterion 6 |
| ENV-16 | Satisfied | daily backup workflow; first backups 2026-11-26 |
| ENV-19 | Partial | FCM V1 done; APNs waits on 00-20 |
| IMP-06 | Satisfied on sample formats | `src/engine/statement/wallets/` (paypal, wise, revolut, toDrafts), `src/features/record/import/WalletReview.tsx`; #201 fee fixes. Real-file check open (10-28: the owner had no real exports) |

## Gaps

None blocking in code.

## Human verification and open items

1. **iPhone XR (10-30 step 16):** Face ID unlock, the app-switcher cover and APNs push. Waits on Apple setup plan 00-20. Not run, not passed.
2. **New app build and a Pixel recheck of the lock flow:** the #200 lock fixes and the #199/#201 changes have not been on a device. The EAS Android free quota resets 2026-12-01 (a local Gradle dev client is the fallback).
3. **Monthly restore check after #199:** the restore check now refuses a backup made before #199 (no `dump_tables`). The next scheduled daily backup (04:23 UTC) will be the first one it accepts; the next scheduled restore check is 2026-12-03 05:17 UTC. Check it passes, and do the hand spot-check of three figures (10-29 carry-forward).
4. **Real wallet CSV check:** run one real PayPal, Wise and Revolut export (stripped with `scripts/ops/strip-wallet-export.mjs`) through the readers. Owner item.
5. **Quiet-hours hold-then-release on a device:** only brushed in step 10 (covered by pgTAP 127 and `schedule.test.ts`).
6. **LOW review fixes and the partner-push wording:** in progress on `fix/10-review-low`.
7. Carried from 10-29: production `external_apple_enabled` is false (Sign in with Apple is mandatory before store submission, 00-20); the owner to delete the local age key file once the offline copies are confirmed.
