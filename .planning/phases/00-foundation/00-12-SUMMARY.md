---
phase: 00-foundation
plan: 12
subsystem: i18n
tags: [i18next, react-i18next, expo-localization, typescript, compliance-copy]

# Dependency graph
requires:
  - phase: 00-foundation (plan 05)
    provides: eslint-plugin-i18next no-literal-string rule (jsx-text-only) on app/, src/features/, src/ui/ — enforces screens read strings through this catalogue
provides:
  - "src/i18n/locales/en.ts: the typed Phase 0 English catalogue (as const) — auth, consent, you, signOut, update, a11y namespaces"
  - "src/i18n/index.ts: synchronous i18next init (initAsync: false, resources passed directly, no backend) with initReactI18next, device-locale detection via expo-localization; exports i18n and useT"
  - "src/i18n/i18next.d.ts: CustomTypeOptions augmentation (defaultNS, resources, returnNull) so t() rejects unknown/non-leaf keys at compile time (DSG-04)"
  - "src/i18n/copyStatus.ts: AWAITING_COPY_KEYS (D-16, release-blocking) and DRAFT_COPY_KEYS (D-20, awaiting user review) trackers"
  - "src/i18n/__tests__/catalogue.test.ts: voice-rule enforcement (no straight apostrophes, no advice/recommendation/you-should/stays-on-device language) plus copy-status key resolution and t()/pluralisation behaviour"
  - "src/i18n/__tests__/keys.typecheck.ts: tsc-only compile check proving t() accepts a real leaf key and rejects an unknown key and a non-leaf key"
affects: [any-later-plan-touching-app-tsx-or-src-features-or-src-ui-screens, 00-11 ThemeProvider-consuming screens, phase-1-plus record/shell/decide UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Typed i18n key safety: CustomTypeOptions augmentation in i18next.d.ts against `typeof en` (as const catalogue) means t() only accepts real leaf-path keys — both unknown keys and non-leaf (object) keys are compile errors, verified by a dedicated tsc-only keys.typecheck.ts file excluded from jest's testMatch/coverage"
    - "Copy ownership split into two typed key lists (AWAITING_COPY_KEYS / DRAFT_COPY_KEYS) rather than inline comments, so the Phase 11 release checklist can programmatically assert AWAITING_COPY_KEYS is empty before shipping"
    - "i18next initialised synchronously via `initAsync: false` (the i18next 26 rename of the old `initImmediate` option) since all resources are passed directly with no backend loader — first render already has strings, no init-completion race"

key-files:
  created:
    - src/i18n/locales/en.ts
    - src/i18n/index.ts
    - src/i18n/i18next.d.ts
    - src/i18n/copyStatus.ts
    - src/i18n/__tests__/catalogue.test.ts
    - src/i18n/__tests__/keys.typecheck.ts
  modified: []

key-decisions:
  - "DRAFT_COPY_KEYS scoped exactly to consent.*/you.*/signOut.*/update.* per the plan's literal instruction — auth.* strings (Apple/Google CTAs, sign-in-failed error) are not included, even though UI-SPEC's Copywriting Contract also frames them as Claude-drafted; followed the plan text as written rather than UI-SPEC's broader framing"
  - "initAsync: false (not initImmediate) used for synchronous init — i18next 26 renamed the option; verified directly against node_modules/i18next/typescript/options.d.ts rather than assuming the plan's older option name still exists"

patterns-established:
  - "Any later screen needing new copy adds it to src/i18n/locales/en.ts as a leaf string, then to DRAFT_COPY_KEYS (Claude-drafted) or AWAITING_COPY_KEYS (user-supplied placeholder) in copyStatus.ts — catalogue.test.ts automatically enforces the voice rules and key-resolution on any addition"

requirements-completed: [DSG-04]

# Metrics
duration: ~15min
completed: 2026-09-23
---

# Phase 00 Plan 12: Typed i18n Catalogue Summary

**Typed i18n catalogue (i18next 26 + react-i18next) holding every Phase 0 string, with a compile-time-checked t() that rejects unknown/non-leaf keys, a D-16/D-20 copy-ownership tracker, and tests enforcing the project's compliance voice rules.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-09-23
- **Tasks:** 2
- **Files modified:** 6 (all created)

## Accomplishments
- `src/i18n/locales/en.ts`: every Phase 0 user-facing string (welcome, Apple/Google sign-in, consent, You settings, sign-out confirmation, update-required, a11y labels) as a single typed `as const` catalogue, typographic apostrophes throughout, welcome tagline shipped as an explicitly marked `AWAITING USER COPY (D-16)` placeholder
- `src/i18n/index.ts`: i18next initialised synchronously (`initAsync: false`) with `initReactI18next`, device-locale detection via `expo-localization`'s `getLocales()` falling back to `en`, exports `i18n` and `useT`
- `src/i18n/i18next.d.ts`: `CustomTypeOptions` module augmentation (`defaultNS`, `resources: { common: typeof en }`, `returnNull: false`) — DSG-04's compile-time key safety
- `src/i18n/copyStatus.ts`: `AWAITING_COPY_KEYS` (1 entry, release-blocking per D-16) and `DRAFT_COPY_KEYS` (37 entries covering consent/you/signOut/update, D-20 — awaiting user review, not release-blocking)
- `src/i18n/__tests__/catalogue.test.ts`: 134 tests — every leaf string checked for straight apostrophes and forbidden compliance language (advice/recommend/you-should/stays-on-device), every copy-status key resolves to a real string, `t('update.heading')` returns the fixed string, `t('signOut.confirm.body', {count})` pluralises correctly for both count 1 and count 3
- `src/i18n/__tests__/keys.typecheck.ts`: `tsc`-only compile check confirming `t('update.heading')` compiles, `t('does.not.exist')` and `t('you')` (non-leaf) are both `@ts-expect-error`

## Task Commits

1. **Task 1: Catalogue, i18next init and type augmentation** — `b596b3a` (feat)
2. **Task 2: Catalogue tests: typed keys, voice rules, copy status** — `9d26f56` (test)

**Plan metadata:** this commit (docs: complete plan) — created alongside this SUMMARY

## Files Created/Modified
- `src/i18n/locales/en.ts` — the typed English catalogue
- `src/i18n/index.ts` — i18next init, `i18n` and `useT` exports
- `src/i18n/i18next.d.ts` — `CustomTypeOptions` augmentation
- `src/i18n/copyStatus.ts` — `AWAITING_COPY_KEYS` / `DRAFT_COPY_KEYS`
- `src/i18n/__tests__/catalogue.test.ts` — voice-rule and key-resolution tests (134 tests)
- `src/i18n/__tests__/keys.typecheck.ts` — compile-time key-safety proof (checked via `tsc --noEmit` only, excluded from jest by `jest.config.js`'s `testMatch`/`collectCoverageFrom`)

## Decisions Made
- `DRAFT_COPY_KEYS` scoped to exactly `consent.*`, `you.*`, `signOut.*`, `update.*` per the plan's literal action list, not the wider set UI-SPEC's Copywriting Contract implies for `auth.*` error/status strings
- Used `initAsync: false` — i18next 26's replacement for the older `initImmediate` option name, verified against the installed package's own type definitions before writing the init call

## Deviations from Plan

None — plan executed exactly as written. The one nuance worth recording as a decision (not a deviation, since nothing broke or was missing): `initImmediate` no longer exists in i18next 26's typed options; `initAsync: false` is the direct replacement and was substituted before any code was written, based on reading `node_modules/i18next/typescript/options.d.ts` directly rather than assuming the plan's option name.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- `npm run lint && npm run typecheck && npm run depcruise && npm run test:coverage` all pass on a clean tree (196 tests total, no coverage-threshold regressions — `src/i18n/` has no engine-style coverage threshold, only `src/engine/` does, and that remains at 100%)
- Any later Phase 0/1 screen (`app/**/*.tsx`, `src/features/**/*.tsx`, `src/ui/**/*.tsx`) can now import `useT` from `@/i18n` and get a fully typed, compliance-voice-checked catalogue — the `eslint-plugin-i18next` `no-literal-string` rule from 00-05 will force this usage
- `auth.welcome.tagline` remains the one `AWAITING_COPY_KEYS` entry blocking Phase 11 release until the user supplies real welcome copy (D-16)
- All `DRAFT_COPY_KEYS` entries (consent/settings/sign-out/update copy) are live and usable now but still await explicit user sign-off per D-20 — not a build blocker, but should be surfaced for review before shipping
- Nothing blocks 00-13 onward

## Known Stubs
None — `auth.welcome.tagline`'s placeholder value is intentional and tracked via `AWAITING_COPY_KEYS`, not a stub; it renders as literal placeholder text by design until the user supplies real copy (D-16), and is documented above as a release blocker.

## Self-Check: PASSED

All files listed under "Files Created/Modified" verified present on disk:
FOUND src/i18n/locales/en.ts, src/i18n/index.ts, src/i18n/i18next.d.ts, src/i18n/copyStatus.ts, src/i18n/__tests__/catalogue.test.ts, src/i18n/__tests__/keys.typecheck.ts.
Commits `b596b3a`, `9d26f56` both verified present in `git log --oneline`.

---
*Phase: 00-foundation*
*Completed: 2026-09-23*
