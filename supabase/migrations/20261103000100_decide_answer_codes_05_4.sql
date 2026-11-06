-- 05.4 M1: widen answer_v3 codes for the caution answers. Additive (constraint widened only).
-- Same shape rules as 20261030000100 (object, size under 4096 bytes); four codes added to the six already allowed:
-- fits_uses_net, fits_uses_overdraft, fits_by_borrowing, fits_on_your_answer.

alter table public.decide_checks drop constraint if exists decide_checks_answer_v3_shape;
alter table public.decide_checks add constraint decide_checks_answer_v3_shape
  check (answer_v3 is null or (jsonb_typeof(answer_v3) = 'object'
    and answer_v3 ->> 'code' in ('needs_input', 'not_yet', 'monthly_short', 'emergency_use', 'fits_unspent', 'fits_month',
      'fits_uses_net', 'fits_uses_overdraft', 'fits_by_borrowing', 'fits_on_your_answer')
    and pg_column_size(answer_v3) < 4096));
