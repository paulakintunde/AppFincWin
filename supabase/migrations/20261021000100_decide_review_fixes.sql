-- Phase 5 code review fixes (05-REVIEW Part A, 2026-10-21). One additive migration: the six Phase 5 migrations
-- (20261016000100..000400) are live and are not edited. Each section names the finding it fixes.
--   1. CR-A01  decide_settings: UPDATE on user_id, so the client's upsert passes the column-privilege check.
--   2. WR-A01  guard_decide_check / guard_debt / guard_savings_goal let NULL through, so ON DELETE SET NULL
--              lands; plus a one-off repair of links that were already left dangling.
--   3. WR-A08  record_decide_outcome moves a past ready_by to today instead of refusing a late replay.
--   4. WR-A02  record_decide_go overload taking the rows themselves (p_rows jsonb), so Go ahead is ONE
--              transaction: a refusal leaves no row behind (also CR-C02's "refused after the rows landed").
--   5. CR-D02  statement_periods.import_batch_id and the statement_periods_live view: a period counts only while
--              the import that stated it still has a live line, so an undone or refused import leaves no
--              complete month behind.
--   6. IN-B05  decide_checks_reopened_once: a decision has at most one live reopened check (after clearing the link
--              on any extra ones already there), so two devices cannot each reopen it.

-- 1. CR-A01 -------------------------------------------------------------------------------------------------
-- PostgREST sends upsert as INSERT .. ON CONFLICT (user_id) DO UPDATE SET user_id = excluded.user_id, ..., and
-- Postgres checks UPDATE privilege on every column of that SET list when the statement starts. user_id had no
-- update grant, so every save failed with 42501. The grant is safe: fill_decide_settings (20261016000100) pins
-- user_id to auth.uid() on insert and update and clears seeded unless seed_sample_data is running, and RLS pins
-- the row to its owner. seeded still has no client grant, so it stays server-managed.
grant update (user_id) on public.decide_settings to authenticated;

-- 2. WR-A01 -------------------------------------------------------------------------------------------------
-- debts.check_id, savings_goals.check_id and decide_checks.reopened_from are ON DELETE SET NULL. Postgres runs that
-- action as an UPDATE, the guards fire on it, and they used to put the old value back, leaving a link to a check
-- that no longer exists. No client grant or apply_patches path writes these columns, so a NULL only ever comes
-- from the foreign-key action: it is let through. Any other change is still put back.
create or replace function public.guard_decide_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id;
  new.household_id := old.household_id;
  new.created_at := old.created_at;
  if new.reopened_from is not null then new.reopened_from := old.reopened_from; end if;  -- WR-A01
  new.is_sample := old.is_sample;
  -- an ON DELETE SET NULL / cascade from auth.users may touch created_by; nothing else may change it
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.updated_at := now();
  if old.status <> 'open' and (
       new.inputs is distinct from old.inputs
       or new.name is distinct from old.name
       or new.furthest_step is distinct from old.furthest_step
       or new.kind is distinct from old.kind) then
    raise exception 'decide_checks: a decided check is read-only' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_decide_check() from public, anon, authenticated;

create or replace function public.guard_debt()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.account_id is not null and not exists (
       select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id) then
    raise exception 'debts: account is not in this household' using errcode = '42501';
  end if;
  if new.series_id is not null and not exists (
       select 1 from public.recurring_series s where s.id = new.series_id and s.household_id = new.household_id) then
    raise exception 'debts: series is not in this household' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.household_id := old.household_id;
    new.created_at := old.created_at;
    new.is_sample := old.is_sample;
    if new.created_by is not null then new.created_by := old.created_by; end if;
    if coalesce(current_setting('fincwin.decide_rpc', true), '') <> 'on' and new.check_id is not null then  -- WR-A01
      new.check_id := old.check_id;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_debt() from public, anon, authenticated;

create or replace function public.guard_savings_goal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
    return new;
  end if;
  new.id := old.id;
  new.household_id := old.household_id;
  new.created_at := old.created_at;
  new.is_sample := old.is_sample;
  if new.created_by is not null then new.created_by := old.created_by; end if;
  if coalesce(current_setting('fincwin.decide_rpc', true), '') <> 'on' then
    if new.check_id is not null then new.check_id := old.check_id; end if;  -- WR-A01
    new.name := old.name;
    new.currency := old.currency;
    new.target := old.target;
    new.monthly_amount := old.monthly_amount;
    new.ready_by := old.ready_by;
    new.opening_saved := old.opening_saved;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.guard_savings_goal() from public, anon, authenticated;

-- The one-off repair: clears every link the old guards left pointing at a check that is gone. A function so the
-- pgTAP suite can prove it; no client can call it. Returns the number of rows it cleared.
create or replace function public.repair_decide_orphan_links()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer;
  v_total integer := 0;
begin
  update public.debts d
     set check_id = null
   where d.check_id is not null
     and not exists (select 1 from public.decide_checks c where c.id = d.check_id);
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  update public.savings_goals g
     set check_id = null
   where g.check_id is not null
     and not exists (select 1 from public.decide_checks c where c.id = g.check_id);
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  update public.decide_checks k
     set reopened_from = null
   where k.reopened_from is not null
     and not exists (select 1 from public.decide_checks c where c.id = k.reopened_from);
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  return v_total;
end;
$$;
revoke execute on function public.repair_decide_orphan_links() from public, anon, authenticated;

select public.repair_decide_orphan_links();

-- 3. WR-A08 -------------------------------------------------------------------------------------------------
-- A Wait saved offline can replay days later. A ready-by date that has passed by then used to be refused (22023),
-- so the decision and its goal were lost. It is now moved to today. Otherwise the same as 20261016000300.
create or replace function public.record_decide_outcome(p_check_id uuid, p_outcome text, p_decision jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check public.decide_checks%rowtype;
  v_target_status text;
  v_cooling boolean := false;
  v_wait_monthly bigint;
  v_ready_by date;
  v_goal jsonb;
begin
  if p_outcome is null or p_outcome not in ('wait', 'pass') then
    raise exception 'record_decide_outcome: the outcome must be wait or pass' using errcode = '22023';
  end if;
  v_target_status := case p_outcome when 'wait' then 'waiting' else 'passed' end;

  select * into v_check from public.decide_checks where id = p_check_id and deleted_at is null for update;
  if not found
     or v_check.created_by is distinct from (select auth.uid())
     or v_check.household_id not in (select public.user_household_ids()) then
    raise exception 'record_decide_outcome: the check is not yours' using errcode = '42501';
  end if;

  -- A replay of the same outcome is success; any other decided state is refused.
  if v_check.status = v_target_status then
    return jsonb_build_object('status', 'already-applied');
  end if;
  if v_check.status <> 'open' then
    raise exception 'record_decide_outcome: the check is already decided' using errcode = '22023';
  end if;

  if jsonb_typeof(p_decision) is distinct from 'object'
     or coalesce(p_decision ->> 'verdict', '') not in ('fits', 'adjust', 'no', 'missing') then
    raise exception 'record_decide_outcome: p_decision is malformed' using errcode = '22023';
  end if;
  if p_decision ? 'cooling_off' and jsonb_typeof(p_decision -> 'cooling_off') is distinct from 'boolean' then
    raise exception 'record_decide_outcome: cooling_off must be a boolean' using errcode = '22023';
  end if;
  v_cooling := coalesce((p_decision ->> 'cooling_off')::boolean, false);

  v_goal := case when jsonb_typeof(p_decision -> 'goal') = 'null' then null else p_decision -> 'goal' end;
  if p_outcome = 'pass' and v_goal is not null then
    raise exception 'record_decide_outcome: a pass has no goal' using errcode = '22023';
  end if;

  if p_outcome = 'wait' then
    if jsonb_typeof(p_decision -> 'wait_monthly') is distinct from 'number'
       or coalesce(p_decision ->> 'wait_monthly', '') !~ '^[0-9]{1,14}$'
       or (p_decision ->> 'wait_monthly')::bigint > 10000000000000 then
      raise exception 'record_decide_outcome: wait_monthly must be an integer within bounds' using errcode = '22023';
    end if;
    v_wait_monthly := (p_decision ->> 'wait_monthly')::bigint;
    begin
      v_ready_by := nullif(p_decision ->> 'ready_by', '')::date;
    exception when others then
      raise exception 'record_decide_outcome: ready_by must be a date' using errcode = '22023';
    end;
    -- WR-A08: a late replay keeps its decision; a date that has passed becomes today.
    if v_ready_by is not null and v_ready_by < current_date then
      v_ready_by := current_date;
    end if;
    if v_goal is not null then
      if jsonb_typeof(v_goal) is distinct from 'object'
         or char_length(btrim(coalesce(v_goal ->> 'name', ''))) not between 1 and 80
         or coalesce(v_goal ->> 'currency', '') !~ '^[A-Z0-9]{2,4}$'
         or jsonb_typeof(v_goal -> 'target') is distinct from 'number'
         or coalesce(v_goal ->> 'target', '') !~ '^[0-9]{1,14}$'
         or (v_goal ->> 'target')::bigint not between 1 and 10000000000000 then
        raise exception 'record_decide_outcome: the goal is malformed' using errcode = '22023';
      end if;
      begin
        perform (v_goal ->> 'id')::uuid;
      exception when others then
        raise exception 'record_decide_outcome: the goal id must be a uuid' using errcode = '22023';
      end;
      if (v_goal ->> 'id') is null then
        raise exception 'record_decide_outcome: the goal id must be a uuid' using errcode = '22023';
      end if;
    end if;
  end if;

  perform set_config('fincwin.decide_rpc', 'on', true);

  update public.decide_checks
     set status = v_target_status,
         decided_at = now(),
         verdict_at_decision = p_decision ->> 'verdict',
         wait_monthly = case when p_outcome = 'wait' then v_wait_monthly else null end,
         ready_by = case when p_outcome = 'wait' then v_ready_by else null end,
         cooling_off_at = case when v_cooling then now() + interval '48 hours' else null end
   where id = p_check_id;

  -- D-34 (amends D-10): Wait also creates its savings goal in the same call.
  if p_outcome = 'wait' and v_goal is not null then
    insert into public.savings_goals (id, household_id, created_by, check_id, name, currency, target, monthly_amount, ready_by)
    values ((v_goal ->> 'id')::uuid, v_check.household_id, (select auth.uid()), p_check_id,
            btrim(v_goal ->> 'name'), v_goal ->> 'currency', (v_goal ->> 'target')::bigint,
            v_wait_monthly, v_ready_by)
    on conflict (id) do nothing;
  end if;

  perform set_config('fincwin.decide_rpc', '', true);
  return jsonb_build_object('status', 'applied');
end;
$$;
revoke execute on function public.record_decide_outcome(uuid, text, jsonb) from public, anon;
grant execute on function public.record_decide_outcome(uuid, text, jsonb) to authenticated;

-- 4. WR-A02 -------------------------------------------------------------------------------------------------
-- Go ahead used to insert its rows in one request and call record_decide_go in a second; a refusal of the second
-- (already decided, a replaced series that moved, a malformed debt) left the rows written with no decision and no
-- undo. This overload takes the rows themselves and inserts them inside the same transaction, then hands their ids
-- to the row-id overload (20261016000300), which does every other check and write. Any refusal rolls the rows
-- back with everything else.
--
-- Client contract (src/db/decideOutcomes.ts):
--   record_decide_go(p_check_id uuid, p_rows jsonb, p_series jsonb, p_end_series jsonb, p_debt jsonb,
--                    p_decision jsonb, p_undo_step jsonb) -> {status:'applied'|'already-applied', undo_step_id}
--   p_rows: array 0..60 of transaction payloads with only these keys: id (required), household_id (must be the
--   check's), account_id, original_amount, original_currency, local_date, time_zone, note, name, category_id,
--   payment_type, status, transfer_id, one_off. Every other argument is as in the row-id overload; row_roles
--   follow p_rows' order.
--
-- What the client's own insert enforced, enforced here: the row's household is the check's (a household of the
-- caller, checked under lock), created_by is the caller, only client-insertable columns are written, the account
-- must be in that household (the composite foreign key), and every row trigger (currency, time zone, category
-- owner, FX stamp, transfer pair) still runs. Replay (same step id) returns 'already-applied' before any row is
-- written. A row id that already exists is skipped by ON CONFLICT and then has to pass the row-id overload's
-- "a new row of the caller" check, so a queue entry from the old two-request client still completes.
create or replace function public.record_decide_go(
  p_check_id uuid,
  p_rows jsonb,
  p_series jsonb,
  p_end_series jsonb,
  p_debt jsonb,
  p_decision jsonb,
  p_undo_step jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step_id uuid;
  v_check public.decide_checks%rowtype;
  v_item jsonb;
  v_row public.transactions%rowtype;
  v_ids uuid[] := '{}'::uuid[];
  v_bad_key text;
begin
  -- 1. The undo step, and a replay of the action that already landed (D-WR-03): nothing is written.
  if jsonb_typeof(p_undo_step) is distinct from 'object' then
    raise exception 'record_decide_go: p_undo_step must be an object' using errcode = '22023';
  end if;
  begin
    v_step_id := (p_undo_step ->> 'id')::uuid;
  exception when others then
    raise exception 'record_decide_go: p_undo_step.id must be a uuid' using errcode = '22023';
  end;
  if v_step_id is null then
    raise exception 'record_decide_go: p_undo_step.id must be a uuid' using errcode = '22023';
  end if;
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = (select auth.uid())) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
  end if;

  -- 2. The check: the caller's own, still open, locked before any row is written.
  select * into v_check from public.decide_checks where id = p_check_id and deleted_at is null for update;
  if not found
     or v_check.created_by is distinct from (select auth.uid())
     or v_check.household_id not in (select public.user_household_ids()) then
    raise exception 'record_decide_go: the check is not yours' using errcode = '42501';
  end if;
  if v_check.status <> 'open' then
    raise exception 'record_decide_go: the check is already decided' using errcode = '22023';
  end if;

  -- 3. The rows.
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 60 then
    raise exception 'record_decide_go: p_rows must be an array of at most 60' using errcode = '22023';
  end if;
  for v_item in
    select e.value from jsonb_array_elements(p_rows) with ordinality as e(value, ord) order by e.ord
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'record_decide_go: each row must be an object' using errcode = '22023';
    end if;
    select k into v_bad_key
      from jsonb_object_keys(v_item) as k
     where k not in ('id', 'household_id', 'account_id', 'original_amount', 'original_currency', 'local_date',
                     'time_zone', 'note', 'name', 'category_id', 'payment_type', 'status', 'transfer_id', 'one_off')
     limit 1;
    if v_bad_key is not null then
      raise exception 'record_decide_go: a row cannot write %', v_bad_key using errcode = '42501';
    end if;
    begin
      select * into strict v_row from jsonb_populate_record(null::public.transactions, v_item);
    exception when others then
      raise exception 'record_decide_go: a row is malformed' using errcode = '22023';
    end;
    if v_row.id is null then
      raise exception 'record_decide_go: each row needs an id' using errcode = '22023';
    end if;
    if v_item ? 'household_id' and v_row.household_id is distinct from v_check.household_id then
      raise exception 'record_decide_go: a row is in another household' using errcode = '42501';
    end if;
    insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency,
                                     local_date, time_zone, note, name, category_id, payment_type, status,
                                     transfer_id, one_off)
    values (v_row.id, v_check.household_id, (select auth.uid()), v_row.account_id, v_row.original_amount,
            v_row.original_currency, v_row.local_date, v_row.time_zone, v_row.note, v_row.name, v_row.category_id,
            v_row.payment_type, coalesce(v_row.status, 'paid'), v_row.transfer_id, coalesce(v_row.one_off, false))
    on conflict (id) do nothing;
    v_ids := v_ids || v_row.id;
  end loop;

  -- 4. Everything else, in this same transaction: a refusal there undoes the inserts above.
  return public.record_decide_go(p_check_id, v_ids, p_series, p_end_series, p_debt, p_decision, p_undo_step);
end;
$$;
revoke execute on function public.record_decide_go(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.record_decide_go(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- 5. CR-D02 -------------------------------------------------------------------------------------------------
-- A stated statement period tells Decide that the months it covers are complete. It was recorded as its own write,
-- so undoing the import (which soft-deletes the batch's lines) or a refused import left the period behind, and Decide
-- counted empty months as complete. The period now carries the import's batch id, and Decide reads the
-- statement_periods_live view: a period with a batch counts only while some line of that batch is live. Undo, a
-- refused import and a later delete of every line all take the period out with no extra write. A period with no batch
-- (recorded before this column) still counts. The unique key gains the batch, so re-importing the same statement after
-- an undo records its own period instead of colliding with the dead one.
alter table public.statement_periods add column import_batch_id uuid;
grant insert (import_batch_id) on public.statement_periods to authenticated;

drop index public.statement_periods_unique;
create unique index statement_periods_unique on public.statement_periods
  (household_id, account_id, period_start, period_end, import_batch_id) nulls not distinct;

create view public.statement_periods_live
  with (security_invoker = true) as
  select p.id, p.household_id, p.account_id, p.period_start, p.period_end, p.import_batch_id
  from public.statement_periods p
  where p.import_batch_id is null
     or exists (
       select 1 from public.transactions t
       where t.import_batch_id = p.import_batch_id
         and t.household_id = p.household_id
         and t.deleted_at is null);
revoke all on public.statement_periods_live from anon, authenticated;
grant select on public.statement_periods_live to authenticated;

-- 6. IN-B05 -------------------------------------------------------------------------------------------------
-- Past decisions' Reopen writes a new open check with reopened_from = the decision. The client opens the live check
-- already reopened from a decision instead of writing another (7f29155b), but two devices could still each reopen it
-- once. A partial unique index makes it one live reopened check per decision; a soft-deleted one frees the decision to
-- be reopened again. Before the index, any extra live checks reopened from the same decision keep everything but the
-- link: the oldest (created_at, then id) stays the reopened check and the others become ordinary open checks. Nothing
-- is deleted. The guard lets a NULL reopened_from through (WR-A01, section 2).
with ranked as (
  select id, row_number() over (partition by reopened_from order by created_at, id) as n
  from public.decide_checks
  where reopened_from is not null and deleted_at is null
)
update public.decide_checks c
   set reopened_from = null
  from ranked r
 where c.id = r.id and r.n > 1;

create unique index decide_checks_reopened_once on public.decide_checks (reopened_from)
  where reopened_from is not null and deleted_at is null;
