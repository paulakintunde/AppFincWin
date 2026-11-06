-- 05.4 D-62 / D-63: widen decide_shadow_runs.variant for the two new variants. Additive (constraint widened only).
-- extra_savings: "Fits from extra savings" on fits_unspent (D-62). month_already_short: "No: your month is already short",
-- on any code but needs_input (D-63). Keep in step with VARIANTS in src/engine/decide/v3/__tests__/rightAnswers/schema.ts.
-- Files only: the push is owner-gated (05.4-PRODUCTION-LOG.md).

alter table public.decide_shadow_runs drop constraint if exists decide_shadow_runs_variant_check;
alter table public.decide_shadow_runs add constraint decide_shadow_runs_variant_check
  check (variant is null or variant in ('payday', 'not_covered', 'low_month', 'tight', 'protection_off',
    'not_cleared', 'no_net', 'small_net', 'costly_debt', 'borrowing_costs_more', 'extra_savings', 'month_already_short'));
