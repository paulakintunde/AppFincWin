---
phase: 02-record
plan: 10
subsystem: ui
tags: [i18n, i18next, analytics, posthog, design-tokens, typescript]

requires:
  - phase: 00-foundation
    provides: "src/i18n/locales/en.ts + copyStatus.ts draft-key convention, src/services/analytics/catalogue.ts EventCatalogue + AssertAll guard, src/theme/tokens.ts|layout.ts|typography.ts token set"
provides:
  - "record, activity, accounts, categories, importCsv, history, undo, setup, you.record copy namespaces in the typed English catalogue (draft, DRAFT_COPY_KEYS-tracked)"
  - "ANL-05 widened funnel events (account_created, onboarding_history_choice, transaction_added, import_started, import_file_rejected, import_format_confirmed, import_mapping_confirmed, import_committed, import_abandoned, recurring_suggestion_answered, transfer_suggestion_answered, pay_match_answered)"
  - "categorySwatch theme map, radii.sheetTop (28), space.rowPadDense (13), fontSize.amountDisplay (44)"
affects: ["02-11", "02-12", "02-19", "02-20", "02-21", "02-22", "02-23", "02-24", "02-25", "02-26", "02-27", "02-28", "02-29", "02-30"]

tech-stack:
  added: []
  patterns:
    - "leafPaths() helper in copyStatus.ts recurses a copy namespace and returns every leaf key path, so DRAFT_COPY_KEYS registers whole namespaces without hand-listing every key"

key-files:
  created: []
  modified:
    - src/i18n/locales/en.ts
    - src/i18n/copyStatus.ts
    - src/services/analytics/catalogue.ts
    - src/services/analytics/__tests__/catalogue.typecheck.ts
    - src/theme/tokens.ts
    - src/theme/layout.ts
    - src/theme/typography.ts

key-decisions:
  - "importCsv key namespace keeps its name for grep stability across the phase's plans, but every value now reads \"statement\" instead of \"CSV\" (D-39 generalisation to OFX/QFX)"
  - "categorySwatch built only from existing categoryColor/categoryTint values (Housing/Utilities/Groceries/Insurance/Subscriptions/Debt/Business) -- no new hex literal added, verified via git diff and the noRawColours test's fixed allow-list"

patterns-established:
  - "leafPaths(prefix, node) in copyStatus.ts: recursive leaf-key collector for registering a whole i18n namespace in DRAFT_COPY_KEYS in one line"

requirements-completed: [ANL-05, REC-07, REC-11, REC-09, REC-13, REC-15, REC-17, REC-18]

duration: ~50min
completed: 2026-09-27
---

# Phase 02 Plan 10: Shared Record contracts (copy, analytics, tokens) Summary

**Full Phase 2 English copy catalogue (9 new namespaces, draft-marked), the ANL-05 activation/import funnel as 12 new typed PostHog events, and 4 theme token additions -- all built so the 20 downstream Phase 2 UI plans never need to touch these shared files.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-09-27T18:20:00Z (approx.)
- **Completed:** 2026-09-27T18:31:00Z (approx.)
- **Tasks:** 2 completed
- **Files modified:** 7

## Accomplishments
- Every Phase 2 screen string (record, activity, accounts, categories, importCsv, history, undo, setup, you.record) now exists once in the typed catalogue, in the prototype's declarative voice with typographic apostrophes, marked draft via `DRAFT_COPY_KEYS`
- The ANL-05 funnel (signup -> first entry -> first statement import, with per-stage drop-off) is now expressible as 12 typed PostHog events whose properties are all finite literal unions or booleans -- no amounts, payees, bank names, file names or free text can be smuggled in, enforced at compile time by the existing `AssertAll`/`CATALOGUE_IS_FINITE` guard
- Category swatch pairs, the sheet top radius and the entry-sheet amount figure size are now declared once as theme tokens, built only from values already in the palette

## Task Commits

Each task was committed atomically:

1. **Task 1: Phase 2 copy catalogue + draft marking** - `c139c6c` (feat)
2. **Task 2: ANL-05 events + theme token additions** - `f387628` (feat)

_No TDD tasks in this plan; both tasks are `type="auto"` config/content additions._

## Files Created/Modified
- `src/i18n/locales/en.ts` - added `record`, `activity`, `accounts`, `categories`, `importCsv`, `history`, `undo`, `setup` top-level namespaces, `you.record`, and 4 new `a11y` keys
- `src/i18n/copyStatus.ts` - added `leafPaths()` recursive helper; registered every new namespace's leaf keys in `DRAFT_COPY_KEYS`; updated header comment for Phase 2 ownership
- `src/services/analytics/catalogue.ts` - widened `EventCatalogue` with the 12 ANL-05 funnel events
- `src/services/analytics/__tests__/catalogue.typecheck.ts` - added one valid `import_committed` call and two new `@ts-expect-error` cases (banded `size` rejects a raw number; `format` rejects a non-Phase-2 value)
- `src/theme/tokens.ts` - added `categorySwatch` map + `CategorySwatchKey` type
- `src/theme/layout.ts` - added `radii.sheetTop` (28) and `space.rowPadDense` (13)
- `src/theme/typography.ts` - added `fontSize.amountDisplay` (44)

## Decisions Made
- `importCsv` namespace keeps its internal key name for stability (grepped by later plans 02-24/02-27/02-30) while every copy value inside it now says "statement", not "CSV" -- matches the plan's explicit instruction and the UI-SPEC's D-39 revision
- `categorySwatch` keys (green/slate/teal/blue/plum/rust/ochre) map to specific existing categories' colour/tint pairs exactly as specified in the plan, not derived heuristically, so the 7 distinct prototype swatches are reproducible from data already in the token set

## Deviations from Plan

None functionally -- both tasks executed exactly as specified. Two informational notes on acceptance-criteria greps that check the whole file text rather than only leaf copy values:

1. **`grep -ciE "you should|advice|recommend"` on `en.ts` returns 1, not 0.** The one match is the pre-existing file-header docstring (present before this plan started, unchanged by this plan -- confirmed via `git diff` showing it as a context line) that itself *documents* the compliance rule: `* Compliance (CLAUDE.md): never "advice", "recommendation", "you should", and never a`. It is a comment, not a copy value; the actual enforcement mechanism, `catalogue.test.ts`'s `FORBIDDEN_VOICE` regex, only scans leaf string *values* of the `en` object (not comments) and passes cleanly on all 1500+ generated cases. No new copy in this plan uses forbidden voice.
2. **`grep -c "import_committed"` on `catalogue.ts` returns 2, not 1.** The second match is in a descriptive code comment above `EventCatalogue` ("funnel = first sign_in_completed -> first transaction_added -> first statement import (import_committed, any format)..."), not a second declaration. The type only declares `import_committed` once; `tsc --noEmit` and the typecheck fixture both confirm there is exactly one property of that name.

Both are acceptance-criterion literal-count mismatches caused by legitimate pre-existing or newly-added documentation text containing the searched substring, not defects in the delivered copy or event catalogue.

## Issues Encountered
- **Worktree path breaks Jest's glob-based `testMatch`.** This worktree lives at `C:\dev\fincwin\.claude\worktrees\agent-afe179107edf80570` -- the `\.claude\` segment in the absolute path corrupts Jest's internal path-separator-to-glob conversion on Windows (`replacePathSepForGlob` produces `.../fincwin\.claude/worktrees/.../src/**/*.test.ts?(x)`, and micromatch then treats `\.` as an escaped literal dot, silently deleting the preceding path separator so the pattern can never match any real file). Confirmed directly with `micromatch.isMatch()` outside Jest. Worked around for verification purposes only by passing an inline `--config` JSON that sets `testMatch` to root-relative patterns (`**/src/i18n/**/*.test.ts` etc.) instead of `<rootDir>`-prefixed absolute-path patterns -- this bypasses the broken conversion entirely. No project file was changed to work around this; it is purely an environment/invocation issue tied to running Jest inside a dot-prefixed worktree directory on Windows, and does not affect CI (which does not run inside `.claude/worktrees/`). Flagging in case future Windows-worktree executions hit the same "No tests found" symptom.
- `node_modules` was missing in the fresh worktree; ran `npm ci` first (per plan-execution instructions), which took ~13 minutes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All 20 Phase 2 UI plans (02-19 through 02-30 and others) can now reference any of the new `en.ts` copy keys, any of the 12 new analytics events, or any of the 4 new theme tokens without needing to edit these shared files themselves -- the plan's stated purpose (interface-first shared contracts) is fulfilled. No blockers identified for downstream plans.

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

- FOUND: `.planning/phases/02-record/02-10-SUMMARY.md`
- FOUND: `c139c6c` (Task 1 commit)
- FOUND: `f387628` (Task 2 commit)
