-- Transfer pair integrity (D-50, D-51, REC-18, RESEARCH §A5.3).
--
-- A transfer between the user's own accounts is two ordinary transaction
-- rows sharing a transfer_id (the nullable column added by plan 02-07's
-- 20260926000200 migration) -- there is no separate transfer table, so the
-- FX stamp trigger, guard_transaction_currency, household RLS,
-- transactions_active and the undo machinery all apply to each leg
-- unchanged.
--
-- This migration is additive: it adds one new function and one new
-- constraint trigger. No column, type or constraint on an existing column
-- changes (FND-10, Phase 1 D-26/D-27) -- an installed app that has never
-- heard of transfer_id never sets it, so this trigger can only ever reject
-- writes an old app version never makes.
--
-- The rule, checked once per commit for every distinct transfer_id touched
-- by the statement: the group of *active* rows (deleted_at is null)
-- sharing that id is either empty (0, nothing linked) or exactly 2, on two
-- different accounts, in one household, with opposite signs. A lone leg, a
-- third leg, two legs on the same account, two legs with the same sign, or
-- a leg reaching into another household is rejected with 23514, which
-- classifyWriteError already treats as a permanent rejection (a parked
-- failed write), matching every other guard_* function in this codebase.

create or replace function public.check_transfer_pair()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_count integer;
  v_accounts integer;
  v_households integer;
  v_pos integer;
  v_neg integer;
begin
  foreach v_id in array array_remove(array[
    case when tg_op = 'UPDATE' then old.transfer_id end,
    new.transfer_id
  ], null) loop
    select count(*), count(distinct t.account_id), count(distinct t.household_id),
           count(*) filter (where t.original_amount > 0), count(*) filter (where t.original_amount < 0)
      into v_count, v_accounts, v_households, v_pos, v_neg
      from public.transactions t
     where t.transfer_id = v_id and t.deleted_at is null
       and t.household_id = new.household_id;  -- D-IN-01: household_id never changes on update (accounts are household-bound)

    if v_count = 0 then
      continue;
    end if;

    -- A leg that reaches into another household is still rejected: each
    -- household's group then holds a lone leg, which fails v_count <> 2.
    if v_count <> 2 or v_accounts <> 2 or v_households <> 1 or v_pos <> 1 or v_neg <> 1 then
      raise exception 'transfer pair is incomplete or invalid' using errcode = '23514';
    end if;
  end loop;

  return null;
end;
$$;

revoke execute on function public.check_transfer_pair() from public, anon, authenticated;

-- Deferred so a single multi-row statement (the entry sheet's one
-- insertTransactionsBatch call, or 02-09's all-or-nothing apply_patches RPC
-- linking two existing rows) is checked with both rows already visible, at
-- commit -- never mid-statement when only one row exists yet.
create constraint trigger transfer_pair_check
  after insert or update of transfer_id, deleted_at, account_id, original_amount on public.transactions
  deferrable initially deferred
  for each row execute function public.check_transfer_pair();
