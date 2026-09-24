---
phase: 1
slug: money-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-24
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ~29.7 (`jest-expo` preset) + fast-check for TS; pgTAP via `supabase test db` for SQL; squawk-cli for migration safety |
| **Config file** | `jest.config.js` (existing — `src/engine/money/` and `src/engine/split/` auto-enable 100% branch coverage); `supabase/tests/database/` (existing) |
| **Quick run command** | `npx jest <touched-dir> --silent` |
| **Full suite command** | `npm run lint && npm run typecheck && npm run depcruise && npm run test:coverage && npm run verify:gates && npx squawk-cli supabase/migrations/*.sql && supabase test db` |
| **Estimated runtime** | ~30s quick / ~180s full (pgTAP needs local `supabase db start`) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest <touched-dir> --silent`
- **After every plan wave:** Run `npm run test:coverage && npm run verify:gates` plus `supabase test db` when the wave touched SQL
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds for the quick run

---

## Per-Task Verification Map

Requirement-level map from RESEARCH.md §Validation Architecture. The planner assigns task IDs; the executor fills Status.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| MON-01 | Every money arithmetic function returns an integer; no float escapes `engine/money/` | unit + property | `npx jest src/engine/money/arithmetic.test.ts` | ❌ W0 | ⬜ pending |
| MON-02 | Amount parsing never uses `parseFloat`; locale round-trip | property | `npx jest src/engine/money/parseAmount.test.ts` | ❌ W0 | ⬜ pending |
| MON-03 | `sum(allocate(total, weights)) === total` (largest remainder) | property | `npx jest src/engine/split/allocate.test.ts` | ❌ W0 | ⬜ pending |
| MON-04 | Custom currency respects declared exponent and reference currency | pgTAP | `supabase test db` | ❌ W0 | ⬜ pending |
| MON-05 | Foreign transaction stamps rate / rate_date / source / home_amount on write | pgTAP | `supabase test db` | ❌ W0 | ⬜ pending |
| MON-06 | Rates come only from the project's own store; no client-side provider call | unit + grep | `npx jest supabase/functions/fx-sync` + `! grep -rn "frankfurter\|open.er-api" src/` | partial | ⬜ pending |
| MON-07 | Converted figures show the stamped rate publication date | component | `npx jest src/ui/RateAttribution.test.tsx` | ❌ W0 | ⬜ pending |
| MON-08 | Client-generated UUID exists before the mutation is enqueued | unit | `npx jest src/data/mutations` | ❌ W0 | ⬜ pending |
| MON-09 | `version` increments server-side on every update | pgTAP | `supabase test db` | ❌ W0 | ⬜ pending |
| MON-10 | Staleness alert fires past the business-day-aware limit | unit | `npx jest supabase/functions/fx-monitor` | ❌ W0 | ⬜ pending |
| MON-11 | >10% overnight move is held in `fx_rate_holds`, not stored | unit + pgTAP | `npx jest supabase/functions/fx-sync` + `supabase test db` | ❌ W0 | ⬜ pending |
| MON-12 | open.er-api fallback fires when Frankfurter is down; attribution shown | unit + component | `npx jest supabase/functions/fx-sync src/ui/RateAttribution.test.tsx` | ❌ W0 | ⬜ pending |
| MON-13 | ISO 4217 exponents correct (JPY 0, KWD 3, default 2) | unit (exhaustive) | `npx jest src/engine/money/currencyExponents.test.ts` | ❌ W0 | ⬜ pending |
| MON-14 | 23:30-local entry stays in the local day/month | unit | `npx jest src/engine/money/localDate.test.ts` | ❌ W0 | ⬜ pending |
| SYN-01 | Cached reads resolve with NetInfo offline | integration | `npx jest src/data/client.test.tsx` | ❌ W0 | ⬜ pending |
| SYN-02 | Offline mutation queues, flushes on reconnect | integration | `npx jest src/data/mutations` | ❌ W0 | ⬜ pending |
| SYN-06 | `useSyncStatus()` reports queued/failed/online | unit | `npx jest src/data/sync` | ❌ W0 | ⬜ pending |
| SYN-07 | Persisted cache is never plaintext; key in secure storage | unit | `npx jest src/data/cache src/services/supabase/largeSecureStore.test.ts` | partial | ⬜ pending |
| FND-10 | Destructive-DDL probe migration fails squawk CI step | CI probe | `npx squawk-cli supabase/migrations/*.sql` | ❌ W0 | ⬜ pending |
| DSG-06 | Amounts/dates formatted per locale (en-US, en-GB, de-DE, ja-JP, ar-KW) | unit | `npx jest src/engine/money/formatAmount.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install `fast-check`, `@fast-check/jest` (dev)
- [ ] Install `@tanstack/react-query`, `@tanstack/query-async-storage-persister`, `@tanstack/react-query-persist-client`, `@react-native-community/netinfo`
- [ ] Install `squawk-cli` and add its step to `.github/workflows/ci.yml`
- [ ] Create `src/engine/money/` and `src/engine/split/` source + test files
- [ ] pgTAP files for accounts/transactions, FX stamping, rounding mirror, custom currencies under `supabase/tests/database/`
- [ ] Alert-channel secret (e.g. `RESEND_API_KEY`) in `.env.example` and Supabase Vault, following the `FX_SYNC_SECRET` pattern

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Offline browse + queued write + reconnect flush on a real device | SYN-01, SYN-02, SYN-06 | Airplane-mode toggling on the dev client isn't reproducible in Jest | Dev build on Android emulator / iPhone XR: load data, enable airplane mode, browse, add a record (marked queued), disable airplane mode, confirm it flushes |
| Production schema push | FND-10, MON-04/05/09 | Targets the only (production) Supabase project | `npm run supabase:db:push` after local pgTAP green |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
