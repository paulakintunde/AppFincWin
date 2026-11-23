# Phase 10: System - Context

**Gathered:** 2026-11-22
**Status:** Ready for planning

<domain>
## Phase Boundary

The app is secure, resilient offline, and lets a user manage their own data completely. Phase 10 delivers:

- **Security:** the signed-in device list with sign-out of one or all devices (ACC-06, ACC-07); Face ID / Touch ID / Android biometric unlock and a PIN (ACC-08, ACC-09); a plain cover in the app switcher (DSG-08); per-user rate limits on server functions (ACC-13); allow-listed reviewer sign-in (ACC-11).
- **Offline:** write-queue hardening. Retries never duplicate (SYN-03 is already ticked, so re-verify it). The queue survives a force-quit (SYN-04). It is bounded, and the user is told when it is full (SYN-05).
- **Alerts:** five alert kinds with per-kind amounts, instant or digest delivery, quiet hours and an alert log (ALR-01..05); server-side push for household and server events (ALR-06); APNs and FCM credentials (ENV-19).
- **Own data:** month archive and restore (DAT-01); CSV export completed against all tables, including those 08.1 added (DAT-02); CSV import of goals, debts, investments and accounts (DAT-03); the deletion choice about phone data (DAT-04); a diagnostic export (DAT-06); wallet statement import for PayPal, Wise and Revolut (IMP-06).
- **Operations:** daily production backups plus a rehearsed restore (ENV-16, DAT-05).

May run in parallel with Phase 7 (owner, 2026-11-22). 08.1 is merged (PR #180), so export, deletion and archive must cover every table 08.1 added.

</domain>

<decisions>
## Implementation Decisions

### Phone lock (ACC-08, ACC-09, DSG-08)
- **D-01:** The lock is **off by default**. After first setup, the app offers it once ("Lock FincWin with Face ID?"), and the user can accept or skip. It can be switched on or off any time in You.
- **D-02:** Unlock timing is the user's choice: right away, or after 1, 5 or 15 minutes in the background. **Default: 1 minute.**
- **D-03:** The PIN is **6 digits**. After 5 wrong tries the app makes the user wait 30 seconds, and each further wrong try lengthens the wait. After 10 wrong tries the user must **sign in again with Apple or Google**. Cloud data is never deleted by wrong tries, and the phone copy is cleared only through the normal sign-out path.
- **D-04:** The **app-switcher snapshot is always a plain cover**, even when the lock is off: the theme's page tint with the FincWin mark, and no numbers. Blur is not allowed (no effects in the design rules).

### Backups (ENV-16, DAT-05)
- **D-05:** **Daily, automatic** backups. This **supersedes the 2026-11-22 "weekly encrypted backup" note**: the owner chose daily because it costs the same and loses at most a day of records. Supabase stays on the Free plan, so backups are taken outside Supabase.
- **D-06:** A scheduled **GitHub Actions** job dumps the database, **encrypts the dump**, and uploads it to private low-cost object storage (AWS S3 or Cloudflare R2, chosen in research) in a US region, to match us-west-2. This needs one new storage account, which is an owner step to record in the dependency register.
- **D-07:** Backups are **kept for 30 days**, then deleted automatically.
- **D-08:** The restore rehearsal runs **once now, by hand, with a written record**: restore into the local Supabase stack, check row counts and spot-check figures. After that, a **monthly scheduled job** restores the latest backup into a throwaway Postgres in CI, checks it, and alerts the owner if it fails.

### Alerts and push (ALR-01..06, ENV-19)
- **D-09:** **Bills due** and **goal reached** are on by default. Over cap, large transaction and low balance start off; the user switches them on and sets the amount. The app asks for notification permission **only when the first alert is switched on**, never at first launch.
- **D-10:** **Default amounts come from the user's own months:** large transaction is about 3 times their typical single spend, and low balance is about one week of normal spending. Until there is enough history, a flat amount in the user's currency applies (about 200 for large and 100 for low balance, in home currency). The calculation is pure logic and lives in `engine/`.
- **D-11:** Digest users get **one summary daily at 8am local time**. Quiet hours default to **10pm–7am**. An alert raised during quiet hours is held and delivered when quiet hours end. All of these can be changed.
- **D-12:** **Partner large-expense push:** each receiver's own "large" amount decides whether they get the alert, and each person can turn partner alerts off. The push text says who, how much and the category, and **never the note or payee**, for example "Sam spent $320 on Home". The hidden-names setting from Phase 8 must be respected.

### Month archive (DAT-01)
- **D-13:** **Archiving only tidies the view.** An archived month leaves Activity's month switcher and search, and sits in an Archive list showing that month's income and spend until it is restored. **Balances, Decide answers, goals and Insights do not change.** Archiving must never change a money answer. Add a test that proves Decide's output is unchanged.
- **D-14:** An archived month is **read-only for the person who archived it** until they restore it. They can open it and look, but must restore it to edit.
- **D-15:** **Archive is personal.** Archiving March hides it only from the person who archived it, and partners still see it normally. Nobody can hide shared spending from someone else, so partners can still edit shared rows in that month.
- **D-16:** Archive is an **expert-level (level 4) feature**, as in the prototype ("Older months kept out of the way"). Add an `archive` entry to `featureRegistry.ts` with `area: 'System'` and `minLevel: 4`.

### Account deletion and phone data (DAT-04, ACC-10)
- **D-17:** Before deleting, the screen offers **"Save a copy of my records"**, which writes a CSV through the share sheet so the person can keep it in Files, email and so on. After deletion, **the account and the phone copy are both wiped**. Nothing of FincWin stays in the app. There is no signed-out read-only mode.
- **D-18:** Deletion stays **immediate**, as built in 08-22: a typed confirmation, then the account is gone. There is no cooling-off period.
- **D-19:** **Backups:** the delete screen and the privacy copy say plainly that backup copies are kept for 30 days and then they are gone too. To support this, keep a **deletion log of user IDs only**. Any restore must re-apply those deletions before the restored data is used. Backups are never edited in place.
- **D-20:** Carry-over: the deletion flow must call `forgetGoogleOnAccountDeletion(email)` (02.3 D-20). Phase 8 rules stand: deletion is never blocked, ownership passes to the earliest-joined member, and shared lines stay as "Former member" (08 D-27, D-29, D-40).

### Wallet import (IMP-06)
- **D-21:** **Named readers for PayPal, Wise and Revolut** CSV exports. Any other wallet falls back to the existing column-matching import.
- **D-22:** A file with several currencies turns each currency balance into its own account. For a currency that has no account yet, the preview **suggests new accounts** ("Create 'Wise EUR' and 'Wise GBP'?"), with a switch for each and an option to link an existing account instead. **Nothing is created without a tap.**
- **D-23:** **Fees are separate lines.** The payment is saved at its gross amount and the fee as its own linked expense in a "Fees" category, so the account balance still matches the net. A currency conversion's two lines are linked as a transfer, with the fee as a separate expense, as IMP-06 requires.
- **D-24:** The owner **will provide real export files** from their own accounts. Personal details are stripped before the files go into the repo as test fixtures. Planning must include an owner step to collect them, and the readers are built against those files.

### Reviewer sign-in (ACC-11)
- **D-25:** **Hidden email-and-password sign-in.** Tapping the sign-in screen's small print 7 times reveals the form. The server accepts only emails on a **server-side allow-list**, and every other email is refused, so it is not a back door. The password goes to Apple and Google in the review notes, and the review notes must explain how to open the hidden form. Research and Phase 11 must check this against Apple's rules on hidden features (Guideline 2.3.1); if it is a risk, fall back to a small visible link.
- **D-26:** The reviewer account holds **a full sample life**: 3 months of realistic records, a goal, a debt, a household with a second sample member, and Decide ready to answer. It is on the top plan, so every feature shows. **A nightly job resets it.** Reviewer and demo accounts must **never** be on the Decide tester list (05.4 D-29).

### Offline write queue (SYN-04, SYN-05)
- **D-27:** The queue holds **500 unsent changes**. At 400 a gentle note appears. At 500, new entries are blocked until the phone is back online.
- **D-28:** The message is **plain and calm**, for example: "You have 500 changes waiting to send. Connect to the internet to send them, then you can add more. Nothing is lost." It appears on the add screen, and the count shows in the existing "waiting to send" marker. No warning or amber styling.

### Owner answers after research (2026-11-22)
- **D-29:** **10th wrong PIN keeps the phone copy for the same person.** "Sign in again" means re-authenticating with Apple or Google. If the same user signs back in, the unsent write queue and phone copy stay and they set a new PIN. If a different user signs in, the normal sign-out wipe runs first.
- **D-30:** **Reviewer sign-in uses a small visible link, not the 7-tap form.** This amends D-25: research found Apple's hidden-features rule is now Guideline 2.5.19 (clarified 2026-10-16) and a hidden 7-tap form is medium risk. The link opens the email-and-password form; the server-side allow-list (D-25) stays, and every non-listed email is refused.
- **D-31:** **Backups go to Cloudflare R2 on the existing company Cloudflare account**, bucket in the `us` jurisdiction, 30-day lifecycle rule (resolves D-06's storage choice). Owner creates the bucket and an access key.
- **D-32:** **Push goes through the Expo push service**, with the full alert text (who, how much, category; never note or payee, per D-12). That alert text passes through Expo must be disclosed in the Phase 11 privacy copy.

### Claude's Discretion
- Research recommendations taken as defaults: refuse a CSV import that would push the queue past 500 up front, with the calm D-28 message; flat alert defaults for other currencies are the ~200/~100 amounts converted from a EUR-equivalent; Android biometric strength `'strong'`; archive read-only (D-14) enforced in the client only.
- **Device list (ACC-06, ACC-07):** how to read and revoke Supabase Auth sessions (Edge Function with the service role over `auth.sessions` / `auth.refresh_tokens`, or another approach), and how each device is named: device model and OS, last active, current device marked.
- **Push delivery:** the provider (the Expo push service, or FCM and APNs directly), where tokens are stored, and how quiet hours and digests are scheduled on the server. APNs waits on Apple enrolment, so Android and FCM land first.
- **Bills-due lead time** (for example, 1 day before) and the exact digest content.
- **Rate limits (ACC-13):** the scheme and the limits per Edge Function.
- **Diagnostic export (DAT-06):** the content. By default it carries no amounts, payees or notes; the user sees exactly what will be sent before sending, and sending is their choice.
- **CSV import of goals, debts, investments and accounts (DAT-03):** the template format, which should mirror the export columns so that an export can be imported again.
- Whether alert settings get an entry in the feature registry. Bills due and goal reached must be reachable at every level.
- **SYN-03:** re-verify the existing no-duplicate guarantee with a test (force-quit mid-flush, then resume).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` § "Phase 10: System": goal, six success criteria, the notes on running in parallel with 7 and on 02.3 D-20
- `.planning/REQUIREMENTS.md`: ACC-06..11, ACC-13, SYN-03..05, ALR-01..06, DAT-01..06, ENV-16, ENV-19, DSG-08, IMP-06
- `.planning/PROJECT.md`: compliance positioning, Key Decisions (device list as session management, encrypted session and cache, Supabase plan rows), and the running-costs table
- `BUILD-PROMPT.md` lines ~142, ~222, ~331: the prototype's `alerts`, `alert_log`, `devices`, `archive_months` tables; the Activity month switcher with restorable archived months; the System tab contents
- `FincWin United.dc.html`: the prototype's archive detail ("Older months kept out of the way", "Restore all", "Export the archive")

### Prior decisions that bind this phase
- `.planning/phases/08-household/08-CONTEXT.md`: D-27, D-29, D-40 (deletion: never blocked, ownership hand-off, "Former member"), hidden names
- `.planning/phases/09-tiers-onboarding/09-CONTEXT.md`: feature levels and the plan state (export is never plan-locked)
- `.planning/phases/08.1-decide-rebuild-on-real-data/08.1-CONTEXT.md`: the tables 08.1 added, which export, deletion and archive must cover
- `.planning/phases/05.4-decide-safety-patch/05.4-CONTEXT.md` D-29: reviewer and demo accounts are never on the Decide tester list
- `.planning/phases/03-shell/03-CONTEXT.md`: DSG-08 was deferred here to pair with the lock screen

### Code contracts
- `src/data/exportManifest.ts`: the export coverage contract plus its guard test
- `src/services/account/deleteAccount.ts`, `supabase/functions/delete-account/`, `src/features/you/DeleteAccountScreen.tsx`: the existing deletion flow
- `src/services/auth/google.ts`: `forgetGoogleOnAccountDeletion`
- `src/data/cache/persister.ts`, `src/data/onlineManager.ts`, `src/data/sync/lockedWrites.ts`: the encrypted persister, paused-mutation resume and the write queue
- `src/features/levels/featureRegistry.ts`: the feature levels, where the archive entry is added
- `src/features/record/import/`, `src/engine/csv/`, `src/engine/statement/`: the import pipeline the wallet readers plug into
- `src/features/decide/notifications/`, `src/features/plans/notices/trialReminder.ts`: existing local-notification patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Account deletion end to end** (08-22): the Edge Function, the client service (server confirms first, then wipe and sign-out) and the screen with typed confirmation. Phase 10 adds the "Save a copy" step, backup wording and the deletion log.
- **CSV export** (`features/export`, 09-18) and `EXPORT_MANIFEST` with a guard test. Phase 10 completes coverage and reuses the serializer for the pre-deletion copy and for DAT-03's import template.
- **`services/storage/wipe.ts`**: the device wipe used by sign-out and deletion.
- **Import pipeline** (CSV, OFX and PDF, with preview, duplicates, transfer suggestions and FX truth from IMP-05). The wallet readers are new format profiles inside this pipeline.
- **`expo-notifications` and `expo-secure-store`** are installed. **`expo-local-authentication` is not installed yet**, so adding it needs a new dev build.

### Established Patterns
- `engine/` stays pure. Default alert amounts (D-10), archive filtering rules and wallet parsing belong in `engine/` with exhaustive tests.
- Client-generated UUIDs plus `version` make retries idempotent, which is the basis for SYN-03.
- Every migration runs on the local stack before `db push --remote` (Free-plan operating rule).
- Copy is declarative, not prescriptive, in plain words, through the typed i18n catalogue.

### Integration Points
- You tab: Security (lock, devices), Alerts, Archive, Export, Diagnostic, Delete.
- Activity month switcher: hide archived months for the person who archived them.
- Edge Functions: session list and revoke, push fan-out, digest scheduler, reviewer sign-in allow-list, rate limiting.
- GitHub Actions: nightly backup, monthly restore check, nightly reviewer-account reset, and the existing keep-alive.

</code_context>

<specifics>
## Specific Ideas

- Lock offer wording: "Lock FincWin with Face ID?"
- Partner push example: "Sam spent $320 on Home". It never includes the note or payee.
- Offline-limit message: "You have 500 changes waiting to send. Connect to the internet to send them, then you can add more. Nothing is lost."
- Wallet new-balance prompt: "This file has EUR and GBP balances. Create 'Wise EUR' and 'Wise GBP'?"
- Deletion: "Backup copies are kept for 30 days, then they are gone too."

</specifics>

<deferred>
## Deferred Ideas

- Wallet readers for Monzo, Starling, N26 and similar app banks. These fall back to the generic import for now.
- A signed-out, read-only mode to keep viewing records after deleting the account. Rejected for v1.
- A 7-day cooling-off period before deletion. Rejected for v1.
- Upgrading Supabase to Pro for managed daily backups. That waits for revenue (owner, 2026-11-22), and the D-05..D-08 backup job covers the gap.

</deferred>

---

*Phase: 10-system*
*Context gathered: 2026-11-22*
