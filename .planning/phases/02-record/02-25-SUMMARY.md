---
phase: 02-record
plan: 25
subsystem: ui
tags: [categories, undo, merge, archive, swatches]
requires: [02-14, 02-17, 02-19]
provides: [CategoriesScreen, CategorySheet, RemoveCategoryPrompt]
key-files:
  created:
    - src/features/record/categories/CategoriesScreen.tsx
    - src/features/record/categories/CategorySheet.tsx
    - src/features/record/categories/RemoveCategoryPrompt.tsx
    - src/features/record/categories/__tests__/categories.test.tsx
  modified:
    - src/i18n/locales/en.ts
requirements-completed: [REC-07]
completed: 2026-10-06
---

# Phase 2 Plan 25: Category management Summary

Category list, create/edit sheet with the 7-swatch picker, and a merge-or-archive removal prompt, each write followed by an Undo toast tied to its step id.

## Commits
- fffc847 test: failing CategorySheet / RemoveCategoryPrompt tests (RED; module not found)
- 40a7f72 feat: CategorySheet + RemoveCategoryPrompt (GREEN)
- 47c1440 test: failing CategoriesScreen tests (RED)
- 7e40728 feat: CategoriesScreen (GREEN)

## Behaviour
- New: name trimmed, 1..60 chars; only the 7 `CATEGORY_COLOR_KEYS` selectable; live glyph preview.
- Edit: built-ins prefill their i18n name; only changed fields are sent; no change closes without a write or toast. Archive opens the prompt.
- Prompt: unused archives directly (once, via effect); in use shows the plural count copy with Cancel / Merge / Archive; Merge lists active categories except the source and calls `merge()`; Merge and Archive are disabled while usage loads.
- Screen: active list (glyph + name anchor), system section (Transfer, Settlement, not pressable, `systemNote`), Archived section with Restore.

## Review follow-ups applied
- Item 7: toasts take the hook's step id directly; the 02-17 category hooks never return null, so every toast offers Undo for a real step only.
- 02-17 `merge-too-large`: usage capped above 6000 disables Merge (the write would be refused) and shows a note; Archive stays available.

## Deviations from Plan
1. **[Rule 2] Capped merge guard and copy.** Added `categories.mergeTooLarge` to `en.ts` and disabled Merge when `useCategoryUsage` reports `capped`, rather than letting the merge fail server-side.
2. **Per-row usage count not shown on the list.** `useCategoryUsage` is a per-category query and cannot run per list row; the count appears only in the removal prompt (the plan's focal point is name + glyph, so usage was optional).
3. **Restore toast label** uses `categoryEdited`, matching what the 02-17 `restore()` step records.
4. **Process:** `node_modules` was absent, so `npm ci --legacy-peer-deps` was run; the first test run failed on a jest.mock out-of-scope variable (renamed to `mock*`) before the genuine RED (missing module).

## Verification
`npx jest src/features/record/categories src/i18n` green (12 category tests; i18n catalogue tests pass), `npm run typecheck`, `npm run depcruise`, `npx eslint src/features/record/categories` clean. No hex literals in the new components. No haptics used.

## Known Stubs
None. The screen is not yet wired to a route (navigation is Phase 3 / later plans).

## Self-Check: PASSED
