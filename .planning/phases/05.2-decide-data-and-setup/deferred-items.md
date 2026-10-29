# Deferred items (05.2)

## Found during 05.2-19

- `src/features/decide/onboarding/__tests__/onboarding.test.tsx` "CR-B01: figures in a new currency clear the other stored money columns" fails on the branch before 05.2-19 (checked at b794e881). The rough-figures clear patch now also nulls the 05.2 money columns (everyday_override, reserve_goal, rough_debt, rough_invest, rough_saving, steady_amount, unexplained_amount, unspent_anchor), but the test still expects the older seven keys. Out of scope for 19; whoever owns the rough-figures screen (or the plan that widened the clear patch) should update the expectation.
