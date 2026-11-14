-- 05.5 ARC-09 (one cap per category), D-11, D-20. Band A (expand, data): copy the switched-on Decide category_cap rules
-- (decide_settings.custom_options -> rules -> rules[], 06.1 rulesDoc.ts) into categories.monthly_cap, filling only EMPTY caps.
-- Where the category already has a cap, Activity's value stays; the clash is only counted. Push order: see 05.5-GATE.md
-- (Band A before Phase 8's 20261120* migrations). Band B recopies (users may add rules in between) and drops the function.
--
-- Skipped and counted: rules switched off (copying would start checking a limit the user turned off); a category that is
-- missing, not the settings owner's, system, or archived; a value outside 1..10000000000000; a rules currency
-- (decide_settings.currency) that differs from the owner's home currency (caps are home-currency minor units).
-- Two switched-on rules for one category: the smaller value is the one considered, the other counts as a clash.
-- Counts only are reported: no user ids, no amounts.

create or replace function public.decide_copy_rule_caps()
returns table(class text, filled int, clash int, same int, skipped_off int, skipped_category int, skipped_currency int)
language sql
security definer
set search_path = ''
as $$
  with raw as (
    select s.user_id as uid, s.currency as rules_ccy, p.home_currency as home_ccy, e.elem as elem
    from public.decide_settings s
    join public.profiles p on p.id = s.user_id
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.custom_options -> 'rules' -> 'rules') = 'array'
           then s.custom_options -> 'rules' -> 'rules' else '[]'::jsonb end
    ) as e(elem)
    where jsonb_typeof(e.elem) = 'object' and e.elem ->> 'kind' = 'category_cap'
  ),
  parsed as (
    select r.uid, r.rules_ccy, r.home_ccy,
           (r.elem ->> 'on') = 'true' as is_on,
           case when (r.elem ->> 'value') ~ '^[0-9]{1,14}$' then (r.elem ->> 'value')::bigint end as val,
           case when (r.elem ->> 'categoryId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (r.elem ->> 'categoryId')::uuid end as cat_id,
           coalesce(r.elem ->> 'id', '') as rule_id
    from raw r
  ),
  joined as (
    select q.*, c.id as found_id, c.is_system, c.archived_at, c.monthly_cap as cap_before, c.is_sample
    from parsed q
    left join public.categories c on c.id = q.cat_id and c.owner_id = q.uid
  ),
  classified as (
    select j.*,
      row_number() over (
        partition by case when j.st0 = 'live' then j.found_id end order by j.val, j.rule_id
      ) as rn
    from (
      select jj.*,
        case
          when not jj.is_on then 'off'
          when jj.found_id is null or jj.is_system or jj.archived_at is not null
               or jj.val is null or jj.val not between 1 and 10000000000000 then 'category'
          when jj.rules_ccy is not null and jj.rules_ccy <> jj.home_ccy then 'currency'
          else 'live'
        end as st0
      from joined jj
    ) j
  ),
  upd as (
    update public.categories c
       set monthly_cap = x.val
      from classified x
     where x.st0 = 'live' and x.rn = 1 and c.id = x.found_id and c.monthly_cap is null
    returning c.id
  ),
  outcome as (
    select case when k.is_sample then 'sample' else 'all' end as cls,
      case
        when k.st0 <> 'live' then k.st0
        when k.rn = 1 and k.cap_before is null then 'filled'
        when k.rn = 1 and k.cap_before = k.val then 'same'
        else 'clash'
      end as res
    from classified k
  )
  select o.cls,
    (count(*) filter (where o.res = 'filled'))::int,
    (count(*) filter (where o.res = 'clash'))::int,
    (count(*) filter (where o.res = 'same'))::int,
    (count(*) filter (where o.res = 'off'))::int,
    (count(*) filter (where o.res = 'category'))::int,
    (count(*) filter (where o.res = 'currency'))::int
  from outcome o
  group by o.cls
$$;

revoke all on function public.decide_copy_rule_caps() from public, anon, authenticated;

-- First run. NOTICE lines carry counts only.
do $$
declare r record;
begin
  for r in select * from public.decide_copy_rule_caps() loop
    raise notice 'decide_copy_rule_caps % filled=% clash=% same=% off=% category=% currency=%',
      r.class, r.filled, r.clash, r.same, r.skipped_off, r.skipped_category, r.skipped_currency;
  end loop;
end $$;
