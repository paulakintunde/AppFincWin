---
phase: 05-decide-ui
plan: 88
subsystem: copy
tags: [copy, i18n, info-terms, decide, R16, D-85..D-93]
requires: [05-87]
provides:
  - INFO_KEYS at 59 (interestSaved, instalmentFrequency, impliedApr, cardCheckLimit); itemType and onCard updated
  - InfoDynamic.onCard and InfoDynamic.cardCheckLimit with fallback bodies (no raw placeholder)
  - every R16 string in en.ts (You Add group, deposit interest, frequency and M6 table, card limit, item-type notes, running-cost rows, sync waiting, over-50-years)
affects: [05-89, 05-90, 05-109]
key-files:
  modified:
    - src/i18n/locales/en.ts
    - src/i18n/copyStatus.ts
    - src/features/decide/copy/infoTerms.ts
    - src/features/decide/copy/__tests__/infoTerms.test.ts
decisions:
  - "The no-rate note is a lead per frequency (instNoRate.*) plus one rate clause (instRateAbout / Above / Zero / Below); a test pins lead + about to the spec table text"
  - "Folded summaries are instSummary.{freq} plus instSummaryNoRate / instSummaryRate / instSummaryFirst; _one/_other carry identical text because the count is followed by a multiplication sign, not a unit"
  - "The _one forms of the Yes-rate note drop 'the first' (a single payment has no first)"
requirements: [DCU-25, DCU-31, DCU-32, SYN-06, DCU-09]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 88: R16 copy Summary

All R16 strings exist before the R16 UI plans, and INFO_TERMS grows to 59 keys with the card-limit USD-home variant and cap fallbacks.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. R16 info entries | c77586e3 | 4 new keys; `onCard` (cap / `bodyNoCap`) and `cardCheckLimit` (`body`, `bodyUsdHome`, `bodyNoLimit`) pick variants in `infoCopy`; table test proves no raw placeholder |
| 2. R16 strings, M6 table, sync, plurals | 82302108 | keys below; copyStatus tracks them |

## Key names (for the UI plans)

- `you.add.{section, expense, income, transfer, importStatement, newCheck}` and `…Hint` for each.
- `sync.saving`, `sync.waiting_one/_other`, `sync.offlineWaiting_one/_other` (old `queued` keys stay for 05-109).
- `decide.fold.updating`; `decide.verdict.key.over50Years` / `over50YearsA11y`; `decide.fold.preview.setbacksOver50`; `decide.section.setbacksSummaryOver50`.
- `decide.verdict.missing.card_limit_rate_missing`; `decide.pay.card.field.usdRate` (the Needs word "USD rate").
- `decide.item.itemType.{property, cash_equivalent, tuition}`.
- `decide.pay`: `loanInterestSavedByDeposit`, `loanInterestPaid`, `loanSavedLine_one/_other`; `freq.*`; `firstPayment.*`; `when.*`; `instalmentCountRange`; `instNoRate.{freq}_one/_other`; `instRateAbout/Above/Zero/Below`; `instRate.{freq}_one/_other`; `instSummary.{freq}_one/_other`, `instSummaryNoRate/Rate/First`; `cardLimitBody`, `cardLimitNote`, `cardLimitBasis`; `cardNote.{property, cash_equivalent, tuition_fee, tax_processing_fee, tax_gb}`.
- `decide.depth.running`: `amountPlaceholder`, `amountFieldA11y`, `rowA11yEmpty`, `rowA11yCounted`, `notCounted`, `propertyTax`, `homeInsurance`, `utilities`, `serviceCharge`, `booksMaterials`, `travel`, `accommodation`.

## Verification

- `npx jest src/features/decide src/i18n`: 106 + 9 suites pass; DCU-09 guards, catalogue and draft-copy tests pass.
- Named tests present: `D-84 / R16 INFO_TERMS has 59 keys`, `R16 the card limit explanation has a USD-home variant`, `R16 the On a card explanation falls back without a cap`, `R16 no rendered explanation contains a raw placeholder`, `D-85..D-93 R16 strings resolve`.
- eslint on `src/i18n` and `src/features/decide/copy`: 0 errors (1 pre-existing warning in `src/i18n/index.ts`).
- `npm run typecheck`: one error, in `src/shell/fab/__tests__/FabProvider.test.tsx` (another plan's in-flight work), none in this plan's files.

## Deviations from Plan

**1. [Rule 3 - Blocking] copyStatus.ts updated**
- The draft-copy tests require every `decide.*` leaf (automatic) and each `sync.*` key (listed by hand) in `DRAFT_COPY_KEYS`. Added the 5 sync keys and `leafPaths('you.add', …)`. File is outside the plan's list.
- Commit: 82302108.

Otherwise the plan ran as written. No Supabase calls.

## Notes for later plans

- `decide.pay.cardBlockedBody` still lists "tax" as blocked; 05-109 retires it once tax is region-aware.
- The mid-sentence "Updating" key lives at `decide.fold.updating`.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-88: none beyond reading each new string once on the Pixel when its UI plan lands.

## Known Stubs

None. The strings are unreferenced by UI until the R16 UI plans.

## Self-Check: PASSED
