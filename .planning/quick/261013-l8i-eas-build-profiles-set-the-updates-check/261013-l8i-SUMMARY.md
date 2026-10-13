---
quick_id: 261013-l8i
status: complete
completed: 2026-10-13
key-files:
  modified:
    - eas.json
    - app.config.ts
    - docs/ops/ota-policy.md
---

# Quick 261013-l8i: EAS build profiles set the updates check through env

Preview and production EAS builds had been impossible since quick 261009-uuw (PR #66). app.config.ts derived `updates.checkAutomatically` from `EAS_BUILD_PROFILE`, which exists only on the EAS builder, so the fingerprint computed locally by `eas build` (ON_ERROR_RECOVERY) never matched the one computed on EAS (ON_LOAD). Build 24f383ae failed at "Configure expo-updates" with a runtime version mismatch.

## Change

- **eas.json:** each build profile sets `env.APP_UPDATES_CHECK`: development ON_ERROR_RECOVERY, preview ON_LOAD, production ON_LOAD.
- **app.config.ts:** uses ON_LOAD only when `APP_UPDATES_CHECK === 'ON_LOAD'`, else ON_ERROR_RECOVERY. Local runs and Metro keep ON_ERROR_RECOVERY, so the 261009-uuw dev-client fix stands.
- **docs/ops/ota-policy.md:** documents the mechanism, why `EAS_BUILD_PROFILE` must not be used, and how to check a change.

## Verification

- `npx eas config --platform android` resolves preview ON_LOAD, production ON_LOAD and development ON_ERROR_RECOVERY, with the env shown per profile.
- `npx expo config` resolves ON_ERROR_RECOVERY.
- typecheck: 0 errors. eslint app.config.ts: clean. No test reads app.config.ts.
- Pending: the preview build from main after merge must pass "Configure expo-updates". It is recorded in docs/acceptance/phase-02.3-record-follow-ups.md.

## Deviations

None.
