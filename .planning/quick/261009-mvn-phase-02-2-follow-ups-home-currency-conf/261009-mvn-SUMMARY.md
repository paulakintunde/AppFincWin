---
phase: quick-261009-mvn
plan: 01
status: complete
requirements: [REC-25, REC-19, REC-21]
---
# Quick 261009-mvn: Phase 02.2 follow-ups

Home-currency version conflict now shows an inline line; Activity More menu shows no fake selected row; failed-write records name the real table.

## Commits
- 3f036a0: home-currency sheet stays open with `you.homeCurrency.changedElsewhere` on 'changed'
- a69ffaa: Dropdown action-menu mode (optional `value`, `triggerLabel`); MoreMenu uses it
- decaafd: WriteEntity gains 'households' and 'dismissed_series_offers'; addMonth records households/householdId, dismissOffers records dismissed_series_offers

## Notes
- recordPrefs verified to write `profiles`; left unchanged.
- Deviations: none.

## Verification
- typecheck: clean. lint: 0 errors (369 pre-existing warnings).
- Full jest --coverage --ci: 215 suites, 5818 tests passed, no threshold failures.
