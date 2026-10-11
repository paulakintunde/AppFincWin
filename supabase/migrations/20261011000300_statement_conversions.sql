-- IMP-05 statement conversions (CONTEXT D-30 to D-35).
--
-- The account-currency original_amount stays the stored truth. A statement
-- line may also carry the foreign amount and currency the statement printed
-- (stmt_orig_*), written once at insert. conversion_source records where the
-- conversion came from and is a STORED GENERATED column: nothing, client or
-- server, can write it, and existing rows take their value from the column
-- definition. There is deliberately no backfill and no UPDATE of existing
-- rows: an UPDATE would bump version, clear is_sample and, under
-- fincwin.system_restamp, make stamp_fx_rate re-rate every market-stamped line.
-- This migration is additive only.

-- Adding a stored generated column rewrites the table once under an ACCESS
-- EXCLUSIVE lock. That is acceptable at the current table size.
alter table public.transactions
  add column stmt_orig_amount bigint check (stmt_orig_amount is null or (stmt_orig_amount <> 0 and abs(stmt_orig_amount) <= 10000000000000)),
  add column stmt_orig_currency text check (stmt_orig_currency is null or stmt_orig_currency ~ '^[A-Z0-9]{2,4}$'),
  add column fx_fee_of uuid,
  add column conversion_source text generated always as (
    case
      when stmt_orig_amount is not null then 'statement'
      when rate_source in ('frankfurter-v2', 'open-er-api') then 'market'
      else null
    end
  ) stored;

alter table public.transactions
  add constraint transactions_stmt_conversion_shape check (
    (stmt_orig_amount is null) = (stmt_orig_currency is null)
    and (stmt_orig_amount is null or (sign(stmt_orig_amount) = sign(original_amount) and stmt_orig_currency <> original_currency))
  ),
  add constraint transactions_fx_fee_not_self check (fx_fee_of is null or fx_fee_of <> id);

create index transactions_fx_fee_of_idx on public.transactions (fx_fee_of) where fx_fee_of is not null;

comment on column public.transactions.stmt_orig_amount is
  'Insert-only provenance: the foreign amount the statement printed (signed minor units). Cleared server-side when original_amount or original_currency is edited.';
comment on column public.transactions.stmt_orig_currency is
  'Insert-only provenance: the foreign currency the statement printed. Cleared with stmt_orig_amount on an amount or currency edit.';
comment on column public.transactions.conversion_source is
  'Generated: statement | market | null. Never written by any role.';
comment on column public.transactions.fx_fee_of is
  'Insert-only link from a fee line to its purchase. No FK, like transfer_id: import chunks may insert a fee before its purchase and RLS hides other households'' rows.';

-- Edit trigger: stale statement figures are cleared when the amount or
-- currency changes. Touches only stmt_orig_*; never a stamp column, so
-- stamp_fx_rate (which never reads stmt_orig_*) cannot re-rate because of it.
create or replace function public.clear_stmt_conversion_on_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.original_amount is distinct from old.original_amount
     or new.original_currency is distinct from old.original_currency then
    new.stmt_orig_amount := null;
    new.stmt_orig_currency := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.clear_stmt_conversion_on_edit() from public, anon, authenticated;

create trigger clear_stmt_conversion_on_edit before update of original_amount, original_currency on public.transactions
  for each row execute function public.clear_stmt_conversion_on_edit();

-- clear_sample_on_edit with conversion_source excluded from its comparison.
-- Generated columns are not computed in NEW inside BEFORE triggers, so it
-- would otherwise differ from OLD on every update and clear the sample flag.
create or replace function public.clear_sample_on_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not old.is_sample or coalesce(current_setting('fincwin.system_restamp', true), '') = 'on' then
    return new;
  end if;
  if (to_jsonb(new) - array['deleted_at','version','updated_at','updated_by','is_sample','materialised_through','generation','conversion_source'])
     is distinct from
     (to_jsonb(old) - array['deleted_at','version','updated_at','updated_by','is_sample','materialised_through','generation','conversion_source']) then
    new.is_sample := false;
  end if;
  return new;
end;
$$;

revoke execute on function public.clear_sample_on_edit() from public, anon, authenticated;

-- Re-create the view so the new columns are selectable (select * froze its
-- column list), and re-issue its grants.
create or replace view public.transactions_active
  with (security_invoker = true) as
  select * from public.transactions where deleted_at is null;

revoke all on public.transactions_active from anon, public;
revoke all on public.transactions_active from authenticated;
grant select on public.transactions_active to authenticated;

-- Insert-only. No update grant, and none for conversion_source (generated).
grant insert (stmt_orig_amount, stmt_orig_currency, fx_fee_of) on public.transactions to authenticated;
