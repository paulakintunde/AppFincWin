-- 05.4 D-65: widen decide_shadow_runs.variant for the three tiers when the usual month is already short. Additive (constraint
-- widened only). month_short_small: "Fits, but your month is already short"; month_short_moderate: "Fits from spare money, but
-- your month is already short"; month_short_moderate_extra: "Fits from extra savings, but your month is already short" (cash fits
-- only; month_already_short stays the Large tier, D-63). Keep in step with VARIANTS in
-- src/engine/decide/v3/__tests__/rightAnswers/schema.ts.
-- Files only: the push is owner-gated (05.4-PRODUCTION-LOG.md).

alter table public.decide_shadow_runs drop constraint if exists decide_shadow_runs_variant_check;
alter table public.decide_shadow_runs add constraint decide_shadow_runs_variant_check
  check (variant is null or variant in ('payday', 'not_covered', 'low_month', 'tight', 'protection_off',
    'not_cleared', 'no_net', 'small_net', 'costly_debt', 'borrowing_costs_more', 'extra_savings', 'month_already_short',
    'month_short_small', 'month_short_moderate', 'month_short_moderate_extra'));
