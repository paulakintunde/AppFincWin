---
phase: 0
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-22
---

# Phase 0 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.x (`jest-expo` preset) + RNTL; pgTAP via `supabase test db`; dependency-cruiser; `tsc --noEmit`; gitleaks |
| **Config file** | none — Wave 0 installs (`jest.config.js`, `.dependency-cruiser.cjs`, `eslint.config.js`, `.github/workflows/ci.yml`, `supabase/tests/`) |
| **Quick run command** | `npx jest <changed test file>` + `npx eslint <changed files>` |
| **Full suite command** | `npx tsc --noEmit && npx eslint . && npx depcruise src --config .dependency-cruiser.cjs && npx jest --coverage && supabase test db` |
| **Estimated runtime** | ~90 seconds (pgTAP needs a running local Supabase stack) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command for the files touched
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green, plus a gitleaks scan
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

Task IDs are filled in by the planner; the requirement → command mapping below is fixed by research.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | FND-04 | — | engine/ cannot import db/state/services/ui/react, incl. transitively | static | `npx depcruise src --config .dependency-cruiser.cjs` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-05 | — | engine/ coverage below threshold fails CI | coverage | `npx jest --coverage` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-06 | — | N/A | component | `npx jest src/theme/__tests__/themeSwitch.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-07 | — | N/A | component | `npx jest src/theme/__tests__/reducedMotion.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-09 | — | Below-min-version app is blocked | unit | `npx jest src/features/system/__tests__/minVersionGate.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-12 | RLS gap | Cross-user/household rows unreadable and unwritable | pgTAP | `supabase test db` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ACC-04 | Security-definer escalation | Household-of-one created by trigger; function has pinned search_path | pgTAP | `supabase test db` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ACC-05 / ACC-12 | Session exfiltration | Session AES-encrypted at rest, key in SecureStore | unit | `npx jest src/services/supabase/__tests__/largeSecureStore.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ANL-02 | Analytics leak | No capture before opt-in | unit | `npx jest src/services/analytics/__tests__/consentGate.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ANL-03 | Analytics leak | Amount/payee/account/free text unrepresentable in events | typecheck | `npx tsc --noEmit` (with `@ts-expect-error` fixtures) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ANL-04 | — | Session replay absent from production config | unit/grep | `npx jest src/services/analytics/__tests__/config.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DSG-04 | — | N/A | typecheck | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ENV-* secrets | Committed secret | No secret in tracked files | scan | `gitleaks detect --no-banner` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Environment: Docker Desktop daemon running, Supabase CLI installed, Android SDK + JDK + emulator installed (all absent on dev machine as of 2026-09-22)
- [ ] App scaffold: Expo SDK 57 `blank-typescript`, TS strict
- [ ] `jest.config.js` with per-directory `coverageThreshold` (D-21)
- [ ] `.dependency-cruiser.cjs` engine-purity rules
- [ ] `eslint.config.js` with `eslint-plugin-boundaries`
- [ ] `.github/workflows/ci.yml` — lint, typecheck, depcruise, jest coverage, gitleaks (`fetch-depth: 0`), pgTAP
- [ ] `supabase/tests/` pgTAP files for RLS isolation and household provisioning

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google / Apple account creation | ACC-01, ACC-02 | Real OIDC ceremony, not mockable | Sign in on Android emulator (Google) and iPhone XR (Apple, once enrolment clears); confirm `auth.users` row + household |
| Apple first-auth name/email persisted | ACC-03 | Needs a real/sandbox Apple ID | Fresh Apple ID sign-in → verify profile persisted → sign out/in → verify still present |
| Session survives restart | ACC-05 | Needs real app lifecycle | Force-quit and reopen; user remains signed in |
| Safe-area insets | DSG-03 | Visual across real device insets | Check iPhone XR notch and Android emulator |
| Reduce-motion on device | FND-07 | OS setting | Toggle OS reduce-motion; confirm animations collapse |
| Android emulator run / iOS dev build on XR | FND-01, FND-02 | Device/toolchain | `npx expo run:android`; EAS development build installs on XR |
| Apple enrolment, D-U-N-S, domain/website/email | ENV-* | Third-party human process | Record status and dates in dependency register |
| PostHog events land on EU host after opt-in | ANL-01 | External service | Opt in on emulator; confirm event in PostHog EU project, keyed by Supabase UUID |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
