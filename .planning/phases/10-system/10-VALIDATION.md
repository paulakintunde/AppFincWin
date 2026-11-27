---
phase: 10
slug: system
status: signed
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-22
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 10-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest `~29.7.0` + jest-expo + RNTL + fast-check; pgTAP via `supabase test db`; `deno test` for Edge Functions |
| **Config file** | `jest.config.js`, `jest.engine.config.js` (engine, coverage gate), `jest.realtime.config.js` |
| **Quick run command** | `npx jest <touched path>` / `npx jest -c jest.engine.config.js src/engine/<dir>` |
| **Full suite command** | `npm test` + `supabase test db` + Deno tests (milestone only, per owner rule) |
| **Estimated runtime** | quick ~30 s; full several minutes |

---

## Sampling Rate

- **After every task commit:** quick command for the touched directory
- **After every plan wave:** `npx jest` over touched areas, plus `supabase test db` when migrations changed
- **Before `/gsd-verify-work`:** full Jest, `supabase test db`, Deno tests, one manual backup+restore rehearsal with written record, device checks (lock, cover, push)
- **Max feedback latency:** 60 seconds for quick runs

---

## Per-Task Verification Map

Filled at 10-30 (2026-11-27) from the test files that exist. Requirement → test map:

| Req ID | Behavior | Test Type | Automated Command | Status |
|--------|----------|-----------|-------------------|--------|
| ACC-06/07 | `list_my_devices` marks current; revoke deletes only own session | pgTAP + RNTL | `supabase test db` (123_devices_rpcs); `npx jest src/features/security` (DevicesSection, SecurityScreen) | ✅ |
| ACC-08/09 | backoff schedule, PIN verify, lockUntil persistence, timing options, D-29 same-user re-auth | unit | `npx jest src/services/lock` (lockStore, pin, reauth) | ✅ |
| ACC-08 | LockGate after N minutes, cold start, ignores prompt-induced inactive | RNTL | `npx jest src/features/lock` (LockGate, LockSetupSheet, PinPad) | ✅ |
| DSG-08 | AppCover on inactive/background, no figures; Android recents (stored card blank; secure window while the lock is on) | RNTL + unit + device | `npx jest src/features/lock src/services/lock` (AppCover, recentsCoverPlugin, secureWindow) + device steps 1-2 | ✅ (device: 10-30) |
| ACC-10/DAT-04 | delete flow order: copy, server confirm, forgetGoogle, wipe; offline refusal | unit + RNTL | `npx jest src/services/account src/features/you` (deleteAccount, DeleteAccountScreen) | ✅ |
| ACC-10 | deletion purges every table; deletion log written atomically | pgTAP | `supabase test db` (122_account_deletion_log_and_completeness) | ✅ |
| ACC-11 | allow-list accepts listed, refuses others identically; rate limited | deno + pgTAP | `deno test supabase/functions/reviewer-signin` (signin.test); 125_reviewer_signin, 128_reviewer_seed | ✅ |
| ACC-13 | `rate_limit_hit` window, limit, reset | pgTAP | `supabase test db` (121_rate_limits) | ✅ |
| SYN-03 | kill mid-flush then resume: one server row | jest | `npx jest src/data/__tests__/idempotentRetry.test.tsx` | ✅ |
| SYN-04 | restart restore and replay | jest | `npx jest src/data/__tests__/offlineWrite.test.tsx` | ✅ (device step 11) |
| SYN-05 | 399/400/499/500 thresholds, entry points blocked, edits allowed, 500-entry persist | unit + jest | `npx jest src/data/sync src/data/__tests__/persister` (queueCap, persisterQueue500, persisterBudget) | ✅ |
| ALR-01..04 | settings validation, D-10 defaults, quiet-hour hold, 08:00 local digest across DST | engine + deno + pgTAP | `npx jest -c jest.engine.config.js src/engine/alerts`; `deno test supabase/functions/alerts-deliver` (schedule, deliver); 120_system_tables, 129_alert_prefs_upsert | ✅ (device step 10) |
| ALR-05 | alert log written on raise even when push denied | pgTAP | `supabase test db` (124_alerts_raise, 127_alerts_deliver) | ✅ |
| ALR-06 | partner push text has no note/payee, hidden-name fallback, receiver threshold (any currency), opt-out | deno + pgTAP | `deno test supabase/functions/alerts-deliver` (text); 124_alerts_raise, 128_alerts_cross_currency | ✅ (device step 9) |
| ENV-19 | push credentials present (EAS FCM V1) | manual | device step 9; test push receipt ok 2026-11-27 | ✅ (attached 2026-11-27) |
| DAT-01 | archive hides from switcher/search; Decide output identical | engine + guard | `npx jest -c jest.engine.config.js src/engine/archive`; `npx jest src/features/decide/__tests__/archiveInvariance.test.tsx` | ✅ (device step 12) |
| DAT-02 | every table in export manifest incl. 08.1 and 09 tables | jest guard + pgTAP | `npx jest src/data/__tests__/exportManifest`; 126_server_export | ✅ |
| DAT-03 | import round-trip, id idempotency, quote and ' handling | fast-check | `npx jest -c jest.engine.config.js src/engine/dataCsv` (parse, roundTrip) | ✅ |
| DAT-05/ENV-16 | daily backup succeeds; monthly restore check passes | CI workflow | backup.yml, restore-check.yml (run 45853146569) | ✅ (10-29) |
| DAT-06 | payload keys ⊆ allow-list, sentinel absent | unit | `npx jest src/features/diagnostic` (buildDiagnostic) | ✅ |
| IMP-06 | readers map fixture rows; gross/fee/net balance; conversion pair linked | engine + fixtures | `npx jest -c jest.engine.config.js src/engine/statement` (wallets/*); importFinalize.wallet | ✅ synthetic (owner real files skipped, 10-01) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/services/lock/__tests__/`, `src/features/lock/__tests__/` — ACC-08/09, DSG-08
- [x] `supabase/tests/database/*` pgTAP — devices, rate limit, deletion log/completeness, alerts, archive RLS
- [x] `supabase/functions/{alerts-deliver,reviewer-signin}/*.test.ts`
- [x] `src/engine/{alerts,archive,dataCsv,statement/wallets}` with exhaustive tests (engine coverage gate)
- [x] Decide-invariance test and import-guard test
- [x] Synthetic wallet fixtures now; owner's real files later (D-24)
- [x] `npx expo install expo-local-authentication` + jest mock in `jest.setup.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OS app-switcher snapshot shows plain cover | DSG-08 | OS snapshot not reachable from tests | iPhone XR + Pixel: open app with figures, go to app switcher, confirm tint + mark only |
| Face ID / biometric unlock | ACC-08 | real hardware | iPhone XR + Pixel |
| Push arrives, quiet-hour hold, digest | ALR-01..06, ENV-19 | real push | Pixel first (FCM); iPhone after APNs |
| First backup + restore rehearsal | DAT-05, ENV-16 | D-08 says by hand with written record | restore latest dump into local stack, compare row counts, spot-check figures |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** signed 2026-11-27 at 10-30. Pixel 9 device checks 1-15 pass (docs/acceptance/phase-10-device-checks.md); iPhone XR (Face ID, cover, APNs push) is still open as step 16, blocked on the Apple portal steps (00-20). Android recents rule amended by the owner 2026-11-27: the secure window applies only while the lock is on.
