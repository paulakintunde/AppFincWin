# Phase 10: System - Research

**Researched:** 2026-11-22
**Domain:** Mobile app security (lock, sessions), offline queue hardening, server push, data portability (archive, CSV, wallet import), account deletion, production backup and restore (Supabase Free plan, GitHub Actions, object storage)
**Confidence:** MEDIUM-HIGH. Backup path, Apple rule, push and session findings are verified against official docs. Wallet CSV column layouts are LOW until the owner's real files arrive (D-24).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (and Claude's Discretion, verbatim from CONTEXT.md)

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

### Claude's Discretion
- **Device list (ACC-06, ACC-07):** how to read and revoke Supabase Auth sessions (Edge Function with the service role over `auth.sessions` / `auth.refresh_tokens`, or another approach), and how each device is named: device model and OS, last active, current device marked.
- **Push delivery:** the provider (the Expo push service, or FCM and APNs directly), where tokens are stored, and how quiet hours and digests are scheduled on the server. APNs waits on Apple enrolment, so Android and FCM land first.
- **Bills-due lead time** (for example, 1 day before) and the exact digest content.
- **Rate limits (ACC-13):** the scheme and the limits per Edge Function.
- **Diagnostic export (DAT-06):** the content. By default it carries no amounts, payees or notes; the user sees exactly what will be sent before sending, and sending is their choice.
- **CSV import of goals, debts, investments and accounts (DAT-03):** the template format, which should mirror the export columns so that an export can be imported again.
- Whether alert settings get an entry in the feature registry. Bills due and goal reached must be reachable at every level.
- **SYN-03:** re-verify the existing no-duplicate guarantee with a test (force-quit mid-flush, then resume).

### Deferred Ideas (OUT OF SCOPE)

- Wallet readers for Monzo, Starling, N26 and similar app banks. These fall back to the generic import for now.
- A signed-out, read-only mode to keep viewing records after deleting the account. Rejected for v1.
- A 7-day cooling-off period before deletion. Rejected for v1.
- Upgrading Supabase to Pro for managed daily backups. That waits for revenue (owner, 2026-11-22), and the D-05..D-08 backup job covers the gap.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACC-06, ACC-07 | Device list, sign out of one or all | `devices` table written by the client + SECURITY DEFINER RPCs over `auth.sessions`; GoTrue has no per-session admin API, so single-device revoke is a row delete (see Pattern 4) |
| ACC-08, ACC-09 | Biometric unlock, PIN | `expo-local-authentication ~57.x` (new dev build), PIN hash in `expo-secure-store`, wrong-try counter in SecureStore (Pattern 1) |
| DSG-08 | Plain app-switcher cover | JS `AppCover` on AppState plus device verification, native fallback (Pattern 2). `expo-screen-capture` only offers blur on iOS, which D-04 forbids |
| ACC-10, DAT-04 | Delete account, phone-data choice | Existing 08-22 flow + atomic deletion log trigger + pre-delete CSV (Pattern 8) |
| ACC-11 | Reviewer sign-in | Edge Function `reviewer-signin` + allow-list table + email signups off; Apple rule is **2.5.19**, not 2.3.1; recommend a visible link (Section "Reviewer sign-in") |
| ACC-13 | Per-user rate limits | Postgres fixed-window counter RPC called by each Edge Function (Pattern 7) |
| SYN-03, SYN-04 | No duplicate on retry; survives force-quit | Already built and tested (`idempotentRetry`, `offlineWrite` WR-A13 and restart tests). Re-verify only, plus a 500-entry persist test |
| SYN-05 | Bounded queue, user told | Pure `queueCap` over `useSyncStatus().queued` (Pattern 6) |
| ALR-01..05 | Five kinds, thresholds, instant/digest, quiet hours, log | `alert_settings`, `alert_prefs`, `alert_log` tables; pure defaults in `engine/alerts` (D-10) |
| ALR-06, ENV-19 | Server push; APNs/FCM credentials | Expo push service, outbox + pg_cron drainer (Pattern 5); FCM v1 now, APNs after enrolment |
| DAT-01 | Month archive | Personal, client-side filter, `archived_months` table, registry entry (Pattern 9) |
| DAT-02, DAT-03 | Full CSV export, CSV import of goals/debts/investments/accounts | Extend `EXPORT_MANIFEST` coverage; template = export columns; round-trip property test (Pattern 10) |
| DAT-05, ENV-16 | Daily backup + rehearsed restore | GitHub Actions + session pooler + `age` + Cloudflare R2 (Section "Backups") |
| DAT-06 | Diagnostic export | Allow-list of fields, preview before send; see Pattern 11 |
| IMP-06 | PayPal, Wise, Revolut readers | New format profiles in `src/engine/statement`; starting schemas below; blocked on owner fixtures (D-24) |
</phase_requirements>

## Summary

Phase 10 is mostly integration work on top of patterns the codebase already has: pg_cron + pg_net + Vault-secret Edge Function calls, `EXPORT_MANIFEST` with a guard test, the 08-22 deletion flow, the TanStack mutation cache as the write queue (persisted, chunked, restored, replayed), `registerWipeHandler`, and the `import` pipeline with format profiles. The genuinely new ground is (1) a native lock and app-cover layer that needs a new dev build, (2) a server push pipeline, (3) backup/restore operations outside Supabase, and (4) the wallet readers that cannot be finished without the owner's real files.

Five findings change the plan versus the CONTEXT text. **First**, Apple moved the "no hidden, dormant or undocumented features" rule from 2.3.1 to **2.5.19** in the 2026-10-16 guideline update, and the new text also sharpens enforcement; a 7-tap hidden form is the exact shape the rule names, so ship a quiet visible link instead (D-25's own fallback). **Second**, the deletion log must not live only in the database that gets restored, and it must be written in the same transaction as the user delete, or a failed delete leaves a live user in the log. **Third**, GoTrue has no admin API to list or revoke one session, so the device list needs a client-written `devices` table joined to `auth.sessions` and a SECURITY DEFINER delete. **Fourth**, `expo-screen-capture`'s iOS protection is a blur and its Android protection is FLAG_SECURE (blank recents, no screenshots), neither of which is the "plain tint cover" D-04 specifies. **Fifth**, SYN-03 and SYN-04 are already covered by tests; the real SYN-05 risk is persistence size at 500 entries and which entry points the cap guards.

**Primary recommendation:** Back up with a GitHub Actions job through the Supabase **session pooler** (IPv4) into a **Cloudflare R2** bucket (the owner already has a Cloudflare account), age-encrypted, 30-day lifecycle. Deliver push through the **Expo push service**, driven by an SQL-evaluated outbox drained by a one-minute pg_cron job. Ship the reviewer sign-in as a visible small link. Hold everything that needs owner files or accounts (wallet fixtures, R2, Firebase, APNs) as explicit owner steps in Wave 0.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Phone lock, PIN, biometric, wrong-try counter | Browser/Client (device) | — | Device-local gate; keys in SecureStore. Server never sees the PIN |
| App-switcher cover | Client (native + JS) | — | OS snapshot is taken on the device |
| Device list and revoke | API/Backend (RPC over `auth.sessions`) | Client (writes device row, shows list) | Only the DB can see and delete sessions |
| Rate limits | API/Backend (Edge Function + DB counter) | — | Must be server-enforced |
| Reviewer allow-list sign-in | API/Backend (Edge Function) | Client (hidden/visible form) | Allow-list and rate limit are server checks |
| Alert evaluation (large, over cap, low balance, bills, goal) | Database (SQL triggers + pg_cron) | Client (pure default amounts in `engine/`) | Must fire when the app is closed; Deno cannot import `engine/`, so figures are SQL, thresholds are numbers the client computed |
| Alert delivery (quiet hours, digest, push) | API/Backend (Edge Function `alerts-deliver`) | Database (outbox) | Needs timezone logic, Expo API calls, receipts |
| Alert settings UI, permission ask | Client | Database (settings rows) | Permission prompt is device-only |
| Write-queue cap | Client | — | The queue is the phone's mutation cache |
| Month archive | Client (filter + read-only guard) | Database (`archived_months` row per user) | Display-only; must not change any money answer |
| CSV export/import, diagnostic export | Client | Engine (pure parse/serialize) | Runs as the signed-in user so RLS limits rows |
| Wallet readers | Engine (pure parsing) | Client (preview, account suggestion) | Same split as existing statement import |
| Account deletion | API/Backend (Edge Function + trigger) | Client (copy-out, wipe) | Server confirms first, then wipe (08-22) |
| Backups and restore check | CI/Ops (GitHub Actions) | Object storage | Supabase Free has none |
| Reviewer account reset | Database (pg_cron SQL function) | — | Keeps the service key out of CI |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-local-authentication | `~57.0.2` [CITED: CLAUDE.md stack table; docs.expo.dev/versions/latest/sdk/local-authentication] | Face ID, Touch ID, Android biometrics | Only Expo-supported API; needs `faceIDPermission` config plugin option and a new dev build (not in Expo Go for Face ID) |
| expo-secure-store | `~57.0.4` (installed) | PIN hash, salt, wrong-try counter, lock-until | Already installed; hardware-backed Keychain/Keystore |
| expo-crypto | `~57.0.3` (installed) | Random salt, SHA-256 | Already installed. No KDF exists in it |
| expo-notifications | `~57.0.23` (installed) | Permission, Expo push token, channels, tap handling | Already installed; local-notification patterns exist in `features/decide/notifications` |
| expo-device | `~57.0.2` (installed) | Device model and OS name for the device list | Already installed |
| expo-file-system | `~57.0.7` (installed) | CSV write, Android folder picker (`Directory.pickDirectoryAsync`) | Already used by `csvExport.ts` |
| expo-document-picker | `~57.0.3` (installed) | Choose a CSV file for import | Already installed |
| @supabase/supabase-js | `2.119.0` (installed; Edge Functions pin 2.116.0) | RPC, Edge Function invoke, `setSession` for reviewer sign-in | Installed |
| Expo push service (HTTP) | n/a | Send push to APNs and FCM through one API | Single API, EAS stores both credentials, free [CITED: docs.expo.dev/push-notifications/sending-notifications] |
| age (CLI) | current apt package on ubuntu runner [ASSUMED] | Encrypt the dump | Small, no key-ring state; public-key encrypt in the backup job |
| postgresql-client-17 (PGDG) | match server major [ASSUMED: verify server major in the first manual run] | `pg_dump`, `pg_restore` in CI | `pg_dump` must be >= server major version |
| Cloudflare R2 | n/a | Backup object storage | See Backups; S3-compatible, lifecycle delete, no egress fees |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fast-check | `^4.10.2` (installed) | CSV round-trip, queue-cap, default-amount, archive-invariance properties | Engine properties |
| pgTAP via `supabase test db` | CLI 3.1.0 pinned in CI | RLS, rate-limit counter, deletion completeness, deletion-log trigger | Every new table and RPC |
| deno test | v2.x (CI `deno` job) | Edge Function logic (pure `*.ts` beside `index.ts`, as `delete-account/delete.ts`) | New functions |
| aws4fetch or S3 CLI | n/a | Only if the delete-account function must write an off-DB deletion record to R2 (optional hardening) | Optional |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Cloudflare R2 | AWS S3 | S3 allows a PutObject-only IAM policy for the backup job and Object Lock; but needs a **new** AWS account, and the free allowance is time-limited. R2 reuses the existing Cloudflare account and 10 GB-month is free. Either works; recommend R2 |
| Expo push service | FCM + APNs directly from an Edge Function | Direct APNs needs HTTP/2 + JWT signing in Deno and per-platform code; Expo adds one more processor in the data-flow (disclose in Phase 11). Recommend Expo push |
| JS `AppCover` | `expo-screen-capture` `enableAppSwitcherProtectionAsync` | Blur only, iOS only. D-04 forbids blur |
| expo-sharing | `Share` + `Directory.pickDirectoryAsync` (existing) | Existing helper already does iOS share sheet and Android folder save. Do not add a dependency |

**Installation:**
```bash
npx expo install expo-local-authentication
# app.config.ts plugin entry: ['expo-local-authentication', { faceIDPermission: 'Use Face ID to open FincWin.' }]
# New dev build required (EAS). Nothing else is added.
```

**Version verification:** `expo-local-authentication` is not in `package.json` today (verified by grep); the SDK-57 pin comes from CLAUDE.md (57.0.2) and must be confirmed with `npx expo install` at plan time. Docs page fetched during research was the SDK 58 docs; the APIs listed (authenticateAsync options, `disableDeviceFallback`, `biometricsSecurityLevel`) are the same long-standing surface [CITED: docs.expo.dev/versions/latest/sdk/local-authentication]. `npx` was blocked in this session, so no `npm view` run; planner should run it.

## Architecture Patterns

### System Architecture Diagram

```
                          PHONE (Expo dev build)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ AppState ──► LockGate ──► (biometric | PinPad) ─► unlock                    │
 │     │            ▲  SecureStore: pinHash, salt, tries, lockUntil, timing    │
 │     └──► AppCover (tint + mark) on inactive/background                       │
 │ Add screen ──► queueCap(useSyncStatus.queued) ──► block at 500               │
 │ You ► Security ► devices ───────────┐   Alerts ► settings ─┐  Archive ─┐    │
 └─────────────────────────────────────┼──────────────────────┼──────────┼────┘
                                       │ RPC / invoke         │ upsert   │ upsert
                                       ▼                      ▼          ▼
 ┌─────────────────────── SUPABASE (Free, us-west-2) ──────────────────────────┐
 │ RPC list_my_devices / revoke_my_session ──► auth.sessions (+ devices table)  │
 │ transactions/goals/recurring ──triggers──► alert_outbox (raised + log row)   │
 │ pg_cron 1 min ──► pg_net ──► Edge Fn alerts-deliver                          │
 │      applies: prefs, quiet hours (tz), digest 08:00 local, partner rules,    │
 │      hidden names ──► Expo push API ──► APNs / FCM ──► phone                 │
 │ Edge Fns: reviewer-signin, delete-account (+rate_limit_hit RPC each)         │
 │ before-delete trigger on auth.users ──► account_deletion_log (same txn)      │
 │ pg_cron nightly ──► reset_reviewer_account() (SQL seed)                      │
 └───────────────▲─────────────────────────────────────────────────────────────┘
                 │ pg_dump over session pooler (IPv4)
 ┌───────────────┴──── GITHUB ACTIONS (cron from main) ────────────────────────┐
 │ nightly backup: pg_dump -Fc (public+auth) ► age ► R2 (30-day lifecycle)      │
 │ monthly restore-check: latest dump ► age -d ► supabase start (local stack)   │
 │   ► restore ► apply deletion log ► row counts + spot checks ► fail = alert   │
 └──────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/engine/alerts/            # defaults.ts (D-10), quietHours.ts, digest grouping (pure)
src/engine/archive/           # monthTotals, isArchived filter (pure)
src/engine/statement/wallets/ # paypal.ts, wise.ts, revolut.ts (format profiles, pure)
src/engine/dataCsv/           # per-table import schema + validator (pure)
src/services/lock/            # pin.ts (hash/verify/backoff), biometric.ts, cover.ts
src/features/lock/            # LockGate, LockScreen, PinPad, PinDots, AppCover
src/features/security/        # Security screen, DeviceRow
src/features/alerts/          # Alerts screen, kind sheets, log
src/features/archive/         # Archive list, archived month view
src/data/sync/queueCap.ts     # pure thresholds (400 note, 500 block)
supabase/functions/{alerts-deliver,reviewer-signin,devices}/  # each with pure *.ts + deno test
supabase/migrations/2026112x*  # see Migrations table
.github/workflows/{backup.yml,restore-check.yml}
docs/ops/{backup-restore.md,push.md}
```

### Pattern 1: App lock and PIN (D-01..D-03)
**What:** `LockGate` wraps the signed-in shell. State: `lockEnabled`, `lockAfterMs` (0, 1, 5, 15 min; default 1), `backgroundedAt`. On AppState `active` after `now - backgroundedAt >= lockAfterMs`, mount `LockScreen` above the tab bar.
- Biometric: `authenticateAsync({ disableDeviceFallback: true, cancelLabel, promptMessage, biometricsSecurityLevel: 'strong' })`. `disableDeviceFallback: true` keeps the OS passcode out of it so the app's PIN is the only fallback (D-03). Check `hasHardwareAsync()` and `isEnrolledAsync()` first; if either is false, offer PIN only. Android `'strong'` rejects Class 2 camera face unlock [CITED: docs.expo.dev local-authentication]; recommend `'strong'` for a money app and treat the rest as PIN users. Flag to owner as a low-stakes choice.
- PIN storage: `expo-crypto` random 16-byte salt + SHA-256 of `salt + pin`, stored with `SecureStore.setItemAsync(key, value, { keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY })`. A 6-digit PIN has 10^6 values, so no hash makes it brute-force-proof offline; the trust boundary is the hardware-backed store plus the attempt counter. State this plainly in code comments; do not add a JS KDF dependency. [ASSUMED design judgment; confidence MEDIUM]
- Counter: `tries` and `lockUntil` live in SecureStore (not AsyncStorage), so clearing app storage is not a trivial reset. Pure `backoff(tries)` in `src/services/lock/pin.ts`: tries 1-4 none; 5 -> 30 s; 6 -> 60 s; 7 -> 2 min; 8 -> 5 min; 9 -> 15 min; 10 -> re-sign-in path. Persist `lockUntil` as an absolute time and compare against a monotonic-safe source (clock rollback is possible; accept, document).
- **The 10-tries path vs the write queue.** The normal sign-out path (`performSignOut`) wipes every cache and the **unsent write queue**. `signOut.ts` warns with the pending count first, but a lock screen cannot show a destructive dialog fairly to someone who forgot a PIN. Recommend: "sign in again" means a fresh Apple/Google sign-in; if the signed-in user id matches, keep the phone copy and set a new PIN; if it differs, run the normal wipe. This keeps "cloud data is never deleted by wrong tries" and "phone copy cleared only via the normal path" literally true without silently dropping queued writes. Put to the owner as Open Question 1.
- Lock does not encrypt data (the cache is already encrypted by `LargeSecureStore`); it gates the UI. Say so in the DPIA notes.

### Pattern 2: App-switcher cover (D-04, DSG-08)
**What:** iOS takes the snapshot when the app resigns active; Android's recents thumbnail is taken when the activity stops.
- `expo-screen-capture` (SDK 58 docs fetched; same API in 57): `enableAppSwitcherProtectionAsync(blurIntensity)` is **iOS only and a blur**; on Android `preventScreenCaptureAsync()` sets FLAG_SECURE, "shows a blank screen in the recent apps preview" but also blocks screenshots and recording [CITED: docs.expo.dev/versions/latest/sdk/screen-capture]. Neither gives the themed tint-and-mark cover.
- Recommended build, in order: (1) JS `AppCover` rendered as the top-most view when AppState becomes `inactive` (iOS) or `background`/window-blur (Android), removed on `active`; pure view with `pageTint` fill and the FincWin mark, no text. (2) Verify on the iPhone XR and a Pixel (Apple enrolment may delay iOS; Android first) by taking the app switcher screenshot. (3) If the JS cover loses the race (JS AppState events are asynchronous to the native snapshot; this is the known weak point), add a **local Expo module** (Swift: add a UIView in `applicationWillResignActive`; Kotlin: `Activity.setRecentsScreenshotEnabled(false)` on API 33+, FLAG_SECURE toggled only while backgrounded on older). Swift/Kotlin need no Mac to write; EAS compiles them. [ASSUMED: JS timing is device-dependent; no source verified it for RN 0.86. LOW-MEDIUM confidence. Plan a device check task, not a code guess.]
- Do not use blur (D-04). Do not leave FLAG_SECURE on permanently (blocks user screenshots and breaks store screenshot capture).

### Pattern 3: Reviewer sign-in (ACC-11, D-25, D-26)
**Server design (works for hidden or visible entry):**
- Email signups **off** for the email provider; reviewer users are created once by an admin script, never by signup. Anyone else gets "invalid credentials".
- Edge Function `reviewer-signin` (JWT not required): checks `reviewer_allowlist(email)` (case-folded), calls `rate_limit_hit('reviewer:'||ip||email, 5, 900)`, then performs `signInWithPassword` server-side and returns the session; the client calls `supabase.auth.setSession`. Refuse every non-listed email with the same body and timing as a wrong password.
- Reviewer accounts are added to `docs/ops/decide-never-on.json` (the repo's existing Decide never-list, 05.4 D-29) and the guard that reads it must cover them.
- Account state: seeded by a SQL function `seed_reviewer_life()` (3 months of dated-relative records, a goal, a debt, a household with a second sample member, plan grant on the top plan via the 09 plan-grant path). pg_cron runs `reset_reviewer_account()` nightly: no service key is needed in CI. The household's second member is a separate sample user in the allow-list. Read `20261124000100_plans_core.sql` and `plan-grant` before writing the seed.
**Apple rule (verified live, 2026-11-22):** hidden or undocumented features are now **Guideline 2.5.19**, clarified by Apple on 2026-10-16; 2.3.1 is now "Accurate Metadata" and requires new features to be described with specificity in Notes for Review and be accessible for review [CITED: developer.apple.com/app-store/review/guidelines; developer.apple.com/news?id=vvzx6cul]. The quoted rule: "Don't include any hidden, dormant, or undocumented features in your app; your app's functionality should be clear to end users and App Review." Guideline 2.1(a) says to provide demo account info or, with prior approval, a built-in demo mode [CITED: same]. Apple's own enforcement language is "removal from the Developer Program" for egregious or repeated cases.
**Risk verdict:** MEDIUM. A 7-tap form documented in the review notes with a server-side allow-list is disclosed, so it is arguably not "undocumented"; but it is literally "hidden", Apple's language just tightened, and the cost of a visible link is one line of small print. **Recommend the visible link from the start** (e.g. small print "App review sign-in"), with the same Edge Function behind it, and the review notes naming it. This is D-25's own fallback, applied early. Tell the owner (Open Question 2); Phase 11 re-checks. Alternative that avoids the form entirely: give Apple a real Google test account in the demo-account field (works only if Google 2FA does not trip review); keep the form as the backup. Google Play has the same demo-credential requirement in App access.

### Pattern 4: Device list and revoke (ACC-06, ACC-07)
- GoTrue exposes no list-sessions or revoke-one-session admin call: the session docs describe `auth.sessions` (primary key = the `session_id` claim in every access token) and `signOut` scopes; the search found no per-session admin endpoint [CITED: supabase.com/docs/guides/auth/sessions; searched, no endpoint found; MEDIUM].
- Recipe: `devices(session_id uuid pk, user_id, model, os, app_version, last_active, created_at)` written by the client on sign-in and on foreground (`expo-device` model + `Platform.Version`), RLS owner-only. `auth.sessions.user_agent` is the HTTP client's string, not a device model, so it is not the name source.
- `list_my_devices()` SECURITY DEFINER: join `devices` to `auth.sessions` where `user_id = auth.uid()`; mark current with `auth.jwt()->>'session_id'`. `revoke_my_session(p_session uuid)`: `delete from auth.sessions where id = p_session and user_id = auth.uid()` (cascades refresh tokens). "Sign out of all devices": `supabase.auth.signOut({ scope: 'global' })` (official). "Others": scope `'others'`.
- **Verify in a Wave 0 spike on the local stack** that the function owner can `delete from auth.sessions`; if not, move the delete into an Edge Function using the service role and a direct DB connection.
- Limit to document: a revoked device's access token stays valid until it expires (default 1 h) unless a call checks the session row [CITED: supabase.com/docs/guides/auth/sessions]. Do not add a session check to every RLS policy. Tell the user plainly "signed out within the hour".
- Pitfall: the current device row must be deleted on sign-out (server call before the wipe) and on deletion (cascade).

### Pattern 5: Alerts and push (ALR-01..06, ENV-19, D-09..D-12)
- **Evaluate in SQL, deliver in an Edge Function.** Deno cannot import `engine/`, and alerts must fire when the app is closed. Events write `alert_outbox` rows: AFTER INSERT triggers on `transactions` (large; partner large; over cap by `categories.monthly_cap`; low balance from account balance), on goals (reached), and a daily cron over `recurring_series` (bills due, lead time 1 day before, discretion item). The client computes default amounts with the pure `engine/alerts/defaults` and saves explicit numbers into `alert_settings`; the server only compares numbers. This mirrors the repo's SQL money-mirror precedent; add a mirror/pgTAP test for each comparison.
- **Drain:** pg_cron every minute calls `alerts-deliver` through pg_net with a Vault secret, exactly like `fx_sync_schedule` (`20260922000400`). The function, per user: reads `alert_prefs` (mode, quiet hours default 22:00-07:00, IANA time zone sent by the device on open), holds rows until quiet hours end (`deliver_after`), batches digest rows into one push at 08:00 local (cron fires every 15 minutes; send when local time is in [08:00, 08:15) and `last_digest_date < local date`; `AT TIME ZONE` handles DST), writes `alert_log`, then POSTs to `https://exp.host/--/api/v2/push/send` in batches of at most 100 [CITED: docs.expo.dev/push-notifications/sending-notifications].
- **Expo limits and behaviours:** 600 notifications/s/project; 4096-byte payload; check receipts ~15 minutes after sending (cleared at 24 h); on `DeviceNotRegistered` delete that token; set `channelId` (Android drops messages for a channel the device never created, so the app creates `alerts` and `digest` channels at start, before asking permission); `ttl` for a held alert; optional enhanced push security with an access token (turn it on; store token as a function secret) [CITED: same].
- **Partner large expense (D-12):** the receiver's own `large` amount decides, partner alerts have a per-person switch. Text is built server-side from `household_members.display_name`, `home_amount`/`home_currency` and category name; **never** note, name or payee. When `name_hidden` is true use the same fallback the app uses for hidden names (`householdMembers.ts`; invites already use `case when name_hidden then null`), and fall back to a generic "A member". Add a pgTAP test with a hidden-name member and a note containing a sentinel string; assert the sentinel is never in the payload.
- **Permission (D-09):** call `requestPermissionsAsync()` only inside the handler that switches on the first alert; create channels first; then `getExpoPushTokenAsync({ projectId })` using `Constants.expoConfig.extra.eas.projectId` [CITED: docs.expo.dev/push-notifications/push-notifications-setup]. If denied, keep the setting, show a calm line and `Linking.openSettings()`; the alert log still records.
- **Credentials (ENV-19):** FCM v1 service-account key uploaded to EAS and `google-services.json` in app config (owner step, needs a Firebase project); APNs key is generated by EAS on the first iOS build and needs the paid Apple account [CITED: docs.expo.dev push setup]. APNs is blocked on enrolment; build Android first and make the iOS path a recorded dependency (as the roadmap table already says).
- **Pitfall: tokens outlive the user.** Delete `push_tokens` for the device on sign-out (before the wipe) or the next person on that phone gets the previous user's alerts. Also delete on deletion (cascade).
- **Privacy:** alert text reaches Expo, then APNs/FCM. State it in the privacy copy and Phase 11 data declarations. Keep text to facts already specified. [ASSUMED: Expo's retention of payloads; verify in Phase 11]
- Pure `engine/alerts/defaults.ts` (D-10): typical single spend = median of absolute expense amounts over the trailing 3 months; large = 3 x median rounded half-up to the currency's minor unit; low balance = trailing 3-month outflow / 13 weeks. Minimum history before using it, say 30 expenses over 2 months (tune; ASSUMED). Flat fallback (about 200 large, 100 low) must scale by currency: 200 in JPY is trivial and in KWD is large, so define the flat numbers in EUR-equivalent and convert with the engine's existing EUR-routed conversion and ISO exponents, or table them per currency. Open Question 6.

### Pattern 6: Write-queue cap (SYN-03..05, D-27, D-28)
- The queue **is** TanStack's mutation cache: `shouldDehydrateMutation: m.state.status === 'pending'` (`src/data/cache/persister.ts`), persisted in chunks, restored and replayed with `resumePausedMutations` (`src/data/onlineManager.ts`). The "waiting to send" count is `useSyncStatus().queued` (counts every `pending` mutation, in flight included) feeding `SyncStatusLine` and `src/shell/header/SyncProblemLine.tsx`.
- SYN-03 and SYN-04 already have tests: `src/data/__tests__/idempotentRetry.test.tsx` ("D-88 timeout retry is idempotent"), `offlineWrite.test.tsx` ("WR-A13 mid-attempt when the app died is persisted, restored and replayed", "restart: survives dehydrate/rehydrate into a brand-new QueryClient and flushes with the same UUID"). Phase 10 should cite them in VERIFICATION, add one named SYN-03 test that kills mid-flush then resumes and counts server rows, and add a 500-entry persist test.
- Cap: pure `queueCap(queued) -> 'ok' | 'note' | 'blocked'` (400 note, 500 block) in `src/data/sync/queueCap.ts`. Apply at the **entry points** (the add sheet `TransactionSheet.tsx` and every other creating surface: bulk add, import finalize, clone month, recurring offers) through one shared guard hook; do not put it inside `mutationFn`. Block creates only; edits and deletes of queued rows coalesce (`coalesceDrafts.ts`) and must not be refused, because refusing them traps the user. The count in D-28's text uses the live number, not a literal 500 (Open Question 5 covers bulk import: an import of 600 lines should be refused up front with the same calm copy, or split).
- **Persistence size pitfall:** `persister.ts` chunks mutations and has an `oversizedSingle` path. 500 queued writes with large variables (imports) can exceed one secure-store value. Add the 500-entry persist/restore test with realistic payloads before shipping.
- The cap uses plain neutral styling (D-28): a `NoticeCard` variant, no amber (09-UI-SPEC).

### Pattern 7: Rate limits (ACC-13)
- Table `rate_limits(key text, window_start timestamptz, count int, primary key(key, window_start))` with RLS on and all client grants revoked, as `settlement_nudges` does. SECURITY DEFINER `rate_limit_hit(p_key, p_limit, p_window_seconds) returns boolean` doing a fixed-window `insert ... on conflict do update set count = count + 1 returning count`; revoke execute from anon/authenticated and call it with the service role only. Purge old windows in an existing nightly cron.
- Key per user id (from the verified JWT, never the body) per function; for the unauthenticated reviewer endpoint use IP + email. Return 429 with `Retry-After`; the client maps 429 to a calm line.
- Starting limits (ASSUMED, owner may tune): delete-account 3/h; devices revoke 30/h; reviewer-signin 5 per 15 min; read-pdf-statement and resolve-rate only if not already limited (check `read-pdf-statement/limits` first); push-register 20/h. Gateway `verify_jwt` stays `true` for user functions.

### Pattern 8: Account deletion (ACC-10, DAT-04, D-17..D-20)
- Existing: `src/services/account/deleteAccount.ts` (server confirms, then `performSignOut` wipes), `supabase/functions/delete-account/` (admin `deleteUser`, 08-14 before-delete trigger does ownership hand-off, personal erasure, "Former member"), `DeleteAccountScreen.tsx`.
- Add: (1) **Save a copy** step reusing `csvExport.ts` (iOS share sheet, Android folder picker). (2) **forgetGoogleOnAccountDeletion(email)** (`src/services/auth/google.ts`) called after the server confirms and before the wipe; capture the email **before** the user is gone. (3) Backup wording (30 days). (4) Deletion log.
- **Deletion log, the two traps.** (a) Write it in an **AFTER DELETE trigger on `auth.users`** (same transaction as the delete), not from the Edge Function before calling `deleteUser`; otherwise a failed delete leaves a live user in the log and a later restore deletes a real person. (b) The log is in the same database a restore overwrites, so a restore from backup X loses deletions made after X. Resolve with the backups themselves: each dump carries the log, the log is append-only and pruned at 35 days (needs to outlive only the 30-day backup horizon), so **the newest dump's log covers every deletion up to that dump**; the residual gap is deletions in the last <24 h before the incident. Close that gap by also having `delete-account` append a tiny `deletions/<uuid>` object to the same R2 bucket (optional hardening, lifecycle 35 days). Procedure for restore: apply `delete from auth.users where id in (log)` **before** anything reads the restored data; the delete trigger fires the same ownership/erasure rules.
- **Completeness:** deletion must purge every table 08.1 and 09 added. Add a pgTAP test that creates a user with a row in every public table that references `auth.users`/`households`, deletes the user, and asserts zero rows; plus extend the existing `exportManifest` guard idea ("every table is in `EXPORT_MANIFEST` or `NOT_USER_DATA`") to a `DELETION_COVERAGE` list. Statement-upload storage objects are already removed by the function.
- Android token revoke for Google and Apple "revoke" duties are Phase 11 compliance; the function already scopes to the caller.

### Pattern 9: Month archive (DAT-01, D-13..D-16)
- Table `archived_months(user_id, month text 'YYYY-MM', archived_at, primary key(user_id, month))`, RLS owner-only, added to `EXPORT_MANIFEST`. Personal, so partners are untouched (D-15).
- **Filtering belongs in the Activity view layer only.** The Activity month switcher is under `src/features/record/activity` (`ActivityScreen.tsx`, `header/ActivityHeaderBands.tsx`); the level-4 `searchAllMonths` feature is the search. Hide archived months there with a pure `engine/archive` helper. Do not touch `src/data/queries/*` or anything under `src/features/decide`, Grow, Insights, balances: they must keep reading the full cache. Archived months show in the Archive list with income and spend from a pure `monthTotals` (reuse the same maths Activity already uses).
- Read-only (D-14) is a client guard (disable edit/delete/add into that month for the archiver). Do not add a server trigger: queued offline writes from another device would then be refused and clutter the failed list. Partners can still edit shared rows (D-15). Disclose in the plan that read-only is a UI promise, not a database rule.
- **Decide-unchanged test (D-13):** (1) a guard test that no module under `src/features/decide`, `src/engine/decide` or the snapshot builders imports `archive` state (same style as `exportManifest.test.ts`); (2) a fixture test that builds the v3 Decide inputs (`src/features/decide/snapshot/v3/buildInputsParts.ts` lineage) from the same cache with an empty and a populated `archived_months` and asserts deep equality of inputs and engine output; (3) fast-check: random archive sets leave the output equal.
- Registry: `{ id: 'archive', area: 'System', minLevel: 4, needsHousehold: false, holdsData: null, glyph: 'history' }`; the transcribed level-map test parses `09-LEVEL-MAP.md` and fails on drift, so update the owner-signed map (and its guard) in the same plan or the test fails. Add `features.items.archive.label|sub` copy.

### Pattern 10: CSV export coverage and import (DAT-02, DAT-03)
- Export: `EXPORT_MANIFEST` already lists the 08/08.1 tables (including `household_spend_rules`, joint-account columns). Planner task: diff manifest against all current migrations including 09 (plans) and 08.1 additions through `20261125000900`, using the existing guard test plus a new migration-aware check (the guard only reads `src/db`, so a table with no `src/db` module can slip by). Export as the signed-in user so RLS limits rows (CMP-F18 note in the manifest).
- Serializer already prefixes `'` on text starting `= + - @` but leaves plain numbers (`csvSerialize.ts` `INJECTION_LEAD`/`PLAIN_NUMBER`). **Import must reverse that** (strip a leading `'` on text cells) or round-trips break.
- Import template = export columns for `goals`, `debts`, `holdings`/investments and `accounts` (confirm table names in `EXPORT_MANIFEST` and `src/data/mutations/growGoals.ts`, `growDebts.ts`, `growHoldings.ts`, `accounts.ts`). Honour `id` as an idempotency key: a row whose id already exists for this user is reported "already there", not duplicated, so export-then-import is safe. Validate every cell in pure engine code (integer minor units, no `parseFloat`; reuse `engine/money` parsing); reject whole file on header mismatch with a plain message; reuse the import preview components.
- Property test (fast-check): `import(export(rows)) == rows` for generated rows with commas, quotes, newlines, leading `=`/`-`, unicode, negative numbers.

### Pattern 11: Diagnostic export (DAT-06)
- Content (discretion): app version, build, OS and device model, locale/region, feature level, plan state, sync counters (queued, failed, conflict kinds), queue age, last-synced time, online/reachability history from `queueDiagnostics.ts`, error codes, counts of rows per table (counts only). **No** amounts, payees, notes, names, ids of other users. A single `DIAGNOSTIC_FIELDS` allow-list; the screen renders exactly that list (the "see exactly what is sent" link) and the payload is built from the same list so the preview cannot drift from what is sent. Sending = share sheet or mailto to the support address, user's choice; never an automatic upload. Guard test: payload keys subset of the allow-list; a sentinel-string test proves no record text leaks.

### Pattern 12: Wallet readers (IMP-06, D-21..D-24)
Plug in as named format profiles ahead of the generic column matcher in `src/engine/statement/profile.ts`/`sniffFormat.ts`; header signature detection picks the reader. Starting schemas (all **LOW until real files arrive**; sources are third-party parsers and forum posts, not vendor specs):

| Wallet | Header columns | Conventions to confirm in fixtures |
|--------|----------------|------------------------------------|
| Wise | `TransferWise ID, Date, Amount, Currency, Description, Payment Reference, Running Balance, Exchange From, Exchange To, Exchange Rate, Payer Name, Payee Name, Payee Account Number, Merchant, Card Last Four Digits, Card Holder Full Name, Attachment, Note, Total fees` [CITED: mail.kde.org/pipermail/kmymoney/2023-March/004062.html; a ledger-autosync Wise plugin keys on the same fields] | Date format (believed `dd-MM-yyyy`), Amount signed, `Total fees` separate column, fee rows described "Wise Charges for:", conversion rows via `Exchange From/To/Rate`, one file per currency balance [ASSUMED] |
| Revolut (personal) | `Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance` [CITED: sources.debian.org ledger-autosync revolut.py; Revolut community thread] | Dates `YYYY-MM-DD HH:MM:SS`; skip `State` not `COMPLETED`; `Fee` is a separate non-negative column; `Type` EXCHANGE rows come as a pair (one per currency) [ASSUMED]; Revolut stopped exporting exchange rates in Oct 2021 per a community thread, so a conversion's rate must be derived from the paired amounts [CITED: community.revolut.com thread]; business exports use a different header (Paid in/Paid out) and are out of scope |
| PayPal | `Date, Time, TimeZone, Name, Type, Status, Currency, Gross, Fee, Net, From Email Address, To Email Address, Transaction ID, ... Balance, ... Balance Impact` [CITED: developer.paypal.com/reports/activity-download: 87 fields, `Gross` includes fees, `Net` typically gross minus fees, `Balance Impact` Debit/Credit/Memo, `Date` localized e.g. MM/DD/YYYY] | The page does **not** say whether Gross/Fee/Net are signed or how conversions appear; conversions are believed to be two rows of Type "General Currency Conversion" sharing a Reference Txn ID [ASSUMED]; `Memo` rows must not hit the balance; localized dates and thousands separators vary by account country; one file mixes currencies |

- Maths: per line store gross, fee, net with `net = gross + fee` (signs per fixture); payment saved at gross, fee as its own linked expense in a "Fees" category (`fx_fee_of` and `transfer_id` already exist as transaction columns for exactly this: conversion fee and transfer link), so the account balance equals the net (D-23). A property test asserts `sum(gross lines) + sum(fee lines) == net balance movement` per currency.
- Multi-currency (D-22): one account per currency, suggested in preview with a switch each and a link-existing option; nothing created without a tap; reuse `ClosingBalancePrompt`, `SuggestionsStep` and the IMP-05 FX-truth conversion in `engine/statement/convert.ts`.
- **Owner step (D-24):** collect one real export of each wallet covering a payment with a fee, a currency conversion, a refund, a pending/failed row, and a foreign-currency card payment; strip names, emails, IBANs and card digits; save under `src/engine/statement/wallets/__fixtures__/`. Plan the reader work in two stages: the schema-driven skeleton plus tests on synthetic rows now, and fixture-driven finalisation when files arrive, so the phase is not blocked.

### Anti-Patterns to Avoid
- **Blur or permanent FLAG_SECURE** for the cover (violates D-04, breaks screenshots).
- **Putting the cap inside `mutationFn`** (it would fail a replayed queued write after a restart).
- **A deletion log written before `deleteUser`** (can list live users).
- **Calling `supabase.auth.signInWithPasskey`-style or admin session APIs that do not exist** for per-session revoke; use the RPC.
- **Importing `engine/` into an Edge Function** to evaluate alerts (breaks purity and Deno build); keep SQL evaluation + mirror tests.
- **Putting the service-role key in GitHub Actions** for the reviewer reset; use pg_cron.
- **Editing a backup in place** (D-19): never.

## Backups (ENV-16, DAT-05, D-05..D-08)

### Storage choice: Cloudflare R2
| Factor | R2 | AWS S3 |
|--------|----|--------|
| Cost for ~30 daily dumps (tens of MB each) | Free tier 10 GB-month, 1 M Class A, 10 M Class B ops; $0.015/GB-month beyond; **no egress fees**; no minimum storage duration on Standard [CITED: developers.cloudflare.com/r2/pricing] | A few cents a month; new-account free allowance is time-limited [ASSUMED] |
| 30-day auto delete | Object Lifecycle rule (dashboard, `wrangler r2 bucket lifecycle`, or S3 `PutBucketLifecycleConfiguration` with `Expiration: {Days: 30}`); objects removed typically within 24 h of expiry [CITED: developers.cloudflare.com/r2/buckets/object-lifecycles] | Native lifecycle |
| US region | Jurisdiction `us` guarantees US storage; location hint `wnam` (Western North America) is best-effort and only honoured at first creation of the bucket name [CITED: developers.cloudflare.com/r2/reference/data-location]. Recommend creating the bucket with the `us` jurisdiction (uses the jurisdiction-specific endpoint) | `us-west-2` exact match |
| Account | The repo's dependency register already lists a Cloudflare account (DNS, email routing, company-owned), so **no new account**; R2 needs enabling and likely a payment method [ASSUMED] | New AWS account |
| Least-privilege CI token | R2 API tokens are Object Read/Write or Read Only at bucket scope; no write-only [ASSUMED] | PutObject-only IAM policy possible |
Recommendation: R2, bucket-scoped API token for the backup job (Object Read and Write), a separate read-only token for the restore job. Record the Cloudflare R2 enablement and tokens in `docs/dependency-register.md` (D-06 owner step, but it is the existing account). Honest tradeoff: backups share a vendor account with DNS; mitigate with a scoped token and MFA on the Cloudflare account.

### Taking the dump from GitHub Actions on the Free plan
- Supabase direct host `db.<ref>.supabase.co:5432` is **IPv6-only on Free**; GitHub Actions is listed by Supabase as IPv4-only; the fix is the **session pooler**, IPv4 on every plan: host `aws-<index>-<region>.pooler.supabase.com:5432`, user `postgres.<project-ref>`; copy the exact host from the dashboard Connect dialog because the index cannot be derived [CITED: supabase.com/docs/guides/database/connecting-to-postgres; supabase.com/docs/guides/troubleshooting/supabase--your-network-ipv4-and-ipv6-compatibility-cHe3BP]. The IPv4 add-on (about $4/month) is the other route and is not needed. Supabase's docs do not explicitly confirm pg_dump through the session pooler, so the manual rehearsal (D-08, first run) must prove it [CITED: same page; MEDIUM].
- Store the pooler connection string as an Actions secret (`SUPABASE_DB_URL_POOLER`), never the repo. Put the `age` public key in a variable; the private key never in the backup workflow.
- Flags (confirm in the manual rehearsal): `pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=auth --exclude-table-data='auth.sessions' --exclude-table-data='auth.refresh_tokens' --exclude-table-data='auth.audit_log_entries' --exclude-table-data='auth.one_time_tokens'` then `age -r "$AGE_PUBLIC" -o fincwin-YYYYMMDD.dump.age`, upload with the S3 API to R2 under `daily/`. The `auth` schema is needed so `auth.users` and identities (Apple/Google links) come back; `storage` objects are transient statement PDFs and are skipped (note this). Do not dump Vault secrets or the `cron` schema. Dump size will be small; set a floor check (fail the job if the dump is under a sane minimum or the row count of `auth.users` is zero).
- `supabase db dump` is the CLI alternative; it excludes managed schemas by default and runs through Docker. Prefer plain `pg_dump` for control. Version: install `postgresql-client` of the server's major from PGDG, since the runner's default can be older [ASSUMED].
- Schedules: GitHub fires cron only from the default branch (the repo already notes this for `nightly.yml`). Free-plan Actions minutes are ample (~3 min/day). Add the same cheap `curl -s -o /dev/null $SUPABASE_URL/rest/v1/` keep-alive call to the backup workflow; the CONTEXT mentions an existing keep-alive but none was found under `.github/workflows` (only STATE.md and the register mention it), so confirm where it lives and whether it still runs (Open Question 7). Add a failure notification: a failed run emails the owner through GitHub's default notifications, and a "no new object in 36 h" check inside the monthly job catches silent schedule stops.

### Restore rehearsal and monthly check
- **Target: the Supabase local stack**, not a bare Postgres service container. The schema depends on Supabase roles (`anon`, `authenticated`, `service_role`), `auth.uid()`, the `extensions` schema, pg_cron, pg_net and Vault; the `rls` CI job already runs `supabase db start` with CLI 3.1.0 and `SUPABASE_INTERNAL_IMAGE_REGISTRY: public.ecr.aws`. Reuse that exactly.
- Procedure: decrypt (private key from a protected GitHub Environment secret used only by the restore workflow, plus an offline copy held by the owner; if the private key is lost, backups are unreadable: record that in the runbook); `supabase db start` (migrations from git create the schema); `pg_restore --data-only --disable-triggers` into it for the `public` data, restore `auth.users`/`auth.identities` data, **apply the deletion log**, then run checks: row counts per table within tolerance of the live row counts captured by the backup job (write a `manifest.json` with counts next to the dump, also encrypted or counts-only), a few spot checks (sum of a known account balance recomputed, latest `transactions.created_at`, `auth.users` count). Exit non-zero and let GitHub email the owner on failure. Triggers and generated columns are the risky part: the first manual run decides `--disable-triggers` vs trigger-enabled restore (Supabase's own restore guide notes triggers firing during restore is "not ideal but usually harmless" and object-already-exists errors are expected) [CITED: supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore].
- Write the manual rehearsal into `docs/ops/backup-restore.md` as the written record D-08 requires, with date, dump name, row counts, spot-check figures and any flag changes.
- Restore into production is a separate, human-run runbook (new project or resetting the DB), including reapplying Edge Function secrets, Vault secrets, cron jobs (migrations recreate them but Vault values do not), auth provider settings (not in the dump), and the deletion-log step.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Biometric prompt | Native bridge | `expo-local-authentication` | Maintained, handles Class 2/3 and iOS policies |
| PIN secrecy | Custom cipher/KDF | salt + SHA-256 in SecureStore, attempt counter | The 10^6 PIN space is the limit; hardware store is the boundary |
| Push transport | APNs/FCM HTTP clients | Expo push service | One API, credentials in EAS, receipts and error codes |
| Encryption of the dump | openssl recipe | `age` (public-key) | No passphrase handling in CI |
| Dump scheduling | Server loop | GitHub Actions cron | Already used for nightly jobs |
| Rate limiting | In-memory counters in Edge Functions | Postgres counter RPC | Functions are stateless and multi-instance |
| CSV parsing | Regex split | `src/engine/csv/tokenize.ts` | Quotes, newlines, BOM, delimiters already handled |
| Money in wallet readers | Floats | `engine/money` integer parse and half-up | Project rule |
| Notification scheduling for digests | Per-user timers | pg_cron every 15 min over stored time zones | DST safe via `AT TIME ZONE` |
| Share/save CSV | New sharing library | `csvExport.ts` (Share on iOS, folder picker on Android) | Already built and tested |

**Key insight:** every new capability has an existing sibling in this repo (cron+net function, manifest guard, wipe handler, import profile, nudge counter table). Copy the sibling's shape, tests included.

## Runtime State Inventory

This is not a rename phase, but archive, deletion and export must reach state that code greps miss.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Every table 08.1 added (`household_spend_rules`, joint-account columns) and 09 plan tables; new Phase 10 tables | Export (manifest), deletion completeness pgTAP, archive untouched |
| Live service config | Supabase Auth email provider setting (signups off), auth config not in dump; Vault secrets; Edge Function secrets (Expo access token, reviewer config); Cloudflare R2 bucket and lifecycle rule | Record in `docs/ops`, not in git; re-create on restore |
| OS-registered state | Scheduled local notifications (decide reminders) use the same permission; Android notification channels (`alerts`, `digest`) | Create channels at boot; clear tokens on sign-out |
| Secrets/env vars | New: `SUPABASE_DB_URL_POOLER`, `R2_*` keys, `AGE_PUBLIC_KEY`, `AGE_PRIVATE_KEY` (restore env only), Expo push access token, FCM service-account JSON (EAS), `EAS_PROJECT_ID` | `.env.example` and the dependency register; gitleaks allow-list only by exact name (existing rule) |
| Build artifacts | New native dependency (`expo-local-authentication`) and possible local Expo module -> new dev build and a new preview APK; OTA cannot carry it | Rebuild at phase end per the preview-APK habit |

## Common Pitfalls

### Pitfall 1: Deletion log lost or wrong on restore
**What goes wrong:** deleted users reappear, or live users are deleted. **Why:** log in the restored DB, or written before the delete succeeds. **Avoid:** AFTER DELETE trigger on `auth.users`; apply the newest dump's log; optional off-DB R2 marker. **Warning signs:** log row count differs from deleted-user count.

### Pitfall 2: Direct DB host from Actions
"Network is unreachable" (IPv6). Use the session pooler string and user `postgres.<ref>`.

### Pitfall 3: Restore into a bare Postgres
Missing roles/extensions/`auth` functions make the schema fail to load. Restore into the Supabase local stack.

### Pitfall 4: Lost age private key
Backups unreadable. Keep an offline copy and test decryption in the monthly job.

### Pitfall 5: Push to the wrong person
Token not removed on sign-out. Delete on sign-out and on `DeviceNotRegistered`.

### Pitfall 6: Android notification channel missing
Expo drops a message for a channel the device never created. Create channels before the first token.

### Pitfall 7: Lock timing and cold start
`backgroundedAt` kept only in memory is lost on a kill, so a killed app would open unlocked. Persist `backgroundedAt` (SecureStore or AsyncStorage) and lock on cold start when lock is enabled.

### Pitfall 8: Biometric prompt triggers AppState inactive
The OS Face ID dialog makes the app `inactive` on iOS, which would flash the cover and re-trigger the lock timer. Ignore state changes while an `authenticateAsync` call is pending.

### Pitfall 9: Archive leaking into money answers
Filtering in the data layer changes Decide, balances, goals, Insights. Filter in the view layer; prove with the invariance tests.

### Pitfall 10: CSV round-trip breaks on the injection guard
Export prefixes `'`; import must strip it, and negative numbers must stay numbers.

### Pitfall 11: Queue cap blocks the wrong thing
Blocking edits/deletes or replayed writes traps the user. Guard entry points only; bulk import checks count up front.

### Pitfall 12: Free-plan pause
A paused project takes the live app offline (STATE.md). The backup job's REST ping plus pg_cron may not count as activity; confirm in Open Question 7.

### Pitfall 13: Reviewer account on the Decide tester list
Add to `docs/ops/decide-never-on.json`; the nightly reset must not touch tester state.

### Pitfall 14: Revoked device still reads for up to an hour
Expected with a 1 h JWT; say so in copy and the runbook.

## Code Examples

### Rate limit RPC (sketch)
```sql
-- fixed window; service-role only
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
        v_count int;
begin
  insert into public.rate_limits(key, window_start, count) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into v_count;
  return v_count <= p_limit;
end $$;
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
```

### Deletion log trigger (sketch)
```sql
create or replace function public.log_account_deletion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.account_deletion_log(user_id) values (old.id) on conflict do nothing;
  return old;
end $$;
create trigger auth_users_after_delete_log after delete on auth.users
  for each row execute function public.log_account_deletion();
```
(Confirm in the local stack that a trigger can be created on `auth.users` from a migration; the 08-14 before-delete trigger already is, so the pattern is proven in this repo.)

### Push send (Edge Function, Deno)
```ts
// Source: docs.expo.dev/push-notifications/sending-notifications
const res = await fetch('https://exp.host/--/api/v2/push/send', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` },
  body: JSON.stringify(batch.map((m) => ({ to: m.token, title: m.title, body: m.body, channelId: m.channel, ttl: 86400, data: { alertId: m.id } }))),
});
// batch <= 100; read tickets; schedule getReceipts ~15 min later; drop tokens on DeviceNotRegistered
```

### Backup job (shape)
```yaml
on: { schedule: [{ cron: '23 4 * * *' }], workflow_dispatch: {} }
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - run: sudo apt-get install -y age postgresql-client-17   # add PGDG repo first; match server major
      - run: pg_dump "$DB_URL" -Fc --no-owner --no-privileges -n public -n auth --exclude-table-data='auth.sessions' --exclude-table-data='auth.refresh_tokens' -f db.dump
        env: { DB_URL: ${{ secrets.SUPABASE_DB_URL_POOLER }} }
      - run: age -r "${{ vars.AGE_PUBLIC_KEY }}" -o "fincwin-$(date -u +%F).dump.age" db.dump && shred -u db.dump
      # upload with aws-cli/rclone against the R2 S3 endpoint, then curl the REST keep-alive
```
Pin every action by SHA as the existing workflows do.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hidden-features rule = 2.3.1 | 2.5.19, 2.3.1 is accurate metadata | Apple update 2026-10-16 [CITED] | Cite 2.5.19 in Phase 11 notes |
| Supabase CLI no-target = linked | No target = local; `--remote` for prod | CLI 3, 2026-11-17 [CITED: CLAUDE.md] | Backup/restore scripts must pass explicit targets |
| `expo-haptics` old names | `*Async` only | SDK 57 [CITED: CLAUDE.md] | Lock `hapticTap` uses the async names |

**Deprecated/outdated:** `expo-screen-capture` `removeScreenshotListener` (use `subscription.remove()`); not needed here.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `postgresql-client` major must be installed from PGDG to match the server | Backups | Dump fails on version mismatch; found on the first manual run |
| A2 | R2 needs a payment method on file; R2 tokens cannot be write-only | Backups | Owner step wording; slightly weaker token scope |
| A3 | `pg_dump` works through the session pooler | Backups | Must fall back to the IPv4 add-on (~$4/mo) or the CLI's transaction pooler path; proven in rehearsal |
| A4 | JS-only AppCover wins the iOS/Android snapshot race | Pattern 2 | Cover missing in switcher; fallback is the native module |
| A5 | Function owner can `delete from auth.sessions` | Pattern 4 | Move the delete into an Edge Function with service role |
| A6 | PayPal conversions are two rows of "General Currency Conversion"; Wise date `dd-MM-yyyy`; Revolut EXCHANGE paired rows | Pattern 12 | Reader rewritten against real fixtures (D-24) |
| A7 | Expo does not retain push payload content beyond delivery | Pattern 5 | Privacy copy changes in Phase 11 |
| A8 | Rate-limit numbers (3/h delete, 5/15 min reviewer, etc.) | Pattern 7 | Owner tuning |
| A9 | Default alert minimum history (30 expenses / 2 months) | Pattern 5 | Defaults feel wrong for new users |
| A10 | PIN SHA-256+salt in SecureStore is acceptable for a 6-digit app lock | Pattern 1 | Owner may want a slower KDF; adds a dependency |
| A11 | GitHub scheduled workflows are not auto-disabled on this private repo | Backups | Silent backup stop; monthly "no new object" check mitigates |
| A12 | Existing keep-alive exists somewhere | Backups | Project pauses after a week idle |

## Open Questions (RESOLVED)

1. **10th wrong PIN: what exactly happens to unsent writes?**
   - Known: D-03 says sign in again; the normal sign-out wipes the write queue.
   - Unclear: does "sign in again" wipe the phone copy?
   - Recommendation: re-authenticate with Apple/Google; same user keeps the copy and sets a new PIN; different user runs the normal wipe path.
   - **RESOLVED:** D-29 (owner 2026-11-22): same user keeps the copy; different user gets the normal wipe. Plans 10-11, 10-21.
2. **Hidden 7-tap vs visible link for reviewers.** Recommend the visible link (2.5.19). Owner to confirm.
   - **RESOLVED:** D-30: visible link. Plans 10-04, 10-25.
3. **Backup store: R2 recommended.** Confirm Cloudflare R2 on the existing company account and whether to use the `us` jurisdiction.
   - **RESOLVED:** D-31: R2, existing account, `us` jurisdiction. Plans 10-01, 10-20.
4. **Push provider: Expo push service.** Owner to accept that alert text passes through Expo (disclosed in Phase 11).
   - **RESOLVED:** D-32: Expo push accepted; disclosure in Phase 11. Plans 10-22, 10-23.
5. **Queue cap on bulk import.** Refuse an import that would exceed the cap up front, or allow overshoot? Recommend refuse with the calm message.
   - **RESOLVED:** Claude's Discretion default: refuse up front with the calm message. Plan 10-13.
6. **Flat alert defaults for non-major-unit currencies.** Recommend EUR-equivalent about 200/100, converted.
   - **RESOLVED:** Claude's Discretion default: EUR-equivalent ~200/~100, converted. Plan 10-05.
7. **Where is the existing keep-alive, and does a backup ping count as activity?** Not found in `.github/workflows`.
   - **RESOLVED:** none exists; a daily keep-alive job is added in plan 10-20 (`backup.yml`).
8. **Android biometric strength.** Recommend `'strong'`.
   - **RESOLVED:** Claude's Discretion default `'strong'`. Plan 10-11.
9. **Archive read-only is client-only.** Confirm the owner accepts no server enforcement.
   - **RESOLVED:** Claude's Discretion default: client-only. Plan 10-24.
10. **Wallet fixtures.** Owner action; reader finalisation depends on it.
   - **RESOLVED:** owner step in plan 10-01; readers finalised in 10-28.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Jest, scripts | yes | v24.15.0 | — |
| Docker Desktop | Local Supabase stack, restore rehearsal | yes | 29.7.2 | — |
| Deno | Edge Function tests | yes | WinGet install (version not probed) | — |
| GitHub CLI | Workflow dispatch, secrets | yes | present | — |
| Supabase CLI | migrations, `supabase test db` | via `npx` (3.2.0 resolvable; CI pins 3.1.0) | 3.x | — |
| psql / pg_dump / age on the dev machine | Manual rehearsal | no | — | Run inside Docker (`postgres:17` image with `pg_dump`/`pg_restore`, `age` image), or on the runner via `workflow_dispatch` |
| Cloudflare R2 | Backups | not provisioned | — | Owner step; S3 as alternative |
| Firebase project + FCM v1 key | ENV-19 Android | not provisioned | — | Owner step; blocks real push test |
| Apple Developer account (APNs) | ENV-19 iOS | not enrolled | — | Android first; iOS recorded as blocked |
| Real PayPal, Wise, Revolut exports | IMP-06 | not available | — | Synthetic fixtures for the skeleton; owner step for finalisation |
| New EAS dev build | local-auth, any native module | needed | — | Cannot ship via OTA |

**Missing with no fallback:** owner-provided wallet files and Firebase/R2 setup (steps, not code blockers; plan them as Wave 0 owner tasks).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest `~29.7.0` (package.json; CLAUDE.md says 30.x, the repo pins 29.7) with jest-expo, RNTL, fast-check `^4.10.2`; pgTAP via `supabase test db`; `deno test` for Edge Functions |
| Config file | `jest.config.js`, `jest.engine.config.js` (engine, coverage threshold, no React), `jest.realtime.config.js` |
| Quick run command | `npx jest <path>` / `npx jest -c jest.engine.config.js src/engine/<dir>` |
| Full suite command | `npm test` plus `supabase test db` and the Deno tests (milestone only, per the "milestone test runs" rule) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACC-06/07 | `list_my_devices` marks current; revoke deletes only own session | pgTAP | `supabase test db` | Wave 0 |
| ACC-08/09 | backoff schedule, PIN verify, lockUntil persistence, timing options | unit (pure + mocked SecureStore) | `npx jest src/services/lock` | Wave 0 |
| ACC-08 | LockGate locks after N minutes, cold start locks, ignores prompt-induced inactive | RNTL | `npx jest src/features/lock` | Wave 0 |
| DSG-08 | AppCover shown on inactive/background, no text | RNTL + device check | `npx jest src/features/lock` + manual | Wave 0 (device check manual-only: OS snapshot) |
| ACC-10/DAT-04 | delete flow order: copy, server confirm, forgetGoogle, wipe; offline refusal | unit | `npx jest src/services/account src/features/you` | Partly exists |
| ACC-10 | deletion purges every table; deletion log written atomically | pgTAP | `supabase test db` | Wave 0 |
| ACC-11 | allow-list accepts listed, refuses others identically; rate limit | deno test + pgTAP | `deno test supabase/functions/reviewer-signin` | Wave 0 |
| ACC-13 | `rate_limit_hit` window, limit, reset | pgTAP | `supabase test db` | Wave 0 |
| SYN-03 | kill mid-flush then resume: one server row | jest | `npx jest src/data/__tests__/idempotentRetry.test.tsx` | Exists; add named case |
| SYN-04 | restart restore and replay | jest | `npx jest src/data/__tests__/offlineWrite.test.tsx` | Exists |
| SYN-05 | 399/400/499/500 thresholds, entry points blocked, edits allowed, 500-entry persist | unit + jest | `npx jest src/data/sync src/data/__tests__/persister` | Wave 0 |
| ALR-01..04 | settings validation, defaults (D-10), quiet-hour hold, digest 08:00 local across DST | engine + deno + pgTAP | `npx jest -c jest.engine.config.js src/engine/alerts` | Wave 0 |
| ALR-05 | alert log written on raise even when push denied | pgTAP | `supabase test db` | Wave 0 |
| ALR-06 | partner push text has no note/payee, hidden-name fallback, receiver threshold, switch off | deno + pgTAP | `deno test supabase/functions/alerts-deliver` | Wave 0 |
| ENV-19 | credentials present (EAS) | manual-only: owner credentials | checklist in VERIFICATION | n/a |
| DAT-01 | archive hides from switcher/search; Decide output identical | engine + guard + property | `npx jest src/engine/archive src/features/decide/__tests__/archiveInvariance` | Wave 0 |
| DAT-02 | every table in manifest; export covers 08.1 and 09 tables | jest guard | `npx jest src/data/__tests__/exportManifest.test.ts` | Exists; extend |
| DAT-03 | import round-trip, id idempotency, quote and `'` handling | fast-check | `npx jest src/engine/dataCsv` | Wave 0 |
| DAT-05/ENV-16 | backup job succeeds; monthly restore check passes | CI workflow + manual first run | `gh workflow run backup.yml` | Wave 0 |
| DAT-06 | payload keys subset of allow-list, sentinel absent | unit | `npx jest src/features/diagnostic` | Wave 0 |
| IMP-06 | each reader maps fixture rows; gross/fee/net balance property; conversion pair linked | engine + fixtures | `npx jest -c jest.engine.config.js src/engine/statement/wallets` | Wave 0 (needs owner fixtures) |

### Sampling Rate
- **Per task commit:** the quick command for the touched directory.
- **Per wave merge:** `npx jest` over touched areas plus `supabase test db` when migrations changed (local stack; per-plan full runs are avoided by the owner's milestone rule).
- **Phase gate:** full Jest, `supabase test db`, Deno tests, one manual backup+restore rehearsal with written record, device checks (lock, cover, push) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/services/lock/__tests__/`, `src/features/lock/__tests__/` for ACC-08/09/DSG-08
- [ ] `supabase/tests/database/*` pgTAP for devices, rate limit, deletion log/completeness, alerts, archive RLS
- [ ] `supabase/functions/{alerts-deliver,reviewer-signin}/*.test.ts`
- [ ] `src/engine/{alerts,archive,dataCsv,statement/wallets}` with exhaustive tests (engine branch-coverage gate applies)
- [ ] Decide-invariance test and import-guard test
- [ ] Synthetic wallet fixtures now; real ones from the owner later
- [ ] Framework install: `npx expo install expo-local-authentication` (jest mock in `jest.setup.ts`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Apple/Google only; reviewer path server-side allow-list, email signups off, rate-limited; biometric via OS |
| V3 Session Management | yes | `auth.sessions` list/revoke, global sign-out, 1 h token limit documented, token cleanup on sign-out |
| V4 Access Control | yes | RLS owner-only on every new table; pgTAP two-user tests; SECURITY DEFINER RPCs check `auth.uid()` |
| V5 Input Validation | yes | Pure engine validators for CSV import; header allow-list; no `parseFloat`; allow-list email normalisation |
| V6 Cryptography | yes | `age` for backups; SecureStore for PIN; `expo-crypto` random salt; nothing hand-rolled |
| V8 Data Protection | yes | Encrypted backups, 30-day retention, deletion log reapply, no note/payee in push, diagnostic allow-list |
| V13 API and rate limits | yes | `rate_limit_hit`, `verify_jwt`, caller id from token, not body |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| PIN brute force | Spoofing | Backoff, 10-try re-auth, counter in SecureStore |
| Push to the wrong user after sign-out | Information disclosure | Delete token on sign-out; clear on `DeviceNotRegistered` |
| Backup theft | Information disclosure | `age` public-key encryption; bucket-scoped tokens; 30-day expiry; private key offline |
| Deleted user resurrected by restore | Repudiation/Integrity | Deletion log reapplied before use |
| Reviewer endpoint abuse | Elevation of privilege | Allow-list, uniform refusal, rate limit, email signups off, never on Decide tester list |
| CSV formula injection (export) and malformed import | Tampering | Existing `'` guard (reverse on import); strict validation |
| Info leak in app switcher | Information disclosure | Plain cover; device-verified |
| Service key exposure | Elevation | Keep service role out of CI (pg_cron reset); gitleaks exact-name allowlist |
| Session left alive after revoke | Spoofing | Documented 1 h bound; sign-out clears tokens |

## Project Constraints (from CLAUDE.md)

- `engine/` imports nothing from `db/`, `state/`, `services/`, `ui/` or `react`; branch-coverage gate fails CI. Default alert amounts, archive rules, wallet parsing and CSV import validation go in `engine/`.
- Money is integer minor units with explicit rounding; never floats; no `parseFloat`.
- Expo SDK 57 pins; New Architecture only; `expo-haptics` async names only; Expo Go unusable (new dev build for `expo-local-authentication`).
- Supabase: do **not** use the Supabase MCP connector; use CLI with `SUPABASE_ACCESS_TOKEN` from the main checkout's `.env.local`; production is the only project; migrations run on the local stack first; push through `npm run supabase:db:push` (preflight, `--remote`, `--yes` unattended) from `C:\dev\fincwin`, not a worktree; CLI 3: no target means local.
- Compliance voice: no "advice", "recommendation", "you should" in copy; declarative; the app holds no money; sign-in with Apple mandatory; in-app deletion must truly purge.
- Design: tokens only, no gradients/blur/other shadows, own icon set (`npm run check:icons`), six spacing steps, 52/64 rows, 36/48 tiles; state colours only in badges/cards with symbol and word; red only for Delete account.
- Submission hygiene outranks content framing (IAP attachment, disclosure copy, support URL, a fresh purchase in the demo video); reviewer access fits this: documented, visible, working.
- Migrations: every one tested on the local stack; production changes need `--yes` unattended.
- Quality: engine mutation score is a pre-launch gate, not per phase (owner, 2026-11-19).

## Sources

### Primary (HIGH confidence)
- developer.apple.com/app-store/review/guidelines (fetched 2026-11-22: 2.3.1(a/b), 2.5.19, 2.1(a), 4.8, 5.1.1(v)) and developer.apple.com/news?id=vvzx6cul (2.5.19 clarified 2026-10-16)
- supabase.com/docs/guides/database/connecting-to-postgres; supabase.com/docs/guides/troubleshooting/supabase--your-network-ipv4-and-ipv6-compatibility-cHe3BP (IPv6-only direct, GitHub Actions IPv4-only, session pooler IPv4, add-on price)
- supabase.com/docs/guides/auth/sessions (`session_id` claim = `auth.sessions` pk, access token valid until expiry, timebox/inactivity Pro-only)
- supabase.com/docs/guides/platform/backups (Free: no automatic backups; use `db dump` and off-site)
- developers.cloudflare.com/r2/pricing, /r2/buckets/object-lifecycles, /r2/reference/data-location
- docs.expo.dev/push-notifications/sending-notifications and /push-notifications-setup; docs.expo.dev/versions/latest/sdk/screen-capture; docs.expo.dev/versions/latest/sdk/local-authentication
- developer.paypal.com/reports/activity-download.md (87-field list, Balance Impact)
- Repo: `10-CONTEXT.md`, `10-UI-SPEC.md`, `src/data/*`, `src/features/export/*`, `supabase/functions/delete-account/*`, `supabase/migrations/20260922000400_fx_sync_schedule.sql`, `.github/workflows/{ci,nightly}.yml`, `docs/dependency-register.md`, `package.json`

### Secondary (MEDIUM confidence)
- supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore (restore pitfalls, schemas)
- mail.kde.org KMyMoney post (Wise header); sources.debian.org ledger-autosync `wise.py`/`revolut.py` (Revolut header, date format, fee handling); community.revolut.com thread (rate column dropped Oct 2021)
- Apple developer forums thread 72176 (community view that disclosed flags are acceptable; 2017-2019, not policy)

### Tertiary (LOW confidence)
- PayPal conversion-row shape, Wise date format, Revolut EXCHANGE pairing, JS cover timing, Expo payload retention: training knowledge, flagged [ASSUMED]
- `npx ctx7` lookup was refused in this session; no Context7 verification was done.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH. Installed versions read from `package.json`; `expo-local-authentication` version not registry-checked.
- Architecture: MEDIUM-HIGH. Patterns copy existing repo siblings; session delete privilege and cover timing need spikes.
- Backups: MEDIUM. Official docs for IPv4, pricing and lifecycle; pg_dump-through-pooler and restore flags need the manual rehearsal.
- Wallet formats: LOW until real fixtures.
- Pitfalls: MEDIUM-HIGH.

**Research date:** 2026-11-22
**Valid until:** 2026-12-22 (Apple guideline text and Supabase CLI 3 rollout are moving; re-check Apple at Phase 11)
