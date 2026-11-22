---
phase: 10
slug: system
status: draft
nyquist_compliant: false
wave_0_complete: false
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

Filled in by the planner per task. Requirement → test map:

| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| ACC-06/07 | `list_my_devices` marks current; revoke deletes only own session | pgTAP | `supabase test db` | ❌ W0 |
| ACC-08/09 | backoff schedule, PIN verify, lockUntil persistence, timing options, D-29 same-user re-auth | unit | `npx jest src/services/lock` | ❌ W0 |
| ACC-08 | LockGate after N minutes, cold start, ignores prompt-induced inactive | RNTL | `npx jest src/features/lock` | ❌ W0 |
| DSG-08 | AppCover on inactive/background, no figures | RNTL + device | `npx jest src/features/lock` + manual | ❌ W0 |
| ACC-10/DAT-04 | delete flow order: copy, server confirm, forgetGoogle, wipe; offline refusal | unit | `npx jest src/services/account src/features/you` | partial |
| ACC-10 | deletion purges every table; deletion log written atomically (AFTER DELETE trigger) | pgTAP | `supabase test db` | ❌ W0 |
| ACC-11 | allow-list accepts listed, refuses others identically; rate limited | deno + pgTAP | `deno test supabase/functions/reviewer-signin` | ❌ W0 |
| ACC-13 | `rate_limit_hit` window, limit, reset | pgTAP | `supabase test db` | ❌ W0 |
| SYN-03 | kill mid-flush then resume: one server row | jest | `npx jest src/data/__tests__/idempotentRetry.test.tsx` | ✅ add case |
| SYN-04 | restart restore and replay | jest | `npx jest src/data/__tests__/offlineWrite.test.tsx` | ✅ |
| SYN-05 | 399/400/499/500 thresholds, entry points blocked, edits allowed, 500-entry persist | unit + jest | `npx jest src/data/sync src/data/__tests__/persister` | ❌ W0 |
| ALR-01..04 | settings validation, D-10 defaults, quiet-hour hold, 08:00 local digest across DST | engine + deno + pgTAP | `npx jest -c jest.engine.config.js src/engine/alerts` | ❌ W0 |
| ALR-05 | alert log written on raise even when push denied | pgTAP | `supabase test db` | ❌ W0 |
| ALR-06 | partner push text has no note/payee, hidden-name fallback, receiver threshold, opt-out | deno + pgTAP | `deno test supabase/functions/alerts-deliver` | ❌ W0 |
| ENV-19 | push credentials present (EAS) | manual | VERIFICATION checklist | n/a |
| DAT-01 | archive hides from switcher/search; Decide output identical | engine + guard + property | `npx jest src/engine/archive src/features/decide/__tests__/archiveInvariance` | ❌ W0 |
| DAT-02 | every table in export manifest incl. 08.1 and 09 tables | jest guard | `npx jest src/data/__tests__/exportManifest.test.ts` | ✅ extend |
| DAT-03 | import round-trip, id idempotency, quote and `'` handling | fast-check | `npx jest src/engine/dataCsv` | ❌ W0 |
| DAT-05/ENV-16 | daily backup succeeds; monthly restore check passes | CI workflow + manual first run | `gh workflow run backup.yml` | ❌ W0 |
| DAT-06 | payload keys ⊆ allow-list, sentinel absent | unit | `npx jest src/features/diagnostic` | ❌ W0 |
| IMP-06 | readers map fixture rows; gross/fee/net balance property; conversion pair linked | engine + fixtures | `npx jest -c jest.engine.config.js src/engine/statement/wallets` | ❌ W0 (owner fixtures) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/services/lock/__tests__/`, `src/features/lock/__tests__/` — ACC-08/09, DSG-08
- [ ] `supabase/tests/database/*` pgTAP — devices, rate limit, deletion log/completeness, alerts, archive RLS
- [ ] `supabase/functions/{alerts-deliver,reviewer-signin}/*.test.ts`
- [ ] `src/engine/{alerts,archive,dataCsv,statement/wallets}` with exhaustive tests (engine coverage gate)
- [ ] Decide-invariance test and import-guard test
- [ ] Synthetic wallet fixtures now; owner's real files later (D-24)
- [ ] `npx expo install expo-local-authentication` + jest mock in `jest.setup.ts`

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
