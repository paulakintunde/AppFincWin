-- 05.5 Band B (contract), ARC-09: recopy the switched-on Decide category_cap rules into categories.monthly_cap once more,
-- filling only EMPTY caps (users may have added rules since Band A's 20261113000100 run). 20261121000300 then removes the
-- category_cap entries and retires the function. NOTICE lines carry counts only.
do $$
declare r record;
begin
  for r in select * from public.decide_copy_rule_caps() loop
    raise notice 'decide_copy_rule_caps recopy % filled=% clash=% same=% off=% category=% currency=%',
      r.class, r.filled, r.clash, r.same, r.skipped_off, r.skipped_category, r.skipped_currency;
  end loop;
end $$;
