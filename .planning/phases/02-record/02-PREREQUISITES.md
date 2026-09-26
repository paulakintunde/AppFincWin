# Phase 2 — Prerequisite Pathways

**Written:** 2026-09-25, after `/gsd-plan-phase 2`
**Purpose:** clear the four items that stand between the Phase 2 plans and a clean `/gsd-execute-phase 02`.

State verified live on 2026-09-25: git (local and origin), plan summaries on disk, and the production database (read-only queries via the Management API).

---

## 0. Sync local `main` first (found while checking)

Local `main` has diverged from `origin/main`:

- **Behind:** PR #15 (00-15 sign-in, merged 18:44 UTC) and later merges are on `origin/main` only. Locally, 00-15 has no SUMMARY and looks unfinished, but it is done.
- **Ahead:** three unpushed planning commits: `2e2c09e` UI-SPEC, `65065a0` research + validation, `f0108e1` plans.

`main` is protected, so:

```bash
git switch -c docs/phase-02-plan          # carries the 3 local commits
git push -u origin docs/phase-02-plan
gh pr create --title "Phase 2 (Record): UI-SPEC, research, plans" --base main
# after merge:
git switch main && git reset --hard origin/main
```

Other sessions share `C:\dev\fincwin` (worktrees `fincwin-0015`, `fincwin-integrate`, `fincwin-sentry-debug`). Do the reset only when no other session has `main` checked out here.

---

## 1. Earlier-phase plans that must land first

### What is actually blocking

| Plan | What it does | Status | Blocks | Runs unattended? |
|------|--------------|--------|--------|------------------|
| 00-15 | Apple/Google sign-in | **Done** (PR #15), only missing from local `main` | — | — |
| 00-17 | Root layout, welcome/sign-in screen, update gate | Open | 00-18, 01-15, 02-29 | yes |
| 00-18 | You screen, consent, theme, sign-out wipe | Open | 01-15, 02-29, 02-30 | yes |
| 01-15 | Mount `QueryProvider`, sync line on You screen | Open | 01-16, 02-29 | yes |
| 01-16 | Push Phase 1 schema + Edge Functions to production, device check | Open | 02-31 | **no** (production push + device check) |

**Not blocking Phase 2:** 00-07 (Apple enrolment), 00-19 (Phase 0 Android proof) and 00-20 (first iOS build). All three are Apple-gated or Phase-0 sign-off only.

Each blocking plan is alone in its wave, so `--wave` runs exactly one plan.

### Pathway

Run these after step 0, each in a fresh context:

```
/gsd-execute-phase 00 --wave 5    # 00-17
/gsd-execute-phase 00 --wave 6    # 00-18
/gsd-execute-phase 01 --wave 6    # 01-15
/gsd-execute-phase 01 --wave 7    # 01-16  — interactive: production push, Edge Functions, device check
```

Do not run a bare `/gsd-execute-phase 00`. It would also pick up 00-07, 00-19 and 00-20, which wait on Apple enrolment and will checkpoint.

**Parallel option:** Phase 2 waves 1–10 (02-01 … 02-28) don't touch these files. Starting them alongside means both streams write to `.planning/STATE.md`. If you want parallel work, run Phase 2 in its own worktree (see memory: shared-checkout sessions) and expect a STATE.md merge.

**Done when:**
- `00-17-SUMMARY.md`, `00-18-SUMMARY.md`, `01-15-SUMMARY.md` and `01-16-SUMMARY.md` exist.
- `app/(app)/_layout.tsx` and `src/features/you/YouScreen.tsx` exist, and `app/_layout.tsx` contains `QueryProvider`. These are 02-29's precondition checks.
- `npx supabase migration list --linked` shows `20260924000700` applied remotely. This is 02-31's precondition. Today production has only `20260922000100…000400`.

---

## 2. New dependencies and the development build

### What is needed

| Package | Type | Installed by | Status |
|---------|------|--------------|--------|
| `@react-native-community/datetimepicker` | native | 02-20 (`npx expo install`) | not installed |
| `@shopify/flash-list` v2 | JS only | 02-22 | not installed |
| `expo-document-picker` ~57.0.2 | native | 02-26 | not installed |

The plans already install all three. No action is needed before execution. The build is the only real cost: two native modules mean the current development build can't run Phase 2 screens.

### Pathway

- **Default (no change):** 02-31 builds a fresh development build at the device checkpoint, once, after all native modules are in.
- **Faster feedback (optional):** once 02-26 has landed (the last native install), build Android early so screens can be tried on the emulator during waves 9–12:

  ```bash
  npx eas-cli build --profile development --platform android
  ```

- **iOS:** blocked on Apple enrolment (00-07 → 00-20), the same as Phase 0. Device verification for Phase 2 runs on Android (emulator plus phone). The iPhone XR check follows 00-20. This does not block Phase 2.

**Done when:** `package.json` lists all three packages, and the development build installed on the Android device includes them. The date picker and CSV file picker open instead of crashing.

---

## 3. `pg_trgm` for cross-month search — **resolved, nothing to do**

Checked on production (read-only):

| Extension | Available | Installed |
|-----------|-----------|-----------|
| `pg_trgm` | 1.6 | not yet |
| `pg_cron` | 1.6.4 | 1.6.4 (already used by FX jobs) |

02-07's migration already runs `create extension if not exists pg_trgm with schema extensions;` before creating `transactions_name_trgm_idx`. The extension is on the allowed list, so the 02-31 push installs it. There is no fallback path to plan for.

**Done when:** after the 02-31 push, `select installed_version from pg_available_extensions where name = 'pg_trgm'` returns `1.6`.

---

## 4. Two-person undo refusal (REC-12) on real devices

### Where it stands

- **Proven now (automated):** 02-09's pgTAP suite runs two members in one household. Member B edits a row, and member A's undo is refused with a version conflict. This runs in CI.
- **Missing:** a device test. The app can't put two people in one household until Phase 8 builds invites. `handle_new_user()` gives every signup its own household, and `fetchCurrentHouseholdId` reads the single membership row.

### Pathway (choose one)

**A. Accept pgTAP now, device test in Phase 8 (recommended).** Record REC-12 as "verified by pgTAP; device check deferred to Phase 8" in 02-31's summary. When Phase 8 is planned, add a UAT step: two members edit the same transaction, the first member's undo is refused, and the refusal shows the other member's name.

**B. Interim device test with two test accounts (optional, writes to production).**
1. Sign up two throwaway test accounts, A and B. Each gets its own household.
2. Move B into A's household. This is an admin SQL write on production, so confirm before running it:
   ```sql
   update public.household_members
      set household_id = (select household_id from public.household_members where user_id = '<A>')
    where user_id = '<B>';
   ```
   Use `update`, not `insert`. The client reads one membership row (`limit(1)`), so B must have only one.
3. On two Android devices or emulators: A adds a transaction, B edits it, and A taps Undo. Expect the refusal copy with B's name, which comes from `updated_by`.
4. Clean up by deleting both test accounts through the in-app account deletion flow. That also exercises the purge path.

Option B tests something Phase 8 will build for real. Use it only if you want the refusal copy checked on a device before Phase 8.

---

## Order of operations

1. Step 0: branch, PR and merge the planning commits, then reset local `main`.
2. Step 1: 00-17 → 00-18 → 01-15 → 01-16 (01-16 is interactive).
   - Optionally run Phase 2 waves 1–10 in parallel in a separate worktree.
3. `/gsd-execute-phase 02`.
4. Items 2 and 3 are handled inside Phase 2 (02-20/22/26 install the dependencies; the 02-31 push installs `pg_trgm`).
5. Item 4: choose A or B at the 02-31 checkpoint.
