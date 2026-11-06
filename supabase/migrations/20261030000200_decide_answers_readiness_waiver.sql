-- 05.3 D-28: readiness answers are owner-private and are erased with the account; adds the readiness_waiver kind; additive.
--   readiness_waiver key (one of)                              on_date only           the user's answer to a readiness question
--     paid-by-other:<series uuid>:<YYYY-MM-DD>   someone else paid this one occurrence
--     didnt-happen:<series uuid>:<YYYY-MM-DD>    this occurrence did not happen
--     no-pay:<series uuid>:<YYYY-MM-DD>          this pay did not come
--     always-other:<series uuid>                 someone else always pays this bill
--     income-elsewhere                           my money comes from elsewhere
--     nothing-to-add:<YYYY-MM> / month-complete:<YYYY-MM> / start-from:<YYYY-MM>
-- The key regex matches src/features/decide/snapshot/v3/waiverKeys.ts (05.3-54) exactly.
-- decide_answers is already owner-only (RLS created_by = auth.uid()) and created_by cascades on user delete, so
-- only the kind and shape checks change. Both are widened (every existing row still passes): dropped, re-added
-- not valid, then validated. No grant, policy, trigger or index changes.

alter table public.decide_answers drop constraint if exists decide_answers_kind_check;

alter table public.decide_answers
  add constraint decide_answers_kind_check
  check (kind in ('pay_arrival', 'expected_income', 'held_bridge', 'volatile_cover', 'readiness_waiver')) not valid;

alter table public.decide_answers validate constraint decide_answers_kind_check;

alter table public.decide_answers drop constraint if exists decide_answers_shape;

alter table public.decide_answers
  add constraint decide_answers_shape check (
    (kind = 'pay_arrival' and bool_value is not null and on_date is not null and amount is null and check_id is null
       and key ~ '^[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$')
    or (kind = 'expected_income' and amount is not null and on_date is not null and bool_value is null and check_id is null
       and key ~ '^\d{4}-\d{2}$')
    or (kind = 'held_bridge' and amount is not null and check_id is not null and key = check_id::text and bool_value is null)
    or (kind = 'volatile_cover' and bool_value is not null and check_id is not null and key = check_id::text and amount is null)
    or (kind = 'readiness_waiver' and on_date is not null and amount is null and bool_value is null and check_id is null
       and key ~ '^(paid-by-other|didnt-happen|no-pay):[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$|^always-other:[0-9a-f-]{36}$|^income-elsewhere$|^(nothing-to-add|month-complete|start-from):\d{4}-\d{2}$')
  ) not valid;

alter table public.decide_answers validate constraint decide_answers_shape;
